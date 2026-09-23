"""Export a trained checkpoint to ONNX + int8, ready for transformers.js / onnxruntime-web.

    python export_onnx.py --model-dir runs/exp1 --out-dir ../public/models/analysis

Produces model.onnx, model.int8.onnx, the tokenizer, and labels.json. In the
app, run tag_logits through sigmoid (per-tag thresholds from evaluate.py) and
severity_logits through softmax/argmax.

Vocab pruning (to {en,fr,es,ar,cy}) is a further ~2-3x size cut but needs a
tokenizer rebuild — see README "Vocab pruning". It's easier on a WordPiece base
(distilbert-base-multilingual-cased) than on this SentencePiece one.
"""

import argparse
import json
import os

import torch
from transformers import AutoTokenizer

from model import MultiTaskClassifier, InferenceWrapper
from taxonomy import TAGS, NUM_TAGS, NUM_SEVERITY, SEVERITY_NAMES


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model-dir", required=True)
    ap.add_argument("--out-dir", required=True)
    ap.add_argument("--opset", type=int, default=14)
    args = ap.parse_args()

    cfg = json.load(open(os.path.join(args.model_dir, "foren_config.json"), encoding="utf-8"))
    tok = AutoTokenizer.from_pretrained(args.model_dir)
    model = MultiTaskClassifier(cfg["base_model"], NUM_TAGS, NUM_SEVERITY)
    model.load_state_dict(
        torch.load(os.path.join(args.model_dir, "model_state.pt"), map_location="cpu"), strict=False
    )
    model.eval()
    wrapper = InferenceWrapper(model).eval()

    os.makedirs(args.out_dir, exist_ok=True)
    enc = tok("example message", return_tensors="pt", truncation=True, max_length=128)
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
    print("wrote", onnx_path)

    from onnxruntime.quantization import quantize_dynamic, QuantType

    int8_path = os.path.join(args.out_dir, "model.int8.onnx")
    quantize_dynamic(onnx_path, int8_path, weight_type=QuantType.QInt8)
    print("wrote", int8_path)

    tok.save_pretrained(args.out_dir)
    with open(os.path.join(args.out_dir, "labels.json"), "w", encoding="utf-8") as f:
        json.dump(
            {
                "tags": TAGS,
                "severity": SEVERITY_NAMES,
                "usage": "sigmoid(tag_logits) with per-tag thresholds; softmax(severity_logits) then argmax (+1)",
            },
            f,
            ensure_ascii=False,
            indent=2,
        )
    for f in (onnx_path, int8_path):
        print(f"  {os.path.basename(f)}: {os.path.getsize(f)/1e6:.1f} MB")


if __name__ == "__main__":
    main()
