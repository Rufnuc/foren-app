# Foren — Technical Architecture Overview

*Prepared as supporting evidence for a UK Global Talent (Digital Technology) application.*
*Factual technical description of the Foren product as implemented in the codebase.*

---

## Executive summary

**Foren is a survivor-facing evidence vault** for people experiencing harassment, stalking, or
domestic abuse. It lets a survivor privately capture and organise evidence (messages, screenshots,
audio), then produce a court-ready bundle whose integrity can be independently verified — without
anyone, including Foren's own servers, ever being able to read the evidence.

Three properties make the product technically distinctive:

1. **Disguised, local-first, zero-knowledge.** The app presents as an ordinary phone game (2048,
   Sudoku, or Wordle). The real vault is unlocked only through a hidden gesture and passcode.
   Evidence is encrypted **on the device** with a key derived from the user's passcode; the key
   never leaves the device and the servers are designed never to receive plaintext.
2. **Cryptographic tamper-evidence.** Every case's evidence is committed to a **SHA-256 Merkle
   tree**, and that commitment is anchored to public blockchains (Solana and, via OpenTimestamps,
   Bitcoin). Any later change to the evidence breaks the proof.
3. **Independent verification.** An exported case bundle can be checked by a third party (e.g. a
   court) entirely offline for internal integrity, and against the public blockchain record — with
   no need to trust Foren.

The implementation is a ~5,900-line TypeScript/React application (≈70 modules) plus a ~1,050-line
Node/TypeScript backend relay, using production-grade primitives (Web Crypto AES-256-GCM,
PBKDF2-SHA256, IndexedDB, on-device machine-learning models, and real blockchain transactions).

> **Scope note.** This document describes what is implemented and verified in the codebase, and
> clearly marks the small number of components that are **scaffolded or simulated** for the current
> build (noted inline). It does not describe features that are not present.

---

## 1. System overview

**What it does.** Foren lets a survivor: (a) enter through a decoy game so the app is not obviously
an evidence tool; (b) create *cases* and add *evidence items* (pasted text, images, audio); (c) have
each item analysed for severity and abuse patterns on-device; (d) cryptographically commit a case
and anchor that commitment on public blockchains; (e) export a self-verifying bundle (JSON + PDF) for
courts or advocates; and (f) recover or destroy the vault safely.

**The core problem it solves.** Evidence of abuse is (i) *unsafe to hold* — an abuser with access to
the phone can find it; (ii) *easy to dispute* — screenshots can be dismissed as fabricated or
back-dated; and (iii) *privacy-hostile* — most "cloud evidence" tools require trusting a third party
with extremely sensitive material. Foren addresses all three: disguise + on-device encryption for
safety and privacy, and Merkle + blockchain anchoring for tamper-evidence and admissibility.

**Major components.**

- **Client application** (React/TypeScript PWA) — the entire user experience and all cryptography.
- **On-device data layer** (encrypted IndexedDB) — where evidence lives.
- **On-device AI** — OCR, speech-to-text, and content analysis, all running in the browser.
- **Cryptographic commitment layer** — Merkle tree + export/verification.
- **Anchoring relay** (Node/Express backend) — submits commitments to Solana and Bitcoin.
- **Independent verification page** — public, requires no login.

---

## 2. Architecture breakdown

```
                         DEVICE (browser — nothing leaves unless the user exports)
  ┌──────────────────────────────────────────────────────────────────────────────┐
  │  Disguise & unlock         Vault UI              On-device intelligence         │
  │  ┌───────────────┐   ┌──────────────────┐   ┌────────────────────────────────┐ │
  │  │ 2048 / Sudoku │   │ Cases, timeline, │   │ OCR (Tesseract) · ASR (Whisper)│ │
  │  │ Wordle + hidden│──▶│ evidence, export │◀──│ Severity/pattern analysis       │ │
  │  │ gesture+keypad │   └────────┬─────────┘   └────────────────────────────────┘ │
  │  └───────────────┘            │                                                 │
  │        │ passcode             ▼                                                 │
  │        ▼               ┌──────────────────────┐     ┌───────────────────────┐   │
  │  PBKDF2-SHA256 ───key─▶│ AES-256-GCM encrypt   │────▶│ IndexedDB (ciphertext)│   │
  │  (in memory only)      └──────────┬───────────┘     └───────────────────────┘   │
  │                                   ▼                                             │
  │                        SHA-256 Merkle commitment  ──▶  self-verifying export    │
  └───────────────────────────────────┬────────────────────────────(JSON + PDF)────┘
                                       │ root hash only (no evidence)
                                       ▼
                       ┌───────────────────────────────┐
                       │  Anchoring relay (Node/Express)│  holds signing key,
                       │  POST /v1/anchor/solana        │  never sees evidence
                       │  POST /v1/anchor/bitcoin       │
                       └───────────┬───────────┬────────┘
                                   ▼           ▼
                          Solana (SPL Memo)   Bitcoin (via OpenTimestamps)
                                   ▲
                     Independent verification page ── recomputes Merkle root
                     (public, no login)              + checks on-chain record
```

### 2.1 Frontend / client layer
A single-page application built with **React 18 + TypeScript + Vite**, styled with **Tailwind CSS**,
with **Zustand** for in-memory session state, **React Query** for asynchronous data, and **React
Router v6** for navigation. This layer is not a thin shell — it contains essentially all of the
product's logic, including all cryptography, the ML pipelines, and the verification engine. Three
fully playable decoy games (2048, Sudoku, Wordle) are implemented as real games so the disguise is
convincing.

### 2.2 Backend / API layer (anchoring relay)
A small **Node.js + Express (TypeScript)** service (part of the sibling *prutet* project) whose sole
job is to submit cryptographic commitments to public blockchains on the client's behalf, so that a
blockchain signing key is **never exposed to the browser**. It is hardened with `helmet`, CORS
allow-listing, per-route rate limiting, and `zod` request validation, and exposes:
`POST /v1/anchor/solana` (anchor a Merkle root), `POST /v1/anchor/bitcoin` (timestamp a root), and
`POST /v1/anchor/bitcoin/verify`. Crucially, the relay only ever receives a **64-character hash** —
never any evidence.

### 2.3 Data storage layer
All evidence is stored **locally in IndexedDB** (via **Dexie**). Sensitive fields — case titles,
descriptions, and evidence content — are stored **only as AES-256-GCM ciphertext**; derived,
non-identifying metadata (timestamps, severity, tags) is stored in clear to allow listing and the
timeline without decryption. There is no server-side database of evidence.

### 2.4 Authentication / access control
There is no account and no password on a server. Access is a **local unlock**: the user's passcode
is run through **PBKDF2-SHA256 (100,000 iterations)** with a random salt; only the resulting hash is
stored, and it is re-derived and compared on each unlock. The same passcode derives the
**AES-256-GCM encryption key**, which is held **in memory only** and cleared on lock. The system also
implements:
- **Duress code** — a second code that opens a decoy (empty) vault instead of the real one;
- **Recovery** — the user chooses authenticator-app (RFC-6238 TOTP), a printed base32 code, or eight
  BIP-39 words, with a mandatory recovery *dry-run* during setup;
- **Panic wipe** — rapid taps on the always-present Safety Exit permanently erase the device data.

### 2.5 Evidence capture / upload / verification flow
Evidence can be pasted text, an **image** (with on-device OCR), or **audio** (with on-device speech
recognition). On save it is analysed, encrypted, and written to IndexedDB. A case can then be
*committed* (Merkle root computed) and *anchored* (root written to blockchain), and *exported* as a
bundle that any third party can verify. See §3 for the step-by-step flow.

### 2.6 AI, cryptographic, blockchain, and audit components
- **On-device OCR** — image → text via **Tesseract.js** (WebAssembly).
- **On-device speech-to-text** — audio → transcript via a local **Whisper** model
  (`transformers.js`, WASM/ONNX).
- **Content analysis** — assigns a severity (low→critical) and abuse-pattern tags (threat, stalking,
  coercion, etc.). *Implemented as a transparent keyword heuristic.* An experiment with on-device
  zero-shot ML classifiers was evaluated and deliberately **not shipped** because it mis-scored
  benign text; a purpose-trained model is the intended replacement (documented in code).
- **Cryptography** — PBKDF2-SHA256 key derivation; AES-256-GCM authenticated encryption (per-record
  random IV); SHA-256 Merkle trees with inclusion proofs. All via the browser's audited **Web Crypto
  API**.
- **Blockchain anchoring** — the Merkle root is written to **Solana** as an SPL-Memo transaction and
  to **Bitcoin** via **OpenTimestamps**. *(The Solana path uses a real devnet transaction through the
  relay; the relay signer is an auto-funded throwaway devnet key. OpenTimestamps stamping is real;
  Bitcoin confirmation is asynchronous — hours — so a fresh stamp reads as "pending" until confirmed.
  A production Solana program, `evidence_anchor`, exists in the sibling project and can replace the
  Memo behind the same relay endpoint.)*
- **Audit / tamper-evidence** — the Merkle commitment is the audit mechanism: the exported bundle
  carries each item's leaf hash and proof plus the root, and the on-chain transaction timestamps the
  root. Soft-delete keeps a 14-day recovery window before permanent deletion.

### 2.7 Integrations / external services
- **Solana** JSON-RPC (devnet) for anchoring/verification.
- **OpenTimestamps** public calendar servers + the Bitcoin blockchain.
- **Hugging Face model hub** — one-time download of the OCR/ASR model files (only models are fetched;
  evidence is never sent).
- The relay additionally scaffolds **IPFS pinning** and an **emergency-dispatch** channel (present in
  the codebase; not part of the core evidence flow described here).

---

## 3. Data flow

### 3.1 How a user creates an evidence record
1. **Enter through the disguise.** The app shows a real game. The user performs the hidden unlock
   gesture and enters the passcode on a discreet keypad.
2. **Unlock derives keys.** The passcode is verified against the stored PBKDF2 hash; on success the
   AES-256-GCM key is derived and kept only in memory.
3. **Create a case** (title, start date, optional notes) and open it.
4. **Add evidence.** The user pastes text, or attaches an image (OCR extracts editable text) or audio
   (speech-to-text produces an editable transcript). All processing happens on-device.
5. **Analyse.** The content is classified into a severity level and abuse-pattern tags.
6. **Encrypt and store.** The content (and any image/audio) is encrypted with AES-256-GCM under a
   fresh random IV and written to IndexedDB as ciphertext; derived metadata is stored in clear.
7. **Commit (optional).** The user commits the case: a SHA-256 Merkle root is computed over the
   evidence and stored.
8. **Anchor (optional).** The relay writes the root on-chain (Solana and/or Bitcoin) and returns the
   transaction reference, which is stored with the commitment.
9. **Export (optional).** The user generates a self-verifying JSON bundle + a human-readable PDF.

### 3.2 How data is validated, stored, and retrieved
- **Validation.** Passcodes (4–8 digits, confirmed twice, not all identical); recovery secrets are
  verified in a mandatory dry-run; the relay validates that an anchoring request is a 64-char hex hash
  (`zod`); the verification page validates bundle shape before checking it.
- **Storage.** Ciphertext + non-identifying metadata in IndexedDB (Dexie). No server database of
  evidence. Commitments (root, on-chain references, OpenTimestamps proof) are stored locally too.
- **Retrieval.** On unlock, records are decrypted in memory for display via React Query; media
  attachments are decrypted lazily only when a specific item is opened.

### 3.3 Where integrity, privacy, and tamper-resistance are enforced
- **Privacy** is enforced at rest by AES-256-GCM with a key that never leaves the device, and by the
  architecture: the relay and verification only ever handle hashes/signatures, never evidence.
- **Integrity/tamper-resistance** is enforced by the Merkle commitment: the export carries per-item
  leaf hashes + proofs and the root; changing any byte of any item changes its leaf and breaks the
  proof. The verification page **recomputes the root from the evidence offline** and separately checks
  the **on-chain transaction's memo commits to that exact root** — so tampering is detectable without
  trusting Foren.
- **Coercion resistance** is enforced by the duress code (decoy vault) and panic wipe.

---

## 4. Technical design decisions

- **Local-first / zero-knowledge by construction, not by policy.** Keys are derived on-device and the
  servers only see hashes. This is the strongest possible privacy posture for abuse evidence and
  matches the product's own privacy policy ("we cannot read your evidence … because we do not hold the
  keys"). *Trade-off:* losing the device without a recovery secret means the data is unrecoverable — a
  deliberate, safety-driven choice, mitigated by the mandatory recovery setup + dry-run.
- **Disguise as a first-class security feature.** Real, playable games and a hidden gesture protect a
  survivor whose device may be inspected by an abuser. *Trade-off:* added UI complexity, justified by
  the threat model.
- **Merkle + public-chain anchoring for admissibility.** A Merkle root is small, cheap to anchor, and
  gives per-item inclusion proofs; a public blockchain provides an independent, immutable timestamp.
  This directly targets the "screenshots can be fabricated/back-dated" objection. *Trade-off:*
  blockchain confirmation latency (handled honestly with "pending" states and asynchronous
  verification).
- **Relay holds the signing key, browser does not.** Keeps a blockchain key off the client and lets
  the anchoring mechanism (Memo now, a custom program later) evolve without changing the app.
- **On-device ML for privacy.** OCR and speech-to-text run in the browser so that image/audio evidence
  is transcribed without ever being uploaded — consistent with the zero-knowledge model. A cloud LLM
  (e.g. an external API) was explicitly ruled out because it would transmit evidence off-device.
- **Security/compliance considerations reflected in the product.** A secure-context guard requires
  HTTPS/localhost before enabling Web Crypto; a full set of **legal/policy documents** (Privacy, Terms,
  GDPR data-rights, Acceptable Use, Cookies, Disclaimer, EULA) is written to reflect the local-first,
  zero-knowledge design and is surfaced in-app. The "claimed time; device clock may not be accurate"
  caveat is shown on every item, reflecting evidentiary honesty about self-reported timestamps.
- **Scalability.** Because evidence storage and compute are on the device, the only server component
  (the relay) is stateless and trivially horizontally scalable; per-route rate limiting is already in
  place.

*Unclear / not yet built (stated explicitly):* the production Solana anchoring program and IPFS
pinning are scaffolded in the sibling project but not wired as the default path; the analysis model is
a heuristic pending a purpose-trained classifier; Bitcoin confirmation is asynchronous by nature.

---

## 5. What this demonstrates (originality, complexity, maturity)

- **Originality:** the combination of *disguised entry*, *on-device zero-knowledge encryption*, and
  *public-chain tamper-evidence* aimed specifically at abuse survivors is an unusual, coherent design —
  not a standard CRUD app.
- **Complexity:** genuine cryptographic engineering (PBKDF2/AES-GCM/Merkle proofs), a real
  cross-project client↔relay↔blockchain integration, on-device ML (OCR + Whisper), RFC-6238 TOTP and
  BIP-39 recovery, and an independent offline+on-chain verifier.
- **Maturity:** ~7,000 lines across a well-separated codebase (crypto, data, UI, games, backend),
  end-to-end flows verified in-browser, honest handling of edge cases (duress, panic wipe, soft-delete,
  secure-context, "pending" anchor states), and a complete legal/policy pack.

---

## Appendix — Supporting code references

*Foren client (`~/Desktop/Foren/src`) unless noted; relay in `~/Documents/forenlabs-prutet/relay`.*

| Architectural claim | Primary file(s) |
|---|---|
| PBKDF2-SHA256 hashing + AES-256-GCM encrypt/decrypt (Web Crypto) | `lib/crypto.ts` |
| Passcode / key / duress / panic-wipe session logic | `store/vaultStore.ts`, `lib/vaultConfig.ts` |
| Encrypted IndexedDB schema (ciphertext at rest) | `data/db.ts` |
| Encrypt/decrypt CRUD + re-encryption on passcode change | `data/repository.ts` |
| Query hooks gated on the in-memory key | `data/queries.ts` |
| SHA-256 Merkle tree, inclusion proofs, offline verify | `lib/merkle.ts` |
| Self-verifying export bundle (JSON schema) + PDF | `lib/exportBundle.ts` |
| Independent verification (offline Merkle + on-chain check) | `lib/verifyBundle.ts`, `pages/Verify.tsx` |
| Relay client (browser → relay) | `lib/relay.ts` |
| Disguise wrapper + hidden gesture + keypad | `components/GameDisguise.tsx`, `hooks/useUnlockGesture.ts`, `components/DiscreteKeypad.tsx` |
| Playable decoy games | `games/Game2048.tsx`, `games/Sudoku.tsx`, `games/Wordle.tsx` |
| Onboarding wizard (game, passcode, recovery, dry-run, duress, first unlock) | `pages/onboarding/*` |
| Recovery: TOTP (RFC-6238), BIP-39 words, printed base32 | `lib/recovery.ts` |
| On-device OCR (Tesseract) + speech-to-text (Whisper) | `lib/media.ts` |
| Content analysis (severity + pattern tags) | `lib/analysis.ts` |
| Evidence capture / detail / commitment UI | `components/EvidenceUploadModal.tsx`, `EvidenceDetailModal.tsx`, `CommitmentPanel.tsx` |
| Secure-context (Web Crypto) guard | `components/SecureContextGuard.tsx` |
| In-app legal/policy documents | `legal/*.md`, `src/legal/index.ts`, `pages/Legal.tsx` |
| Relay: Solana anchoring service + route | `relay/src/services/anchor.ts`, `relay/src/routes/anchor.ts` |
| Relay: Bitcoin / OpenTimestamps service | `relay/src/services/bitcoin.ts` |
| Relay: security middleware (helmet/CORS/rate-limit), config, server | `relay/src/middleware/security.ts`, `relay/src/config.ts`, `relay/src/server.ts` |

**Approximate size:** Foren client ≈ 5,900 lines of TypeScript/React across ~70 modules; anchoring
relay ≈ 1,050 lines of TypeScript. Key dependencies: React, Dexie, `@xenova/transformers`,
`tesseract.js`, `jspdf`, `@scure/bip39`, `qrcode.react`, `react-markdown`; relay on Express with
`@solana/web3.js` and `opentimestamps`.
