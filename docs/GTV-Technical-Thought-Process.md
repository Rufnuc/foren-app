# Foren — How I Built It: Technical Thought Process

*Background brief for my technical recommender (UK Global Talent Visa, Tech Nation — Exceptional Promise).*

> **How to use this:** This is my own account of how I reasoned through building Foren, so you have concrete technical detail to draw on. Please write the letter in your own words and only attest to what you can genuinely speak to — Tech Nation screens out generic or templated letters, and everything here should be verifiable. I've flagged what is live today versus what is still scaffolded so nothing is overstated.

---

## 1. The problem I set out to solve

Survivors of domestic abuse and coercive control need to document what is happening to them, but the tools they have actively work against them:

- Their phone is often **shared or monitored**, so saved photos, notes, or an obvious "evidence app" can be discovered — and put them in danger.
- Screenshots and photos are **trivially editable**, so they are doubted exactly when it matters — in court or a case review.
- Cloud tools create **accounts, trails, and third-party custody** of the most sensitive data a person owns.

So the real problem isn't "store some files." It's: *let a person in a hostile environment capture sensitive material, keep it invisible, and later prove it wasn't altered — while trusting no server, and ideally no one, with the contents.* That framing is what drove every technical decision that followed.

## 2. The core thesis

Design for an **adversary who has physical access to the device**, and remove every party the user would otherwise have to trust. Concretely, three properties, in tension, that I had to satisfy at once:

1. **Deniable** — nothing on the phone should reveal that evidence exists.
2. **Private** — the contents should be readable only by the user, never by me, a server, or anyone who seizes the device without the passcode.
3. **Provable** — despite (1) and (2), the user must be able to demonstrate to a third party that an item existed, unaltered, on a given date.

Most products pick one. The engineering challenge was holding all three together.

## 3. Key technical decisions and why I made them

**Threat model first, features second.** Before building features I defined the adversary (a controlling partner with device access, not a remote hacker). That decision cascaded into the disguise, the duress passcode, and a panic-wipe — capabilities that only make sense once you take that threat model seriously.

**The disguise.** The app presents as an ordinary puzzle game. The real vault is reached through a hidden gesture/passcode. A **duress passcode** opens a convincing but empty decoy vault, so a user who is forced to unlock the app under coercion can comply without exposing anything. This is a deliberate answer to "what happens when the abuser makes them open it?"

**Zero-knowledge, local-first.** Everything is encrypted **on the device** using the Web Crypto API — a passphrase stretched with **PBKDF2-SHA256 (100,000 iterations)** into an AES-256-GCM key. The passcode itself is **never stored** — only a salted hash is kept and re-derived on each unlock to compare. There is no account and no server custody of content; data does not leave the device unless the user explicitly exports it. I chose this because the safest data to seize is data no one else can read — it removes me and any server from the trust boundary entirely.

**Recovery without a backdoor.** No-account encryption creates a hard problem: if the user forgets their passcode, no one — including me — can recover their data, by design. So I built a proper recovery layer around a single ~160-bit secret expressed three interchangeable ways: a **TOTP** authenticator secret (I implemented RFC-4648 base32 and the `otpauth://` provisioning URI), **eight BIP39 words**, or a printed code. As with the passcode, only a *salted hash of the normalised secret* is stored — never the secret. This gives real account recovery without ever creating a master key or a backdoor that would break the zero-knowledge guarantee.

**Tamper-evidence via hashing + public anchoring.** To make items provable without revealing them, each item is hashed and combined into a **SHA-256 Merkle tree**; the tree's root is **anchored to public blockchains** (Solana, and Bitcoin via OpenTimestamps). Only the hash is ever published — never the content — but it yields an independent, third-party-verifiable timestamp proving the material existed and hasn't changed since. That's a real chain-of-custody property that a screenshot can never have. I was deliberate about *what* the hash commits to: the Merkle leaf covers only the immutable facts (id, type, timestamp, content) and **excludes derived analysis** (severity, tags), so a user can hand over a bundle that omits sensitive inferences and it still verifies.

**A self-verifying export that requires no trust in me.** The court bundle (`foren-bundle-v1`) is designed so any third party can verify it **offline, with zero trust in Foren**: every item ships its leaf hash and Merkle proof, and the proof-chain carries the root, the Solana transaction, and an **OpenTimestamps proof any standard OTS client can independently check** against Bitcoin. A verifier recomputes each leaf hash from the raw content and folds it through the proof to reproduce the root. A human-readable PDF accompanies the machine-verifiable JSON. This "don't trust us — check it yourself" property is, to me, what makes the evidence actually credible.

**On-device AI, for privacy not novelty.** Captured photos and recordings are only useful if they're searchable and organized. I run **OCR (Tesseract.js)** and **speech-to-text (Whisper via transformers.js)** **entirely on the device**. The point isn't "we use AI"; it's that keeping inference local is the only way to make evidence usable *without* sending a survivor's most sensitive material to a cloud service.

**Stack choices.** React 18 + TypeScript + Vite for the app; Zustand and React Query for state; Dexie over IndexedDB for encrypted local storage; a thin Node relay only for blockchain anchoring (which needs network, but only ever sees hashes). Each choice was made to keep the security-critical surface small and the contents on the client.

## 4. The hardest problems, and how I approached them

- **Reconciling deniability with capability.** Every powerful feature (e.g. broad device import) enlarges the app's permission footprint, which weakens the disguise. I treated this as an explicit *capability-vs-deniability* tradeoff rather than pretending it away — e.g. keeping advanced access opt-in, off by default, requested only on enable, and reachable only after unlock.
- **Proving without revealing.** Getting to "publish a commitment, not the data" (Merkle root anchoring) was the key unlock for making private data legally credible.
- **Failing safely.** A subtle one: browser cryptography (`crypto.subtle`) is only available in a secure context (HTTPS/localhost). When the app was opened over a plain-HTTP LAN address, key derivation silently failed and passcode setup appeared to "not work." I diagnosed it as an environment/secure-context issue rather than a logic bug, and added an explicit secure-context guard and surfaced errors instead of hanging — the kind of failure that matters enormously in a safety tool.

## 5. The judgment calls — what I deliberately did *not* build

I think these show as much as the features:

- **I tested a machine-learning classifier and chose *not* to ship it.** To auto-triage the severity of a message, I evaluated on-device zero-shot models (bart-large-mnli and deberta-v3-small via transformers.js). The calibration data was damning: they scored benign and genuinely threatening messages almost identically (~0.74–0.86 across every category), which would mislabel ordinary messages as critical threats. For a tool people's safety depends on, a confidently wrong classifier is worse than none, so I shipped a transparent, deterministic keyword heuristic that abstains cleanly on benign text, and documented the ML result in the code as the reason. Running the experiment, reading the numbers, and rejecting the fashionable option on safety grounds is the decision I'm most proud of.
- **No mass data-hoarding.** It's tempting to "scan the whole phone and grab everything." I rejected it: it's technically blocked by the OS sandbox anyway, it would create a huge dangerous cache, and indiscriminate dumps make *weaker* legal evidence than targeted, user-confirmed items. The design keeps a human confirmation step and only stores what the user approves.
- **No cloud, no accounts, no analytics on content.** Anything that reduces the user's control was cut.
- **Honest about the boundary of consent.** When I explored deeper device import, I worked through what user permission can and cannot unlock (it doesn't bypass the sandbox to read other apps' messages), rather than promising something the platform forbids.

## 6. What this demonstrates about how I work

- I start from a **threat model and the user's real situation**, then let architecture follow — not the other way around.
- I can combine **applied cryptography, distributed-systems primitives (Merkle trees, blockchain timestamping), on-device ML, and product/safety design** into one coherent system.
- I make **deliberate tradeoffs** and can articulate why, including choosing *not* to build things.
- I care about **failing safely and telling the truth** about what's real — which, for a tool people's safety depends on, is the whole game.

## 7. Honest current state (please don't overstate)

- **Live today:** the game disguise (three playable decoy games) + duress vault; on-device AES-256 encryption with no accounts/cloud; multi-method recovery (TOTP / BIP39 / printed); Merkle hashing; on-device OCR and transcription; the deterministic severity heuristic; offline-verifiable export bundles (JSON + PDF); blockchain anchoring wired end-to-end.
- **Scaffolded / in progress:** some anchoring paths run against test networks or confirm asynchronously; IPFS storage and an emergency-dispatch feature are scaffolded; independent security audit and survivor/advocate UX research are next (and part of what funding would support).
- The product is **pre-launch and in active development** — its significance is the architecture and the technical judgment behind it, not user numbers yet.

## 8. If it helps your letter

You may be able to speak to: the sophistication of the threat-modelling and cryptographic design (zero-knowledge encryption, backdoor-free recovery, and an evidence bundle any third party can verify without trusting me); my ability to integrate multiple advanced domains — applied cryptography, distributed timestamping, on-device ML — into one working system; the maturity of the tradeoffs, especially what I chose *not* to do (mass data collection, and a miscalibrated ML classifier I tested and rejected); and my potential to grow this into meaningful work. Please frame it in your own words and only to the extent you've genuinely observed — I'm happy to walk you through the codebase or a live demo so you can verify any of the above first-hand.
