"""Human-labelling harness for the gold evaluation set.

The eval set is the safety asset: it is what tells you the model is safe to ship,
so it must be labelled BY PEOPLE (ideally DV advocates for the real message
styles of en/fr/es/ar/cy), never by the model or synthetically. This tool is the
round-trip between "a pile of candidate messages" and "reviewed JSONL":

    # 1. Turn candidate texts into a spreadsheet a reviewer can fill in
    python eval_set.py template --texts candidates.txt --lang en --out review.csv
    #    (or draw from an existing JSONL pool: --from pool.jsonl)

    # 2. A human opens review.csv, marks 1 in each applicable tag column and a
    #    severity 1-4. Then import back to gold JSONL:
    python eval_set.py import --csv review.csv --out data/eval.jsonl

    # 3. Gate it like everything else:
    python data_tools.py validate --data data/eval.jsonl
    python data_tools.py stats    --data data/eval.jsonl

Gold rows are tagged source="gold-eval" and should be held OUT of training and
used only by evaluate.py.
"""

import argparse
import csv
import json

from taxonomy import TAGS, NUM_SEVERITY
from data_tools import load_jsonl, validate_rows

_TRUE = {"1", "1.0", "x", "X", "y", "Y", "yes", "true", "TRUE", "True"}
_HEADER = ["text", "lang"] + list(TAGS) + ["severity", "notes"]


def _candidate_rows(args):
    if args.from_data:
        for _, r in load_jsonl(args.from_data):
            yield r.get("text", ""), r.get("lang", args.lang)
    elif args.texts:
        with open(args.texts, encoding="utf-8") as f:
            for line in f:
                s = line.strip()
                if s:
                    yield s, args.lang
    else:
        raise SystemExit("template needs --texts FILE or --from JSONL")


def cmd_template(args):
    n = 0
    with open(args.out, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(_HEADER)
        for text, lang in _candidate_rows(args):
            w.writerow([text, lang] + [""] * len(TAGS) + ["", ""])
            n += 1
    print(f"template: {n} rows → {args.out}")
    print(f"columns: text, lang, {len(TAGS)} tag columns (mark 1), severity (1-{NUM_SEVERITY}), notes")


def cmd_import(args):
    rows = []
    with open(args.csv, encoding="utf-8", newline="") as f:
        for i, row in enumerate(csv.DictReader(f), 2):  # line 2 = first data row
            text = (row.get("text") or "").strip()
            if not text:
                continue
            tags = [t for t in TAGS if (row.get(t) or "").strip() in _TRUE]
            sev_raw = (row.get("severity") or "").strip()
            try:
                severity = int(float(sev_raw))
            except ValueError:
                print(f"  ! CSV line {i}: bad/blank severity {sev_raw!r} — skipped")
                continue
            out = {"text": text, "lang": (row.get("lang") or "").strip(),
                   "tags": tags, "severity": severity, "source": "gold-eval"}
            if (row.get("notes") or "").strip():
                out["notes"] = row["notes"].strip()
            rows.append(out)

    errors = validate_rows(list(enumerate(rows, 1)))
    if errors:
        print(f"✗ {len(errors)} issue(s) — fix the CSV, nothing written:")
        for e in errors[:50]:
            print("   -", e)
        raise SystemExit(1)

    with open(args.out, "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    print(f"✓ imported {len(rows)} gold rows → {args.out}")


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)

    t = sub.add_parser("template", help="make a review CSV from candidate texts")
    t.add_argument("--texts", help="plain-text file, one message per line")
    t.add_argument("--from", dest="from_data", help="JSONL pool (uses text + lang)")
    t.add_argument("--lang", default="", help="default language code for the rows")
    t.add_argument("--out", required=True)
    t.set_defaults(fn=cmd_template)

    im = sub.add_parser("import", help="import a filled review CSV to gold JSONL")
    im.add_argument("--csv", required=True)
    im.add_argument("--out", required=True)
    im.set_defaults(fn=cmd_import)

    args = ap.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
