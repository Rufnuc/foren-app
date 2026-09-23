"""Data plumbing for the analysis dataset: validate, stats, dedup, merge.

Every dataset source (public-dataset mapping, synthetic generation, the
hand-labelled eval set) flows through here before training.

    python data_tools.py validate --data data/sample.jsonl
    python data_tools.py stats    --data data/sample.jsonl
    python data_tools.py dedup    --data raw.jsonl --out clean.jsonl
    python data_tools.py merge    --data a.jsonl b.jsonl --out all.jsonl

Exit code is non-zero if validation finds errors — safe to use in CI.
"""

import argparse
import json
import re
import sys
from collections import Counter, defaultdict

from taxonomy import TAGS, TAG_TO_IDX, NUM_SEVERITY, SEVERITY_NAMES, LANGUAGES

# Below these, a tag / language is too thin to learn or evaluate reliably.
MIN_PER_TAG = 50
MIN_PER_LANG = 100
MIN_PER_SEVERITY = 50


def load_jsonl(path):
    rows = []
    with open(path, encoding="utf-8") as f:
        for i, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            rows.append((i, json.loads(line)))
    return rows


def _norm(text):
    return re.sub(r"\s+", " ", text.strip().lower())


def validate_rows(rows):
    """Return list of error strings (empty = valid)."""
    errors = []
    for lineno, r in rows:
        where = f"line {lineno}"
        if not isinstance(r.get("text"), str) or not r["text"].strip():
            errors.append(f"{where}: missing/empty 'text'")
        for t in r.get("tags", []):
            if t not in TAG_TO_IDX:
                errors.append(f"{where}: unknown tag {t!r}")
        sev = r.get("severity")
        if not isinstance(sev, int) or not (1 <= sev <= NUM_SEVERITY):
            errors.append(f"{where}: severity must be int 1..{NUM_SEVERITY}, got {sev!r}")
        lang = r.get("lang")
        if lang not in LANGUAGES:
            errors.append(f"{where}: lang {lang!r} not in supported {LANGUAGES} (warning)")
        # Consistency: a non-benign severity with zero tags is usually a labelling slip.
        if isinstance(sev, int) and sev >= 3 and not r.get("tags"):
            errors.append(f"{where}: severity {sev} but no tags — likely mislabelled")
    return errors


def cmd_validate(args):
    rows = load_jsonl(args.data)
    errors = validate_rows(rows)
    if errors:
        print(f"✗ {len(errors)} issue(s) in {args.data}:")
        for e in errors[:200]:
            print("  -", e)
        sys.exit(1)
    print(f"✓ {len(rows)} rows valid.")


def cmd_stats(args):
    rows = [r for _, r in load_jsonl(args.data)]
    n = len(rows)
    per_lang = Counter(r.get("lang", "?") for r in rows)
    per_sev = Counter(r["severity"] for r in rows)
    per_tag = Counter()
    benign = 0
    for r in rows:
        tags = r.get("tags", [])
        if not tags:
            benign += 1
        per_tag.update(tags)

    print(f"\n{args.data}: {n} rows  ({benign} benign / no-tag)\n")

    print("By language:")
    for lg in LANGUAGES + sorted(set(per_lang) - set(LANGUAGES)):
        c = per_lang.get(lg, 0)
        flag = "  ⚠ thin" if c < MIN_PER_LANG else ""
        print(f"  {lg:4s} {c:6d}{flag}")

    print("\nBy severity:")
    for s in range(1, NUM_SEVERITY + 1):
        c = per_sev.get(s, 0)
        flag = "  ⚠ thin" if c < MIN_PER_SEVERITY else ""
        print(f"  {s} {SEVERITY_NAMES[s]:9s} {c:6d}{flag}")

    print("\nBy tag:")
    for t in TAGS:
        c = per_tag.get(t, 0)
        flag = "  ⚠ thin" if c < MIN_PER_TAG else ""
        print(f"  {t:18s} {c:6d}{flag}")

    # Tag x language coverage gaps — where the model will be blind.
    pair = defaultdict(int)
    for r in rows:
        for t in r.get("tags", []):
            pair[(r.get("lang"), t)] += 1
    gaps = [
        (lg, t)
        for lg in LANGUAGES
        for t in TAGS
        if pair.get((lg, t), 0) == 0
    ]
    if gaps:
        print(f"\n⚠ {len(gaps)} tag×language cells have 0 examples (blind spots), e.g.:")
        for lg, t in gaps[:12]:
            print(f"    {lg} / {t}")


def cmd_dedup(args):
    rows = [r for _, r in load_jsonl(args.data)]
    seen = set()
    kept = []
    for r in rows:
        key = (r.get("lang"), _norm(r.get("text", "")))
        if key in seen:
            continue
        seen.add(key)
        kept.append(r)
    _write(args.out, kept)
    print(f"dedup: {len(rows)} → {len(kept)} ({len(rows)-len(kept)} removed) → {args.out}")


def cmd_merge(args):
    seen, kept = set(), []
    for path in args.data:
        for _, r in load_jsonl(path):
            key = (r.get("lang"), _norm(r.get("text", "")))
            if key in seen:
                continue
            seen.add(key)
            kept.append(r)
    _write(args.out, kept)
    print(f"merged {len(args.data)} files → {len(kept)} rows → {args.out}")


def _write(path, rows):
    with open(path, "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    v = sub.add_parser("validate"); v.add_argument("--data", required=True); v.set_defaults(fn=cmd_validate)
    s = sub.add_parser("stats"); s.add_argument("--data", required=True); s.set_defaults(fn=cmd_stats)
    d = sub.add_parser("dedup"); d.add_argument("--data", required=True); d.add_argument("--out", required=True); d.set_defaults(fn=cmd_dedup)
    m = sub.add_parser("merge"); m.add_argument("--data", nargs="+", required=True); m.add_argument("--out", required=True); m.set_defaults(fn=cmd_merge)
    args = ap.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
