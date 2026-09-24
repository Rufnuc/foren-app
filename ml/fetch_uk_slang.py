"""Fetch a UK-slang / British-informal lexicon from Wiktionary (free, CC BY-SA,
no auth) via the MediaWiki API. Produces a JSON term list used by augment.py to
inject British register into training/eval, so the model sees the vocabulary UK
chats actually use rather than American-skewed public data.

    python fetch_uk_slang.py --out data/uk_slang_lexicon.json

Honest limits: a lexicon gives you VOCAB, not authentic message STYLE — pair it
with a real British chat corpus (see docs/uk-data-sourcing.md). Slang also decays
fast, so re-run periodically. Terms are lower-cased single tokens / short phrases;
offensive terms are kept (this is a safety classifier) but flagged.
"""

import argparse
import json
import re
import time
import urllib.parse
import urllib.request

API = "https://en.wiktionary.org/w/api.php"

# Wiktionary categories that carry British / UK informal vocabulary.
CATEGORIES = [
    "British slang",
    "British English",
    "Multicultural London English",
    "Cockney rhyming slang",
    "Scottish English",
    "Welsh English",
    "Irish English",
    "English internet slang",
    "English text messaging slang",
    "English informal terms",
]

WORD_RE = re.compile(r"^[a-z][a-z' \-]{1,24}$")


def fetch_category(cat: str) -> list[str]:
    out, cont = [], None
    while True:
        params = {
            "action": "query",
            "list": "categorymembers",
            "cmtitle": f"Category:{cat}",
            "cmlimit": "500",
            "cmtype": "page",
            "format": "json",
        }
        if cont:
            params["cmcontinue"] = cont
        url = f"{API}?{urllib.parse.urlencode(params)}"
        req = urllib.request.Request(url, headers={"User-Agent": "foren-ml-lexicon/1.0 (research contact: israel.egede@outlook.com)"})
        data = None
        for attempt in range(6):
            try:
                with urllib.request.urlopen(req, timeout=30) as r:
                    data = json.load(r)
                break
            except urllib.error.HTTPError as e:
                if e.code == 429:
                    time.sleep(3 * (attempt + 1))  # backoff
                    continue
                raise
        if data is None:
            raise RuntimeError("rate-limited after retries")
        for m in data.get("query", {}).get("categorymembers", []):
            title = m.get("title", "")
            if ":" in title:  # skip namespaced pages
                continue
            out.append(title)
        cont = data.get("continue", {}).get("cmcontinue")
        if not cont:
            break
        time.sleep(0.2)  # be polite to the API
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="data/uk_slang_lexicon.json")
    args = ap.parse_args()

    terms: dict[str, list[str]] = {}
    for cat in CATEGORIES:
        time.sleep(2)  # space out categories to stay under the rate limit
        try:
            members = fetch_category(cat)
        except Exception as e:  # noqa: BLE001
            print(f"  ! {cat}: {e}")
            continue
        kept = 0
        for t in members:
            low = t.strip().lower()
            if WORD_RE.match(low):
                terms.setdefault(low, [])
                if cat not in terms[low]:
                    terms[low].append(cat)
                kept += 1
        print(f"  {cat:32s} {len(members):5d} members, {kept:5d} kept")

    payload = {
        "source": "en.wiktionary.org (CC BY-SA) via MediaWiki API",
        "categories": CATEGORIES,
        "count": len(terms),
        "terms": sorted(terms.keys()),
        "term_categories": terms,
    }
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=0)
    print(f"\n{len(terms)} unique British/informal terms → {args.out}")


if __name__ == "__main__":
    main()
