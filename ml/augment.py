"""Real-world noise augmentation for training data.

The classifier trains on clean templates but is deployed on messy phone
messages: contractions, dropped apostrophes, abbreviations, typos, emoji, and
casing noise. This closes that domain gap by emitting noisy VARIANTS of each
labelled row (labels unchanged — the meaning is preserved), so the model sees
the styles it will actually meet. Evaluated against the held-out gold set
(build_gold_eval.py), which is authored in exactly these authentic styles.

    python augment.py --data data/train.jsonl --out data/train_aug.jsonl --per-row 1

Deterministic given --seed. Never touches the gold eval set.
"""

import argparse
import json
import random

# Common informal substitutions (English), applied probabilistically.
WORD_SUBS = {
    "you": "u", "your": "ur", "you're": "ur", "youre": "ur", "are": "r", "to": "2",
    "for": "4", "going to": "gonna", "want to": "wanna", "because": "cuz", "please": "pls",
    "tomorrow": "tmrw", "tonight": "2nite", "right now": "rn", "okay": "ok", "and": "n",
    "with": "w", "without": "w/o", "about": "bout", "really": "rly", "people": "ppl",
    "message": "msg", "everyone": "every1", "someone": "some1", "before": "b4",
}

# Emoji that co-occur with the emotional register of these messages (both
# threatening and benign — appended to some rows so emoji isn't a tag signal).
EMOJI = ["😡", "🔪", "😤", "👀", "📍", "🙄", "😊", "🙏", "❤️", "😂", "😅", "🤬", "💔", "🥺", "‼️"]


def drop_apostrophes(s: str, rng: random.Random) -> str:
    return s.replace("'", "") if rng.random() < 0.6 else s


def apply_word_subs(s: str, rng: random.Random) -> str:
    out = s
    # Multi-word phrases first.
    for k, v in WORD_SUBS.items():
        if " " in k and k in out and rng.random() < 0.5:
            out = out.replace(k, v)
    tokens = out.split(" ")
    for i, tok in enumerate(tokens):
        low = tok.lower()
        if low in WORD_SUBS and rng.random() < 0.5:
            tokens[i] = WORD_SUBS[low]
    return " ".join(tokens)


def typo(s: str, rng: random.Random) -> str:
    # Occasionally drop a character or swap two adjacent ones in a longer word.
    words = s.split(" ")
    for i, w in enumerate(words):
        if len(w) > 4 and rng.random() < 0.12:
            j = rng.randrange(1, len(w) - 1)
            if rng.random() < 0.5:  # drop
                words[i] = w[:j] + w[j + 1:]
            else:  # swap
                words[i] = w[:j] + w[j + 1] + w[j] + w[j + 2:]
    return " ".join(words)


def maybe_emoji(s: str, rng: random.Random) -> str:
    return f"{s} {rng.choice(EMOJI)}" if rng.random() < 0.3 else s


def maybe_lower(s: str, rng: random.Random) -> str:
    return s.lower() if rng.random() < 0.7 else s


def noisify(text: str, lang: str, rng: random.Random) -> str:
    s = text
    if lang == "en":
        s = apply_word_subs(s, rng)
    s = drop_apostrophes(s, rng)
    s = typo(s, rng)
    s = maybe_lower(s, rng)
    s = maybe_emoji(s, rng)
    return s.strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--per-row", type=int, default=1, help="noisy variants to emit per source row")
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args()

    rng = random.Random(args.seed)
    rows = [json.loads(l) for l in open(args.data, encoding="utf-8") if l.strip()]
    out, seen = [], set()
    for r in rows:
        for _ in range(args.per_row):
            noisy = noisify(r["text"], r.get("lang", "en"), rng)
            key = (r.get("lang"), noisy.lower())
            if not noisy or noisy == r["text"] or key in seen:
                continue
            seen.add(key)
            out.append({**r, "text": noisy, "source": (r.get("source", "") + "+aug").lstrip("+")})

    with open(args.out, "w", encoding="utf-8") as f:
        for r in out:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    print(f"{len(out)} augmented rows → {args.out}")


if __name__ == "__main__":
    main()
