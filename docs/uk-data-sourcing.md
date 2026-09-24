# UK data sourcing for the analysis model

The app's prime market is the UK, but the public training data (`civil_comments`
/ Jigsaw) is American-skewed, and the templates are register-neutral. This is the
practical guide to closing that gap. It splits into three needs — **vocab**,
**style**, and **abuse register** — because only the first is a clean download.

Everything here feeds the existing pipeline: sources become JSONL
(`{text, lang, tags, severity, source}`), gated through `data_tools.py`, merged
into training, and tested against the held-out gold eval (`build_gold_eval.py`).

---

## 1. Slang lexicon (VOCAB) — ✅ automated

`ml/fetch_uk_slang.py` pulls **31k+ British/informal terms** from Wiktionary
(CC BY-SA, no auth) → `data/uk_slang_lexicon.json`. Categories: British slang,
MLE (Multicultural London English), Cockney, Scottish/Welsh/Irish English,
internet + text-messaging slang.

- **Use:** reference asset + seeds the curated, label-safe substitutions in
  `augment.py` (`BRITISH_SUBS` / `BRITISH_TAGS`). We do **not** inject random
  lexicon nouns into abuse messages — that would corrupt labels.
- **Refresh:** slang decays; re-run periodically.
- **Better lexicon (optional, licensed):** Green's Dictionary of Slang
  (greensdictofslang.com) is the authoritative British slang dictionary with an
  API — requires an access agreement; not scriptable for free.

## 2. Authentic British chat (STYLE) — ⚙️ needs your credentials / registration

Teaches the model how Brits actually text — mostly **benign** register, which is
what stops false-flagging ("cheeky nandos", "brew", "you alright mate").

- **Reddit UK subreddits** — `ml/fetch_reddit_uk.py` (scaffold, ready to run).
  Create a script app at reddit.com/prefs/apps, export `REDDIT_CLIENT_ID` etc.,
  run it. Pulls r/CasualUK, r/AskUK, r/britishproblems, r/Scotland, r/Wales… as
  candidate **negatives** (unlabelled — review before use). Respects API terms +
  1 req/sec. Keeps text only, no usernames/PII.
- **Spoken BNC2014** (Lancaster/Cambridge, ~11.5M words of contemporary UK
  conversation) — the best register corpus. Free for research but requires
  registration (CQPweb). Download, then convert utterances → candidate JSONL.
- **HuggingFace** — search "British English" / "UK Twitter"; several
  geo-tagged/informal sets exist under permissive licences.

## 3. British abuse / DV register (THE REAL GAP) — 🤝 needs partnership

Generic slang won't capture British *threatening/coercive* phrasing. Ranked:

1. **Partner a UK DV organisation** — Refuge, Women's Aid / Welsh Women's Aid,
   **SafeLives**, Galop. Highest value: gives both real British DV message
   examples *and* the DV-advocate labelling the gold eval needs (§ eval below).
   This is the same human-annotation bottleneck the model keeps hitting.
2. **LLM-augment into British register** — `synth.py` already supports a
   pluggable LLM provider (`FOREN_LLM_BASE_URL/_API_KEY/_MODEL`, OpenAI-compatible
   → works with a local Ollama/LM Studio too). Prompt it to rewrite labelled
   messages as British texting. Cheap, but synthetic — spot-review, never train
   on it alone.
3. **Public offence datasets** (partial UK content, general not DV): OLID/
   OffensEval, HASOC, HatEval. Map via a `map_public.py`-style script.

## What's already been done (this pass)

- `fetch_uk_slang.py` → 31k-term Wiktionary lexicon (committed as a reference).
- `augment.py` gained a **British register layer** (`--british-per-row`):
  label-safe restyling (ya/bruv/proper/innit/dropped-g's/tags) applied to English
  rows, so the model trains on UK register.
- `seed_gen.py` gained real **British abuse idioms** (battered / do you in / sort
  you out / wasteman / allow it …) with correct labels.
- `build_gold_eval.py` gained **20 British-register rows** (abuse + benign) so UK
  coverage is measured, not assumed. Baseline before this work: British benign
  false-positive 3/3, abuse recall 7/13.

## The gold eval (the safety gate) — still needs humans

`data/gold_eval.jsonl` is authored (assistant) in authentic styles incl. British
and is **held out of training**. It is tagged `gold-eval-draft` and must be
reviewed by **DV advocates** (per language) before it is trusted as a true safety
gate. `eval_set.py template` turns any candidate pile (e.g. Reddit pulls) into a
review CSV; `eval_set.py import` brings the labelled rows back.

## Licensing / privacy checklist (this is a survivor-safety app)

- Keep every source tagged (`source=`) — provenance matters for a privacy-first
  product and for defending the model.
- Reddit/BNC/Green's each have terms; scraped chat can carry consent/GDPR issues.
  Store **text only**, never usernames/handles/PII.
- Synthetic data is fabricated, never real evidence — already the project's rule.
