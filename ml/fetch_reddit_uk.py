"""Fetch authentic British chat text from UK subreddits via the OFFICIAL Reddit
API. This is a scaffold you run with YOUR OWN credentials — it needs a Reddit
app, so an assistant can't run it for you.

Why: public toxicity data (civil_comments) is American-skewed. UK subreddits give
authentic British informal register — mostly BENIGN, which is exactly what the
model needs to STOP false-flagging British chat ("cheeky nandos", "brew", "you
alright mate"). It is NOT labelled abuse data; treat pulled rows as candidate
NEGATIVES or as texts to hand to eval_set.py for human labelling.

Setup (one-time):
  1. Create a "script" app at https://www.reddit.com/prefs/apps  → note the
     client id (under the app name) and secret.
  2. Export credentials:
       export REDDIT_CLIENT_ID=...        REDDIT_CLIENT_SECRET=...
       export REDDIT_USERNAME=...         REDDIT_PASSWORD=...
  3. Run:
       python fetch_reddit_uk.py --out data/reddit_uk_candidates.jsonl --limit 400

Compliance: respects Reddit's API terms + rate limits (1 req/sec here). Do NOT
store usernames or any PII — this script keeps ONLY the comment text, and short
comments only. Review Reddit's Data API terms before redistributing anything.
"""

import argparse
import json
import os
import re
import time
import urllib.parse
import urllib.request

SUBREDDITS = ["CasualUK", "AskUK", "britishproblems", "unitedkingdom", "Scotland", "Wales", "london"]
UA = "foren-ml-uk-register/1.0 (research; contact israel.egede@outlook.com)"
CLEAN = re.compile(r"^[\sa-zA-Z0-9 ,.!?'\"£$%&()\-:;@#]+$")


def token() -> str:
    cid = os.environ["REDDIT_CLIENT_ID"]
    secret = os.environ["REDDIT_CLIENT_SECRET"]
    user = os.environ["REDDIT_USERNAME"]
    pw = os.environ["REDDIT_PASSWORD"]
    body = urllib.parse.urlencode({"grant_type": "password", "username": user, "password": pw}).encode()
    auth = urllib.request.HTTPPasswordMgrWithDefaultRealm()
    req = urllib.request.Request("https://www.reddit.com/api/v1/access_token", data=body, method="POST")
    import base64

    req.add_header("Authorization", "Basic " + base64.b64encode(f"{cid}:{secret}".encode()).decode())
    req.add_header("User-Agent", UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)["access_token"]


def api_get(path: str, tok: str) -> dict:
    req = urllib.request.Request(f"https://oauth.reddit.com{path}")
    req.add_header("Authorization", f"bearer {tok}")
    req.add_header("User-Agent", UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def usable(text: str) -> bool:
    text = text.strip()
    if not (8 <= len(text) <= 200):
        return False
    if text in ("[deleted]", "[removed]"):
        return False
    if "http" in text or "\n\n" in text:
        return False
    return bool(CLEAN.match(text))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="data/reddit_uk_candidates.jsonl")
    ap.add_argument("--limit", type=int, default=400, help="approx total comments to keep")
    args = ap.parse_args()

    try:
        tok = token()
    except KeyError as e:
        raise SystemExit(f"Missing env var {e}. See the setup block at the top of this file.")

    rows, seen = [], set()
    per_sub = max(20, args.limit // len(SUBREDDITS))
    for sub in SUBREDDITS:
        try:
            listing = api_get(f"/r/{sub}/hot?limit=25", tok)
        except Exception as e:  # noqa: BLE001
            print(f"  ! r/{sub}: {e}")
            continue
        kept = 0
        for post in listing.get("data", {}).get("children", []):
            pid = post["data"]["id"]
            time.sleep(1.0)  # rate limit: 1 req/sec
            try:
                comments = api_get(f"/r/{sub}/comments/{pid}?limit=30&depth=1", tok)
            except Exception:
                continue
            for c in comments[1].get("data", {}).get("children", []):
                body = c.get("data", {}).get("body", "")
                if usable(body) and body.lower() not in seen:
                    seen.add(body.lower())
                    # tags empty = candidate negative; source marks provenance for review.
                    rows.append({"text": body.strip(), "lang": "en", "tags": [], "severity": 1,
                                 "source": f"reddit-{sub}-candidate"})
                    kept += 1
            if kept >= per_sub:
                break
        print(f"  r/{sub:16s} kept {kept}")

    with open(args.out, "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    print(f"\n{len(rows)} UK candidate rows → {args.out}")
    print("NOTE: these are UNLABELLED candidates. Review before use — feed to eval_set.py "
          "for human labelling, or use as negatives ONLY after spot-checking none are abusive.")


if __name__ == "__main__":
    main()
