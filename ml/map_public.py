"""Map public datasets onto the Foren taxonomy → our JSONL.

Public data seeds only the tags it actually covers. The big win from Jigsaw is
real **threat** and **degradation** examples plus clean **negatives**; the
IPV-specific tags (stalking, surveillance, coercive-control, financial-abuse,
contact-breach, child-related, isolation) are NOT in it and must come from
synthetic + expert data. Jigsaw is English-only, so this seeds `en` only.

Jigsaw Toxic Comment Classification Challenge (Kaggle):
  https://www.kaggle.com/c/jigsaw-toxic-comment-classification-challenge/data
  Columns: comment_text, toxic, severe_toxic, obscene, threat, insult, identity_hate

    python map_public.py jigsaw --csv train.csv --out data/jigsaw.jsonl \
        --limit 4000 --negatives 4000

Then always run it through data_tools:
    python data_tools.py validate --data data/jigsaw.jsonl
    python data_tools.py stats    --data data/jigsaw.jsonl
"""

import argparse
import csv
import json
import random


def _bool(row, key):
    return str(row.get(key, "0")).strip() in ("1", "1.0", "true", "True")


def map_jigsaw_row(row):
    """Return a taxonomy row, or None to skip.

    Conservative on purpose: we only emit tags we can defend. Rows that are
    toxic but map to no clean tag (e.g. only `obscene`/generic `toxic`) are
    dropped to keep label precision high.
    """
    text = (row.get("comment_text") or "").strip()
    if not text:
        return None
    if len(text) > 1000:
        text = text[:1000]

    tags, severity = [], 1
    if _bool(row, "threat"):
        tags.append("threat")
        severity = 4 if _bool(row, "severe_toxic") else 3
    if _bool(row, "insult") or _bool(row, "identity_hate"):
        if "degradation" not in tags:
            tags.append("degradation")
        severity = max(severity, 3 if _bool(row, "severe_toxic") else 2)

    if tags:
        return {"text": text, "lang": "en", "tags": tags, "severity": severity, "source": "jigsaw"}

    any_toxic = any(
        _bool(row, k)
        for k in ("toxic", "severe_toxic", "obscene", "threat", "insult", "identity_hate")
    )
    if any_toxic:
        return None  # toxic but unmappable → skip
    return {"text": text, "lang": "en", "tags": [], "severity": 1, "source": "jigsaw-neg"}


def cmd_jigsaw(args):
    rng = random.Random(args.seed)
    pos, neg = [], []
    with open(args.csv, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            m = map_jigsaw_row(row)
            if m is None:
                continue
            (pos if m["tags"] else neg).append(m)

    rng.shuffle(pos)
    rng.shuffle(neg)
    if args.limit:
        pos = pos[: args.limit]
    neg = neg[: args.negatives]
    out = pos + neg
    rng.shuffle(out)

    with open(args.out, "w", encoding="utf-8") as f:
        for r in out:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    print(f"jigsaw → {len(pos)} tagged + {len(neg)} negatives = {len(out)} rows → {args.out}")


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    j = sub.add_parser("jigsaw", help="Jigsaw Toxic Comment Classification CSV")
    j.add_argument("--csv", required=True)
    j.add_argument("--out", required=True)
    j.add_argument("--limit", type=int, default=0, help="cap tagged rows (0 = all)")
    j.add_argument("--negatives", type=int, default=2000, help="number of clean negatives to keep")
    j.add_argument("--seed", type=int, default=42)
    j.set_defaults(fn=cmd_jigsaw)
    args = ap.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
