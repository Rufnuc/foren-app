"""Fine-tune the multi-task classifier.

    python train.py --data data/sample.jsonl --output runs/exp1 --epochs 5

Metrics are safety-oriented: alongside macro-F1 we track threat recall and
high-severity recall — the numbers that matter for not missing danger.
"""

import argparse
import json
import os

import numpy as np
from sklearn.metrics import f1_score, recall_score
from transformers import AutoTokenizer, Trainer, TrainingArguments

from dataset import build_datasets, compute_weights, MultiTaskCollator
from model import MultiTaskClassifier
from taxonomy import TAGS, NUM_TAGS, NUM_SEVERITY, TAG_TO_IDX, HIGH_SEVERITY_MIN

# WordPiece multilingual base. Chosen over paraphrase-multilingual-MiniLM
# (SentencePiece) because that tokenizer does NOT round-trip through
# transformers.js in the browser (it drops the ▁ word-boundary marker → wrong
# token ids → wrong predictions), verified on-device. WordPiece matches reliably
# and prunes far more easily to the supported languages.
DEFAULT_BASE = "distilbert-base-multilingual-cased"


def make_compute_metrics():
    threat_idx = TAG_TO_IDX["threat"]
    high_idx = HIGH_SEVERITY_MIN - 1  # severity value 3 -> class index 2

    def compute(eval_pred):
        (tag_logits, sev_logits) = eval_pred.predictions
        (tag_labels, sev_labels) = eval_pred.label_ids

        tag_prob = 1.0 / (1.0 + np.exp(-tag_logits))
        tag_pred = (tag_prob >= 0.5).astype(int)
        tag_true = tag_labels.astype(int)

        sev_pred = sev_logits.argmax(-1)
        sev_true = sev_labels.astype(int)

        return {
            "tag_macro_f1": f1_score(tag_true, tag_pred, average="macro", zero_division=0),
            "tag_micro_f1": f1_score(tag_true, tag_pred, average="micro", zero_division=0),
            "threat_recall": recall_score(
                tag_true[:, threat_idx], tag_pred[:, threat_idx], zero_division=0
            ),
            "severity_acc": float((sev_pred == sev_true).mean()),
            "severity_mae": float(np.abs(sev_pred - sev_true).mean()),
            "high_severity_recall": recall_score(
                (sev_true >= high_idx).astype(int), (sev_pred >= high_idx).astype(int), zero_division=0
            ),
        }

    return compute


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--output", default="runs/exp1")
    ap.add_argument("--base-model", default=DEFAULT_BASE)
    ap.add_argument("--epochs", type=float, default=5)
    ap.add_argument("--lr", type=float, default=2e-5)
    ap.add_argument("--batch", type=int, default=16)
    ap.add_argument("--max-len", type=int, default=128)
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    tok = AutoTokenizer.from_pretrained(args.base_model)
    ds = build_datasets(args.data, tok, max_len=args.max_len, seed=args.seed)
    pos_weight, sev_weight = compute_weights(ds["train"])
    model = MultiTaskClassifier(args.base_model, NUM_TAGS, NUM_SEVERITY, pos_weight, sev_weight)

    targs = TrainingArguments(
        output_dir=args.output,
        num_train_epochs=args.epochs,
        learning_rate=args.lr,
        per_device_train_batch_size=args.batch,
        per_device_eval_batch_size=args.batch,
        eval_strategy="epoch",
        save_strategy="no",
        logging_steps=10,
        seed=args.seed,
        report_to="none",
        # Keep these columns so compute_metrics receives them as label_ids.
        label_names=["tag_labels", "severity_labels"],
    )

    trainer = Trainer(
        model=model,
        args=targs,
        train_dataset=ds["train"],
        eval_dataset=ds["validation"],
        data_collator=MultiTaskCollator(tok),
        compute_metrics=make_compute_metrics(),
    )
    trainer.train()
    print("\nFinal validation:", trainer.evaluate())

    # Save explicitly (plain nn.Module) so evaluate.py / export_onnx.py can reload.
    os.makedirs(args.output, exist_ok=True)
    import torch

    torch.save(trainer.model.state_dict(), os.path.join(args.output, "model_state.pt"))
    tok.save_pretrained(args.output)
    with open(os.path.join(args.output, "foren_config.json"), "w", encoding="utf-8") as f:
        json.dump(
            {"base_model": args.base_model, "num_tags": NUM_TAGS, "num_severity": NUM_SEVERITY, "tags": TAGS},
            f,
            ensure_ascii=False,
            indent=2,
        )
    print("saved to", args.output)


if __name__ == "__main__":
    main()
