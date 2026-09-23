"""Seed REAL English data from HuggingFace `civil_comments` (Jigsaw Unintended
Bias) — no Kaggle download needed. Human-annotated scores are the FRACTION of
annotators who flagged each attribute, so >=0.5 means the majority agreed.

Covers the tags civil_comments actually supports:
  threat            <- threat
  sexual            <- sexual_explicit
  degradation       <- insult / identity_attack
  (clean negatives) <- very low toxicity

The IPV-specific tags (stalking, surveillance, coercive-control, financial-abuse,
contact-breach, child-related, isolation, manipulation, physical-violence) are
NOT in this dataset — they come from the template seed + synthetic + expert data.

    python seed_civil.py --out data/civil.jsonl
Then merge + validate via data_tools.py before training.
"""

import argparse
import json

from datasets import load_dataset


def map_row(r, thr):
    text = (r.get("text") or "").strip()
    if len(text) < 4:
        return None
    if len(text) > 1000:
        text = text[:1000]
    severe = r["severe_toxicity"] >= 0.5
    tags, sev = [], 1
    if r["threat"] >= thr:
        tags.append("threat")
        sev = max(sev, 4 if severe else 3)
    if r["sexual_explicit"] >= thr:
        tags.append("sexual")
        sev = max(sev, 4 if severe else 3)
    if r["insult"] >= thr or r["identity_attack"] >= thr:
        tags.append("degradation")
        sev = max(sev, 3 if severe else 2)
    if tags:
        return {"text": text, "lang": "en", "tags": tags, "severity": sev, "source": "civil_comments"}
    # Clean negative only when clearly non-toxic (keeps label precision high).
    if r["toxicity"] <= 0.1 and r["obscene"] <= 0.1 and r["insult"] <= 0.1:
        return {"text": text, "lang": "en", "tags": [], "severity": 1, "source": "civil-neg"}
    return None  # toxic but unmappable → drop


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="data/civil.jsonl")
    ap.add_argument("--thr", type=float, default=0.5)
    ap.add_argument("--max-scan", type=int, default=350000)
    ap.add_argument("--q-threat", type=int, default=900)
    ap.add_argument("--q-sexual", type=int, default=500)
    ap.add_argument("--q-degradation", type=int, default=2000)
    ap.add_argument("--q-neg", type=int, default=3000)
    args = ap.parse_args()
    quota = {"threat": args.q_threat, "sexual": args.q_sexual, "degradation": args.q_degradation, "neg": args.q_neg}

    ds = load_dataset("civil_comments", split="train", streaming=True)
    counts = {"threat": 0, "sexual": 0, "degradation": 0, "neg": 0}
    rows, scanned = [], 0
    for r in ds:
        scanned += 1
        if scanned > args.max_scan:
            break
        m = map_row(r, args.thr)
        if not m:
            continue
        if m["tags"]:
            if all(counts[t] >= quota[t] for t in m["tags"]):
                continue  # every tag on this row is already full
            for t in m["tags"]:
                counts[t] += 1
            rows.append(m)
        else:
            if counts["neg"] >= quota["neg"]:
                continue
            counts["neg"] += 1
            rows.append(m)
        if scanned % 25000 == 0:
            print("scanned", scanned, counts, flush=True)
        if all(counts[k] >= quota[k] for k in quota):
            print("all quotas met at row", scanned)
            break

    with open(args.out, "w", encoding="utf-8") as f:
        for m in rows:
            f.write(json.dumps(m, ensure_ascii=False) + "\n")
    print("wrote", len(rows), "rows to", args.out, "| counts", counts, "| scanned", scanned)


if __name__ == "__main__":
    main()
