"""Synthetic training-data generator for the Foren analysis model.

This fabricates abuse-style (and benign) messages ONLY to teach the on-device
classifier to recognise abusive patterns and protect survivors. Nothing here is
about real people or drawn from real evidence. Two hard rules, enforced by
convention and documented everywhere:

  1. Never train on synthetic data alone. It seeds and balances; the real signal
     and the safety guarantee come from the hand-labelled eval set.
  2. Synthetic rows are tagged source="synthetic-llm" and MUST be spot-reviewed
     by a person (ideally a DV advocate) before they enter a training run,
     especially for ar (dialect/Arabizi) and cy (low-resource).

Design choice: labels come from a fixed generation PLAN, never from asking the
model to self-label. We tell the model which pattern + severity to write for,
and we attach those labels ourselves — far more reliable than trusting an LLM's
own annotations.

    # 1. Build a plan (top up each cell to a target, measuring what you already have)
    python synth.py plan --per-cell 40 --from data/seed.jsonl --out plan.json

    # 2. Generate. Default provider is 'mock' (fake placeholders — proves the
    #    plumbing, generates nothing real). Wire a real LLM via env + --provider openai.
    python synth.py generate --plan plan.json --out data/synth.jsonl --provider mock

    # 3. Always gate the output:
    python data_tools.py validate --data data/synth.jsonl
    python data_tools.py stats    --data data/synth.jsonl

Wiring a real (offline or hosted) OpenAI-compatible model:
    export FOREN_LLM_BASE_URL=http://localhost:11434/v1   # e.g. Ollama, LM Studio, llama.cpp
    export FOREN_LLM_API_KEY=xxx                           # any non-empty for local servers
    export FOREN_LLM_MODEL=llama3.1:8b
    python synth.py generate --plan plan.json --out data/synth.jsonl --provider openai
"""

import argparse
import json
import os
import re
import sys
import urllib.request
from collections import Counter

from taxonomy import LANGUAGES, TAG_DESCRIPTIONS, SEVERITY_DESCRIPTIONS
from data_tools import load_jsonl, _norm, validate_rows

LANG_NAMES = {"en": "English", "fr": "French", "es": "Spanish", "ar": "Arabic", "cy": "Welsh"}
LANG_REGISTER = {
    "ar": " Mix Modern Standard Arabic with everyday dialect, and include a few written "
          "in Arabizi (Arabic in Latin letters using numbers like 3, 7, 2).",
    "cy": " Use natural, colloquial Welsh as people actually text, not formal written Welsh.",
}

# Curated, realistic (pattern, tags, severity) cells. Between them these cover all
# 14 tags and all 4 severities. Same set is generated across every language.
PATTERNS = [
    ("threat-critical",      ["threat"],                                   4),
    ("threat-high",          ["threat"],                                   3),
    ("threat-stalking",      ["threat", "stalking"],                       3),
    ("stalking-surveillance",["stalking", "surveillance"],                 3),
    ("surveillance",         ["surveillance"],                             2),
    ("coercive-control",     ["coercive-control"],                         2),
    ("coercive-isolation",   ["coercive-control", "isolation"],            2),
    ("financial-abuse",      ["financial-abuse", "coercive-control"],      2),
    ("contact-breach",       ["harassment", "contact-breach"],             2),
    ("harassment",           ["harassment"],                               1),
    ("child-threat",         ["threat", "child-related", "coercive-control"], 3),
    ("intimidation",         ["intimidation"],                             2),
    ("degradation",          ["degradation"],                              1),
    ("degradation-manip",    ["degradation", "manipulation"],              2),
    ("sexual-coercion",      ["sexual", "coercive-control"],               3),
    ("sexual-threat",        ["sexual", "threat"],                         4),
    ("physical-violence",    ["physical-violence", "threat"],              4),
    ("manipulation",         ["manipulation"],                             1),
    ("benign",               [],                                           1),
]

SYSTEM_PROMPT = (
    "You generate synthetic, fabricated training data for a safety tool that helps "
    "domestic-abuse survivors document abusive messages. Every example is invented, "
    "not about any real person, and is used solely to teach a classifier to recognise "
    "abuse so victims can be protected. Produce the requested messages plainly, one per "
    "line, with no commentary."
)

_REFUSAL_MARKERS = (
    "i cannot", "i can't", "i am unable", "i'm unable", "as an ai", "i'm sorry",
    "i am sorry", "here are", "sure,", "certainly", "of course",
)


# ---------------------------------------------------------------- prompt

def build_prompt(cell):
    lang = LANG_NAMES[cell["lang"]]
    n = cell["count"]
    if cell["tags"]:
        patterns = "; ".join(f"{t} — {TAG_DESCRIPTIONS[t]}" for t in cell["tags"])
        sev = SEVERITY_DESCRIPTIONS[cell["severity"]]
        body = (
            f"Write {n} short, realistic but entirely fictional text messages in {lang}, "
            f"of the kind an abusive partner might send. Each message should reflect these "
            f"patterns: {patterns}. Overall severity: {sev}."
        )
    else:
        body = (
            f"Write {n} short, realistic, ordinary text messages in {lang} between separated "
            f"or co-parenting people with NO abuse at all — neutral logistics, scheduling, "
            f"everyday tone. These are benign negative examples."
        )
    body += (
        " Vary the wording, length and phrasing so none repeat. Keep them message-length. "
        "Output ONLY the messages, one per line, no numbering, no quotes, no commentary."
    )
    body += LANG_REGISTER.get(cell["lang"], "")
    return body


def parse_output(text, cell):
    rows = []
    for line in text.splitlines():
        s = line.strip().lstrip("-*•").strip()
        s = re.sub(r"^\d+[\.\)]\s*", "", s).strip().strip('"').strip()
        if len(s) < 2:
            continue
        if any(s.lower().startswith(m) for m in _REFUSAL_MARKERS):
            continue
        rows.append({
            "text": s,
            "lang": cell["lang"],
            "tags": list(cell["tags"]),
            "severity": cell["severity"],
            "source": "synthetic-llm",
        })
    return rows[: cell["count"]]


# ---------------------------------------------------------------- providers

def mock_provider(prompt, n):
    """Obviously-fake placeholders. Proves the pipeline without generating anything real."""
    return "\n".join(f"[MOCK synthetic placeholder #{i + 1} — replace with a real LLM]" for i in range(n))


def openai_provider(prompt, n):
    base = os.environ.get("FOREN_LLM_BASE_URL", "https://api.openai.com/v1").rstrip("/")
    key = os.environ.get("FOREN_LLM_API_KEY", "")
    model = os.environ.get("FOREN_LLM_MODEL", "gpt-4o-mini")
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.9,
    }
    req = urllib.request.Request(
        base + "/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"},
    )
    with urllib.request.urlopen(req, timeout=180) as resp:
        data = json.loads(resp.read())
    return data["choices"][0]["message"]["content"]


PROVIDERS = {"mock": mock_provider, "openai": openai_provider}


# ---------------------------------------------------------------- commands

def cmd_plan(args):
    existing = Counter()
    if args.from_data:
        for _, r in load_jsonl(args.from_data):
            existing[(r.get("lang"), frozenset(r.get("tags", [])), r.get("severity"))] += 1

    plan = []
    for lang in LANGUAGES:
        for pid, tags, sev in PATTERNS:
            have = existing[(lang, frozenset(tags), sev)]
            plan.append({
                "pattern": pid, "lang": lang, "tags": tags,
                "severity": sev, "count": max(0, args.per_cell - have),
            })
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(plan, f, ensure_ascii=False, indent=2)
    total = sum(c["count"] for c in plan)
    print(f"plan: {len(plan)} cells, {total} examples to generate → {args.out}")


def cmd_generate(args):
    with open(args.plan, encoding="utf-8") as f:
        plan = json.load(f)
    provider = PROVIDERS[args.provider]
    cells = [c for c in plan if c["count"] > 0]
    if args.max_cells:
        cells = cells[: args.max_cells]

    seen, all_rows = set(), []
    for c in cells:
        try:
            text = provider(build_prompt(c), c["count"])
        except Exception as e:  # noqa: BLE001 — one bad cell shouldn't sink the run
            print(f"  ! {c['lang']}/{c['pattern']}: provider error: {e}")
            continue
        kept = 0
        for r in parse_output(text, c):
            key = (r["lang"], _norm(r["text"]))
            if key in seen:
                continue
            seen.add(key)
            all_rows.append(r)
            kept += 1
        print(f"  {c['lang']:3s} {c['pattern']:22s} sev{c['severity']} → {kept} kept")

    with open(args.out, "w", encoding="utf-8") as f:
        for r in all_rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    errors = validate_rows(list(enumerate(all_rows, 1)))
    print(f"\nwrote {len(all_rows)} rows → {args.out}")
    if errors:
        print(f"⚠ {len(errors)} validation issue(s) — inspect before use:")
        for e in errors[:10]:
            print("   -", e)
    if args.provider == "mock":
        print("\nNOTE: provider=mock produced PLACEHOLDERS, not usable data. "
              "Wire a real LLM (--provider openai + FOREN_LLM_* env) to generate.")
    print("REMINDER: spot-review synthetic rows before training; never train on them alone.")


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("plan", help="build a generation plan")
    p.add_argument("--per-cell", type=int, default=40, help="target examples per (lang×pattern) cell")
    p.add_argument("--from", dest="from_data", help="existing JSONL to measure current coverage")
    p.add_argument("--out", required=True)
    p.set_defaults(fn=cmd_plan)

    g = sub.add_parser("generate", help="generate from a plan")
    g.add_argument("--plan", required=True)
    g.add_argument("--out", required=True)
    g.add_argument("--provider", choices=list(PROVIDERS), default="mock")
    g.add_argument("--max-cells", type=int, default=0, help="cap cells (for testing)")
    g.set_defaults(fn=cmd_generate)

    args = ap.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
