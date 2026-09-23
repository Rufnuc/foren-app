"""Detailed evaluation: per-tag, per-language, and threshold suggestions.

    python evaluate.py --model-dir runs/exp1 --data data/sample.jsonl

Per-language matters here: coverage is deliberately uneven (strong en/fr/es,
weaker ar/cy), and this is where you see it. Threshold suggestions favour
recall on high-severity/threat, per the safety design.
"""

import argparse
import json
import os
from collections import defaultdict

import numpy as np
import torch
from sklearn.metrics import f1_score, precision_recall_fscore_support, recall_score
from transformers import AutoTokenizer

from dataset import load_jsonl, encode_labels
from model import MultiTaskClassifier
from taxonomy import TAGS, NUM_TAGS, NUM_SEVERITY, TAG_TO_IDX, HIGH_SEVERITY_MIN


def load_model(model_dir):
    cfg = json.load(open(os.path.join(model_dir, "foren_config.json"), encoding="utf-8"))
    model = MultiTaskClassifier(cfg["base_model"], NUM_TAGS, NUM_SEVERITY)
    state = torch.load(os.path.join(model_dir, "model_state.pt"), map_location="cpu")
    model.load_state_dict(state, strict=False)
    model.eval()
    return model, cfg


@torch.no_grad()
def infer(model, tok, texts, max_len=128, batch=32):
    tag_probs, sev_probs = [], []
    for i in range(0, len(texts), batch):
        enc = tok(
            texts[i : i + batch], truncation=True, max_length=max_len, padding=True, return_tensors="pt"
        )
        out = model(input_ids=enc["input_ids"], attention_mask=enc["attention_mask"])
        tag_probs.append(torch.sigmoid(out["tag_logits"]).cpu().numpy())
        sev_probs.append(torch.softmax(out["severity_logits"], -1).cpu().numpy())
    return np.concatenate(tag_probs), np.concatenate(sev_probs)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model-dir", required=True)
    ap.add_argument("--data", required=True)
    ap.add_argument("--threshold", type=float, default=0.5)
    ap.add_argument("--max-len", type=int, default=128)
    args = ap.parse_args()

    tok = AutoTokenizer.from_pretrained(args.model_dir)
    model, _ = load_model(args.model_dir)

    rows = load_jsonl(args.data)
    texts = [r["text"] for r in rows]
    langs = [r.get("lang", "?") for r in rows]
    tag_true = np.array([encode_labels(r)[0] for r in rows], dtype=int)
    sev_true = np.array([encode_labels(r)[1] for r in rows], dtype=int)

    tag_prob, sev_prob = infer(model, tok, texts, args.max_len)
    tag_pred = (tag_prob >= args.threshold).astype(int)
    sev_pred = sev_prob.argmax(-1)
    high_idx = HIGH_SEVERITY_MIN - 1

    print(f"\n== Overall (threshold {args.threshold}) ==")
    print(f"tag macro-F1     : {f1_score(tag_true, tag_pred, average='macro', zero_division=0):.3f}")
    print(f"tag micro-F1     : {f1_score(tag_true, tag_pred, average='micro', zero_division=0):.3f}")
    print(f"severity acc     : {(sev_pred == sev_true).mean():.3f}   MAE: {np.abs(sev_pred-sev_true).mean():.3f}")
    print(
        f"high-sev recall  : "
        f"{recall_score((sev_true>=high_idx).astype(int), (sev_pred>=high_idx).astype(int), zero_division=0):.3f}"
    )

    print("\n== Per tag (precision / recall / F1 / support) ==")
    p, r, f1, sup = precision_recall_fscore_support(
        tag_true, tag_pred, average=None, labels=range(NUM_TAGS), zero_division=0
    )
    for i, tag in enumerate(TAGS):
        print(f"  {tag:18s} P {p[i]:.2f}  R {r[i]:.2f}  F1 {f1[i]:.2f}  n={int(sup[i])}")

    print("\n== Per language (tag macro-F1 / high-sev recall / n) ==")
    by_lang = defaultdict(list)
    for i, lg in enumerate(langs):
        by_lang[lg].append(i)
    for lg, idx in sorted(by_lang.items()):
        idx = np.array(idx)
        mf1 = f1_score(tag_true[idx], tag_pred[idx], average="macro", zero_division=0)
        hr = recall_score(
            (sev_true[idx] >= high_idx).astype(int), (sev_pred[idx] >= high_idx).astype(int), zero_division=0
        )
        print(f"  {lg:3s}  macro-F1 {mf1:.2f}   high-sev recall {hr:.2f}   n={len(idx)}")

    print("\n== Suggested per-tag thresholds (recall>=0.90 where possible) ==")
    for i, tag in enumerate(TAGS):
        pos = tag_true[:, i] == 1
        if pos.sum() == 0:
            continue
        # lowest threshold reaching 0.9 recall on this set (favour catching, not missing)
        cand = sorted(set(np.round(tag_prob[:, i], 3)))
        chosen = 0.5
        for t in cand:
            rec = recall_score(tag_true[:, i], (tag_prob[:, i] >= t).astype(int), zero_division=0)
            if rec >= 0.90:
                chosen = float(t)
        # heavier bias for the most dangerous tags
        if tag in ("threat", "physical-violence", "sexual"):
            chosen = min(chosen, 0.35)
        print(f"  {tag:18s} {chosen:.2f}")

    print(
        "\nNote: with the tiny sample dataset these numbers are meaningless (it overfits). "
        "The pipeline is what's being verified; real numbers need real data + a proper eval set."
    )


if __name__ == "__main__":
    main()
