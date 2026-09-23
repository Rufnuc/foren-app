# Foren — On-device analysis model (spec)

The analysis engine tags evidence (messages, transcripts, OCR'd text) with
**pattern tags** and a **severity** estimate. It runs entirely on-device and is
**assistive, not authoritative** — every output is editable and is labelled
machine-generated in exports, the same standard applied to OCR/ASR.

Today `src/lib/analysis.ts` is a keyword heuristic. This spec is the plan to
replace it with a trained model.

## Architecture (decided)

- **Model:** fine-tuned small **encoder classifier** (not a generative SLM).
  Multi-task heads on one shared encoder: sigmoid multi-label for tags, ordinal
  head for severity. Deterministic, ~tens of ms, fits the existing
  transformers.js / ONNX Web-Worker runtime (same as Whisper/Tesseract), no
  WebGPU needed.
- **Multilingual:** base `distilbert-base-multilingual-cased` (**WordPiece**),
  **vocab-pruned** to the supported language set. WordPiece was chosen over
  `paraphrase-multilingual-MiniLM` (SentencePiece) after the MiniLM tokenizer was
  found NOT to round-trip through transformers.js in the browser — it dropped the
  `▁` word-boundary marker, giving wrong token ids and wrong predictions
  (verified on-device). WordPiece matches the Python reference exactly and prunes
  far more easily (119k vocab → the target languages). int8 is ~135 MB unpruned;
  pruning targets ~40–60 MB. **Classify on the original-language text** — never
  translate-then-classify for the severity call (mistranslated coded threats are
  the failure mode we can't afford).
- **ASR / language provisioning:** language-conditional model packs, downloaded
  on demand:
  - English only → `whisper-base.en` (smaller + more accurate for English).
  - Any non-English → one shared multilingual Whisper (covers all their
    non-English at once); tier by resource level (`base` for high-resource,
    `small` for low-resource).
  - A lightweight **language detector** is always available so evidence in an
    un-provisioned language is caught and the user is prompted to add that pack
    (never silently mis-transcribed).
  - OCR (Tesseract traineddata) and, optionally, a per-language classifier vocab
    are the fine-grained per-language downloads.
- **Runtime hygiene:** run in a Web Worker; int8 ONNX; short max sequence length
  (~128 tokens) with chunk-and-aggregate for long transcripts (severity =
  max over chunks; tags = union).

## Pattern tags (multi-label)

A single message can carry several. Grounded in DV / coercive-control / stalking
literature.

| Tag | What it captures |
| --- | --- |
| `threat` | Explicit threat of harm ("I'll hurt you"). |
| `physical-violence` | References to past/present physical violence. |
| `sexual` | Sexual coercion/threats; image-based abuse (NCII) threats. |
| `stalking` | Following, showing up, tracking movements. |
| `surveillance` | Knowing your location/activity ("I saw you at…"), monitoring, tracking. |
| `coercive-control` | Rules, demands, restricting freedom, monitoring. |
| `intimidation` | Implied/menacing threats ("you'll regret it"). |
| `harassment` | Repeated unwanted contact, insults. |
| `isolation` | Cutting you off from friends/family/support. |
| `financial-abuse` | Controlling money; threats about money/resources. |
| `contact-breach` | Contact after being told to stop / breaching a no-contact order. |
| `child-related` | Threats involving children; custody threats. |
| `manipulation` | Self-harm threats used to control; guilt-tripping; gaslighting-style denial. |
| `degradation` | Name-calling, humiliation, verbal abuse. |

Out of scope for the model: **determinations of guilt**, credibility judgements,
party identity. Offence *relevance* is assigned assistively (see
[Legal-offence assignment](#legal-offence-assignment-ai-driven) below), but
whether an offence is actually made out is for the police, prosecutors and courts.

## Severity rubric (ordinal 1–4)

Per-message estimate. Context/patterns are aggregated at the timeline level; a
single low message inside an escalating pattern can still matter, so severity is
per-message and the case view rolls it up.

| Level | Anchor |
| --- | --- |
| **4 Critical** | Explicit, credible threat of serious physical/sexual harm or death; weapons; threat + means/opportunity; threats to kill/seriously harm you or children; imminent danger. |
| **3 High** | Serious threats without explicit lethality; "you'll regret it" + knowledge of your location; image-based sexual-abuse threats; stalking with location knowledge; clear escalation. |
| **2 Medium** | Intimidation, coercive demands, persistent harassment, degradation, monitoring — without an explicit threat. |
| **1 Low** | Unwanted contact, mild insults, boundary-pushing, with no threat or coercion. |

## Legal-offence assignment (AI-driven)

The report names the offences a case's behaviour may engage. Today that is a
**static table** — each pattern tag → every offence it could conceivably engage,
all dumped into the PDF. That over-lists and reads as noise (a `threat` always
prints threats-to-kill *and* fear-of-violence *and* malicious-comms, whether or
not the content fits each). The model should instead **assign** the offences the
specific behaviour actually engages, and rank them — without ever ruling on guilt.

Design:

- Assignment is driven by the model's **per-pattern confidence** plus finer
  **legal-element signals** it predicts — the distinctions that decide *which*
  offence applies. E.g. within `threat`: threat-to-life vs threat-of-violence vs
  threatening-message; within `surveillance`: device/account access vs physical
  monitoring; within `sexual`: contact vs image-based (NCII). Elements are
  jurisdiction-neutral facts about the message.
- A **jurisdiction offence map** (curated, in `src/legal/offences.ts`) links each
  element to offences, each carrying a **trigger** (which element + minimum
  confidence must be present) and a **primary/secondary** rank.
- At report time the offence layer includes an offence **only when the model
  confidently detected its trigger**, orders them by confidence, ties each to the
  **evidence/quote that triggered it**, and surfaces the **confidence**. No
  blanket lists.
- **Statute text stays curated and solicitor-reviewed** — the model never
  generates or interprets law, it only selects and ranks from the reviewed
  knowledge base. Legal accuracy lives in reviewed data, not model weights.
- Jurisdiction (E&W / Scotland / NI, extensible) is the user's choice; the same
  element signals map onto that jurisdiction's offences.

Data implication: the annotation guideline gains **legal-element labels** (and,
where feasible, direct offence-relevance labels), reviewed by a **legal DV
specialist** alongside the DV-advocate review. A dedicated offence-relevance head
is an option once such labels exist; the element-conditioned map is preferred
because it keeps the law in reviewed data.

Safety: outputs always say the behaviour **may engage** an offence, with
confidence — never that an offence is made out. Every assignment is editable;
low-confidence items are shown as "possible — review" or withheld; same
assistive / machine-generated labelling as tags.

Interim (keyword era): until the model lands, `src/legal/offences.ts` stays a
curated map and the report should present a **primary** offence per pattern with
the rest collapsed under "may also engage", rather than a flat dump.

## Safety design (non-negotiable)

- **Recall-favoured thresholds** for high-severity/threat tags — over-flag and let
  the survivor dismiss, rather than miss a threat.
- **Every tag + severity editable**; corrections captured (feed future training).
- **Confidence surfaced**; low-confidence or un-provisioned-language items routed
  to **human review** instead of confident auto-tags.
- **Labelled assistive / machine-generated** wherever it appears, including the
  court bundle.

## Data plan (the real work)

No clean public "survivor-evidence severity" dataset exists. Realistic path:

1. **Taxonomy + rubric** (this doc) → the annotation guideline.
2. **Seed** from adjacent public sets (Jigsaw `threat`/toxicity, cyberbullying,
   hate-speech) mapped to the taxonomy — for the pieces they cover.
3. **Synthetic augmentation** per language with an offline LLM (fabricated
   training text only — never real evidence), de-duplicated and expert-reviewed;
   never train on synthetic alone.
4. **Hand-labelled eval set** — ideally reviewed by DV advocates, held out, in the
   real message styles/dialects of the target languages. This is the single most
   important asset; without it we cannot claim the model is safe.
5. **Uneven coverage is expected**: strong English + a few priority languages;
   the human-review fallback covers the rest.

## Priority languages (decided): en, fr, es, ar, cy

| Lang | OCR (Tesseract) | Whisper | Notes |
| --- | --- | --- | --- |
| English (en) | `eng` | `whisper-base.en` | strong everywhere. |
| French (fr) | `fra` | shared multilingual `base` | strong. |
| Spanish (es) | `spa` | shared multilingual `base` | strong. |
| Arabic (ar) | `ara` | shared multilingual **`small`** | **RTL** UI needed; dialect + **Arabizi** (Latin-script Arabic) is a real gap; scarce labelled data → lean on human review. |
| Welsh (cy) | `cym` | **`small` or Welsh-specialised (techiaith/Bangor)** | low-resource; ~no labelled abuse data → synthetic + expert review; specialised Welsh Whisper beats the general model. |

Provisioning logic:
- English-only user → `whisper-base.en`.
- Any of fr/es/ar/cy enabled → one shared multilingual **`whisper-small`** (tier set
  by the weakest enabled language; ar/cy require `small`), optionally + a
  Welsh-specialised Whisper pack.
- Classifier: one multilingual MiniLM **vocab-pruned to {en,fr,es,ar,cy}**.
- Always keep a language detector; prompt to add a pack for un-provisioned
  languages.

### Dependencies this surfaces
- **RTL / bidi UI support for Arabic** (app is LTR-only today) — front-end task,
  separable from the model.
- **Arabizi handling** — include Latin-script-Arabic examples in synthetic data +
  a normalisation step, or route to human review.
- **Welsh eval data** — partner with a Welsh DV org; this is the scarcest asset.

## Pipeline (once data exists)

taxonomy → label/seed/synthesise → fine-tune MiniLM (HF Transformers, MPS/Colab) →
export ONNX + int8 (optimum) + vocab-prune → drop in behind `analysis.ts`
interface, heuristic as cold-start fallback → calibrate thresholds on the eval set.
