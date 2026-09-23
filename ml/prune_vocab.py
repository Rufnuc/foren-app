"""Vocab-prune a trained WordPiece checkpoint to the tokens a corpus actually uses.

Most of a multilingual model's size is the word-embedding matrix (distilbert:
~119k × 768). This slices it to only the vocab that appears in the corpus,
remaps token ids, and rebuilds the tokenizer — cutting the model 2–3×. Tokens
absent from the corpus fall back to [UNK], so pass your FULL training data as the
corpus, not a tiny sample. The tokenizer's normalisation is preserved exactly
(only the vocab/id map changes), so any fully-covered text predicts identically
to the unpruned model.

    python prune_vocab.py --model-dir runs/seed_wp2 --corpus data/seed.jsonl \
        --out-dir runs/pruned
"""

import argparse
import json
import os
import shutil

import torch
import torch.nn as nn
from transformers import AutoTokenizer

from model import MultiTaskClassifier, InferenceWrapper
from taxonomy import TAGS, NUM_TAGS, NUM_SEVERITY, SEVERITY_NAMES


def load_texts(path):
    out = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                out.append(json.loads(line)["text"])
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model-dir", required=True)
    ap.add_argument("--corpus", default="data/seed.jsonl", help="JSONL whose text defines the kept vocab")
    ap.add_argument("--out-dir", required=True)
    ap.add_argument("--opset", type=int, default=14)
    args = ap.parse_args()

    cfg = json.load(open(os.path.join(args.model_dir, "foren_config.json"), encoding="utf-8"))
    tok = AutoTokenizer.from_pretrained(args.model_dir)

    # Tokens the corpus uses + all special tokens.
    used = set()
    for t in load_texts(args.corpus):
        used.update(tok(t, truncation=True, max_length=128)["input_ids"])
    used.update(tok.all_special_ids)
    kept = sorted(used)  # sorted by old id → keeps [PAD]=0 etc. as low new ids
    old2new = {o: i for i, o in enumerate(kept)}
    print(f"vocab {tok.vocab_size} -> {len(kept)} kept ({len(kept) / tok.vocab_size:.1%})")

    # Load model and slice the input embedding to the kept ids.
    model = MultiTaskClassifier(cfg["base_model"], NUM_TAGS, NUM_SEVERITY)
    model.load_state_dict(torch.load(os.path.join(args.model_dir, "model_state.pt"), map_location="cpu"), strict=False)
    model.eval()

    emb = model.encoder.get_input_embeddings()
    idx = torch.tensor(kept, dtype=torch.long)
    new_emb = nn.Embedding(len(kept), emb.embedding_dim)
    with torch.no_grad():
        new_emb.weight.copy_(emb.weight[idx])
    model.encoder.set_input_embeddings(new_emb)
    model.encoder.config.vocab_size = len(kept)

    os.makedirs(args.out_dir, exist_ok=True)

    # Rebuild tokenizer.json: same normalizer/pre-tokenizer, reduced vocab + remapped ids.
    tj = json.load(open(os.path.join(args.model_dir, "tokenizer.json"), encoding="utf-8"))
    id2tok = {v: k for k, v in tj["model"]["vocab"].items()}
    tj["model"]["vocab"] = {id2tok[o]: old2new[o] for o in kept}
    for at in tj.get("added_tokens", []):
        if at["id"] in old2new:
            at["id"] = old2new[at["id"]]
    # The post-processor (TemplateProcessing) hardcodes [CLS]/[SEP] ids — remap
    # them too, or it re-injects the old ids and the embedding lookup is wrong.
    def remap_pp(pp):
        if not pp:
            return
        for proc in pp.get("processors", [pp]):
            for st in proc.get("special_tokens", {}).values():
                st["ids"] = [old2new.get(i, i) for i in st.get("ids", [])]
    remap_pp(tj.get("post_processor"))
    with open(os.path.join(args.out_dir, "tokenizer.json"), "w", encoding="utf-8") as f:
        json.dump(tj, f, ensure_ascii=False)
    for fn in ("tokenizer_config.json", "special_tokens_map.json"):
        src = os.path.join(args.model_dir, fn)
        if os.path.exists(src):
            shutil.copy(src, os.path.join(args.out_dir, fn))

    # Export the sliced model (dummy input tokenised with the pruned tokenizer).
    ptok = AutoTokenizer.from_pretrained(args.out_dir)
    enc = ptok("example message", return_tensors="pt", truncation=True, max_length=128)
    wrapper = InferenceWrapper(model).eval()
    onnx_path = os.path.join(args.out_dir, "model.onnx")
    torch.onnx.export(
        wrapper,
        (enc["input_ids"], enc["attention_mask"]),
        onnx_path,
        input_names=["input_ids", "attention_mask"],
        output_names=["tag_logits", "severity_logits"],
        dynamic_axes={
            "input_ids": {0: "batch", 1: "seq"},
            "attention_mask": {0: "batch", 1: "seq"},
            "tag_logits": {0: "batch"},
            "severity_logits": {0: "batch"},
        },
        opset_version=args.opset,
    )
    from onnxruntime.quantization import quantize_dynamic, QuantType

    int8_path = os.path.join(args.out_dir, "model.int8.onnx")
    quantize_dynamic(onnx_path, int8_path, weight_type=QuantType.QInt8)

    with open(os.path.join(args.out_dir, "labels.json"), "w", encoding="utf-8") as f:
        json.dump(
            {"tags": TAGS, "severity": SEVERITY_NAMES,
             "usage": "sigmoid(tag_logits) + per-tag threshold; softmax(severity_logits) then argmax (+1)"},
            f, ensure_ascii=False, indent=2,
        )
    for p in (onnx_path, int8_path):
        print(f"  {os.path.basename(p)}: {os.path.getsize(p) / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
