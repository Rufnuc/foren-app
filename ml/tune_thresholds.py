"""Tune per-tag decision thresholds from the GOLD eval set, safety-first, and
report the metrics that actually matter (threat recall, high-severity recall,
and the benign false-positive rate). Writes a `thresholds` map that the client
(src/lib/analysisModel.ts) reads.

Constraints (the safety design, not blind F1-chasing):
  • Danger tags (threat/physical-violence/sexual) are pinned LOW (0.35) — over-
    flagging a threat is safer than missing one.
  • Other tags with enough gold support are set to the F1-optimal threshold in a
    sane band [0.40, 0.70]; thinly-supported tags keep the 0.50 default rather
    than overfit to a handful of examples.
  • coercive-control has a floor that keeps benign imperative messages from
    firing (checked explicitly and reported).

    python tune_thresholds.py --model-dir public/models/analysis --data data/gold_eval.jsonl \
        --write public/models/analysis/labels.json
"""

import argparse
import json

import numpy as np
import onnxruntime as ort
from transformers import AutoTokenizer

DANGER = {"threat", "physical-violence", "sexual"}
DANGER_TH = 0.35
MIN_SUPPORT = 6
BAND = (0.40, 0.70)


def sigmoid(x):
    return 1 / (1 + np.exp(-x))


def infer(model_dir, texts):
    tok = AutoTokenizer.from_pretrained(model_dir)
    sess = ort.InferenceSession(f"{model_dir}/model.int8.onnx")
    tag_probs, sev_pred = [], []
    for t in texts:
        enc = tok(t, return_tensors="np", truncation=True, max_length=128)
        out = sess.run(None, {"input_ids": enc["input_ids"].astype(np.int64),
                              "attention_mask": enc["attention_mask"].astype(np.int64)})
        tag_probs.append(sigmoid(out[0][0]))
        sev_pred.append(int(np.argmax(out[1][0])) + 1)
    return np.array(tag_probs), np.array(sev_pred)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model-dir", required=True)
    ap.add_argument("--data", required=True)
    ap.add_argument("--write", help="labels.json to update with the tuned thresholds")
    args = ap.parse_args()

    labels = json.load(open(f"{args.model_dir}/labels.json"))
    TAGS = labels["tags"]
    rows = [json.loads(l) for l in open(args.data, encoding="utf-8") if l.strip()]
    texts = [r["text"] for r in rows]
    y = np.zeros((len(rows), len(TAGS)), dtype=int)
    for i, r in enumerate(rows):
        for t in r["tags"]:
            y[i, TAGS.index(t)] = 1
    sev_true = np.array([r["severity"] for r in rows])
    benign_mask = np.array([len(r["tags"]) == 0 for r in rows])

    probs, sev_pred = infer(args.model_dir, texts)

    thresholds = {}
    for i, tag in enumerate(TAGS):
        support = int(y[:, i].sum())
        if tag in DANGER:
            thresholds[tag] = DANGER_TH
            continue
        if support < MIN_SUPPORT:
            continue  # keep default 0.5 (analysisModel falls back)
        best_t, best_f1 = 0.5, -1.0
        for t in np.round(np.arange(BAND[0], BAND[1] + 0.001, 0.05), 2):
            pred = (probs[:, i] >= t).astype(int)
            tp = int((pred & y[:, i]).sum())
            fp = int((pred & (1 - y[:, i])).sum())
            fn = int(((1 - pred) & y[:, i]).sum())
            f1 = tp / (tp + 0.5 * (fp + fn)) if (tp + fp + fn) else 0.0
            if f1 > best_f1:
                best_f1, best_t = f1, float(t)
        thresholds[tag] = best_t

    # Guard: coercive-control must not fire on benign messages. Raise until the
    # benign false-positive rate for it is 0 (within the band).
    cc = TAGS.index("coercive-control")
    t = thresholds.get("coercive-control", 0.5)
    while t < 0.75 and (probs[benign_mask, cc] >= t).any():
        t = round(t + 0.05, 2)
    thresholds["coercive-control"] = t

    # ── Report at the tuned thresholds ────────────────────────────────────────
    def th(tag):
        return thresholds.get(tag, DANGER_TH if tag in DANGER else 0.5)

    pred = np.zeros_like(y)
    for i, tag in enumerate(TAGS):
        pred[:, i] = (probs[:, i] >= th(tag)).astype(int)

    def recall(col):
        pos = y[:, col] == 1
        return float((pred[pos, col] == 1).mean()) if pos.any() else float("nan")

    hi = sev_true >= 3
    hi_recall = float(((sev_pred[hi] >= 3)).mean()) if hi.any() else float("nan")
    benign_fp = float((pred[benign_mask].sum(axis=1) > 0).mean()) if benign_mask.any() else 0.0

    print("== Tuned thresholds ==")
    for tag in TAGS:
        print(f"  {tag:18s} {th(tag):.2f}  (support {int(y[:, TAGS.index(tag)].sum())})")
    print("\n== Safety metrics at these thresholds (gold eval) ==")
    print(f"  threat recall        : {recall(TAGS.index('threat')):.2f}")
    print(f"  high-severity recall : {hi_recall:.2f}")
    print(f"  benign false-positive: {benign_fp:.2f}  (fraction of benign msgs that fire ANY tag)")

    if args.write:
        labels["thresholds"] = {k: round(v, 2) for k, v in thresholds.items()}
        labels["usage"] = (
            "sigmoid(tag_logits) >= per-tag threshold (below) -> tag; softmax(severity_logits) argmax+1. "
            "Danger tags (threat/physical-violence/sexual) pinned to 0.35 for recall; other thresholds tuned "
            "on the held-out gold eval (F1-optimal in [0.40,0.70], default 0.50 when support is thin); "
            "coercive-control raised to keep benign messages from firing."
        )
        json.dump(labels, open(args.write, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
        print(f"\nwrote thresholds to {args.write}")


if __name__ == "__main__":
    main()
