"""Canonical label definitions for the Foren analysis model.

Single source of truth — mirrors docs/analysis-model.md. Everything else
(dataset encoding, training, export) imports from here so the labels can never
drift out of sync.

Planned extension (see the "Legal-offence assignment" section of the spec): finer
legal-element labels so the model can *assign* which offences a message engages
(with confidence) rather than the report dumping every offence mapped to a tag.
Offence text + jurisdiction mapping stay curated app-side in src/legal/offences.ts.
"""

# Multi-label pattern tags. A message can carry several.
TAGS = [
    "threat",
    "physical-violence",
    "sexual",
    "stalking",
    "surveillance",
    "coercive-control",
    "intimidation",
    "harassment",
    "isolation",
    "financial-abuse",
    "contact-breach",
    "child-related",
    "manipulation",
    "degradation",
]
TAG_TO_IDX = {t: i for i, t in enumerate(TAGS)}
NUM_TAGS = len(TAGS)

# One-line gloss per tag. Used by the synthetic-data prompts and any tooling that
# needs to explain a label; keep these tight and behavioural, not clinical.
TAG_DESCRIPTIONS = {
    "threat": "a stated intention to cause harm (to the person, others, or self as leverage)",
    "physical-violence": "reference to physical assault — hitting, choking, using a weapon",
    "sexual": "sexual coercion, unwanted sexual content, or threats to share intimate images",
    "stalking": "following, showing up, or repeated unwanted pursuit",
    "surveillance": "monitoring or tracking — location, phone, messages, cameras, spyware",
    "coercive-control": "controlling everyday life — movement, money, contacts, decisions",
    "intimidation": "instilling fear through menace, gestures, or implied consequences",
    "harassment": "repeated unwanted contact or pestering",
    "isolation": "cutting the person off from friends, family, or support",
    "financial-abuse": "controlling or withholding money, sabotaging work or accounts",
    "contact-breach": "contacting despite being told to stop or a no-contact boundary/order",
    "child-related": "using children as leverage — threats about custody, access, or harm",
    "manipulation": "guilt, gaslighting, or false promises to distort the person's reality",
    "degradation": "insults, humiliation, or belittling that attacks the person's worth",
}

# Severity is ordinal 1..4 in the data; the model uses 0..3 internally.
SEVERITY_NAMES = {1: "low", 2: "medium", 3: "high", 4: "critical"}
SEVERITY_DESCRIPTIONS = {
    1: "low — unpleasant or controlling but no imminent danger",
    2: "medium — a clear abusive pattern; distressing, escalating",
    3: "high — explicit threat, stalking, or fear for safety",
    4: "critical — threat to life or serious harm; act now",
}
NUM_SEVERITY = 4

# Priority languages (drives vocab pruning + provisioning; see the spec doc).
LANGUAGES = ["en", "fr", "es", "ar", "cy"]

# Any severity >= this counts as "high-severity" for the safety-recall metric.
HIGH_SEVERITY_MIN = 3
