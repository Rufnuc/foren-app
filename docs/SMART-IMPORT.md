# Foren — Smart Import ("Deep Scan") Design

**Status:** proposed feature · pre-build
**One line:** An opt-in, on-device mode that scans the data sources the user grants, runs Foren's existing OCR/transcription/parsing over them, and surfaces likely evidence into a **review queue** — the user confirms what actually becomes vault evidence.

---

## 1. Principles (non-negotiable)

1. **Off by default.** The feature does not exist in the UI until the user opens it, and does nothing until explicitly enabled. No background activity, ever.
2. **User-granted only.** Access is requested at the moment the user turns it on, per source, and is **revocable** at any time.
3. **On-device only.** Scanning, OCR, transcription, and parsing run locally — consistent with Foren's zero-knowledge model. No raw data leaves the device.
4. **Review, don't hoard.** Scanning produces *candidates*, not vault entries. Nothing is encrypted into the vault or anchored until the user confirms it. Unconfirmed candidates are held in a volatile buffer and wiped when the scan session ends.
5. **Only inside the vault.** Smart Import is reachable only *after unlock* — never from the game disguise, never from the duress/decoy vault.

---

## 2. Platform reality (what consent can and can't unlock)

Consent unlocks only the data classes the OS exposes. It does **not** bypass the app sandbox.

| Source | Grantable by user? | Mechanism | Notes |
|---|---|---|---|
| Photo library (full) | ✅ | iOS Photos / Android `READ_MEDIA_IMAGES,VIDEO` | **Highest value** — screenshots of threats, injuries, financial docs |
| Contacts, Calendar | ✅ | OS permission | Relationships + event timeline |
| Files / documents | ✅ | Document picker / granted folder (SAF on Android) | PDFs, records, letters |
| Health (injury timestamps) | ✅ | HealthKit (iOS) | Optional |
| WhatsApp / Signal / iMessage / SMS threads | ❌ | — | OS-blocked even *with* consent. Use **"Export chat" → import file**, or share-in individual messages |
| Whole filesystem / other apps' data | ❌ | — | Requires root/jailbreak; not shippable |

**Takeaway:** design around the ✅ rows. For the ❌ rows, provide **chat-export importers** (parse WhatsApp/Telegram exported `.txt`/`.zip`) and the Share-to-Foren extension.

---

## 3. Activation & permission flow

```
[Disabled]  ──user opens Smart Import──▶  [Explainer + consent screen]
     ▲                                            │ user picks sources, taps Enable
     │ revoke / disable                           ▼
[Granted]  ◀──OS permission dialog(s)──  [Requesting permission]
     │ user taps "Scan now" (manual trigger only)
     ▼
[Scanning] ──on-device pipeline──▶ [Review queue] ──confirm──▶ [Encrypted + anchored in vault]
                                          │ discard / end session
                                          ▼
                                   [Candidates wiped]
```

- Permission is requested **per source**, only when enabling — not up front.
- Scans are **manually triggered** ("Scan now"), not automatic. No scheduled/background scans in v1.
- A visible **"Smart Import: OFF/ON"** state with one-tap disable + OS-permission revoke shortcut.

---

## 4. On-device scan pipeline

Reuses Foren's existing engines (Tesseract.js OCR, Whisper/transformers.js ASR, local classifier):

1. **Enumerate** granted items (images, audio, files, contacts/calendar rows).
2. **Pre-filter** cheaply — date range, file type, size, "screenshots" album, keywords in filenames — to avoid OCR-ing thousands of vacation photos.
3. **Extract** — OCR images, transcribe audio, read text/PDF, parse chat exports.
4. **Score / classify** — on-device zero-shot classifier flags likely-evidence signals: threat/abuse language, dates, monetary amounts, names in the user's contacts, injury terms. Produce a confidence score + reason.
5. **Emit candidates** to the review queue with a snippet + why-flagged, sorted by score. Raw source data stays in the volatile buffer only.

Run in a **Web Worker / background thread**, chunked, cancelable, with progress. Never blocks the UI; can be stopped mid-scan.

---

## 5. Review queue UX

- Card per candidate: thumbnail/snippet, **why it was flagged**, source, original timestamp.
- Actions: **Add as evidence** · **Skip** · **Add + link to a case**.
- Bulk select for obvious matches.
- On **Add**: the item is copied into the encrypted store, hashed, added to the Merkle tree, and eligible for anchoring — capturing **provenance** (source = "Photo library, imported <date>", original file date, device) for chain-of-custody.
- On **end session / discard**: all unconfirmed candidates and the raw buffer are destroyed.

This is the core safety property: **the scan is broad, but the footprint is only what the user confirms.**

---

## 6. Evidence integrity

Each imported item records: original source + original timestamp, import timestamp, SHA-256 hash, and that it was user-confirmed. This preserves relevance + authentication (indiscriminate dumps are weak evidence; confirmed, provenanced items are strong).

---

## 7. Disguise & threat-model mitigations

The capability-vs-deniability tension is real; mitigate it:

- Feature **off by default**; permissions requested **only on enable**, so a fresh install has a clean permission footprint.
- Reachable **only after unlock**, never in the game or decoy vault.
- **Revoke = one tap**, and disabling clears granted scopes where the OS allows.
- Document the tradeoff for users in Help & Safety: enabling full-library access is visible in the OS Settings → Privacy, which a controlling partner could see. Let the user make that call knowingly; keep it optional.
- Consider a "scan, then auto-revoke" flow: request access, scan, confirm, then immediately drop the permission — minimizing the window the permission is even held.

---

## 8. Architecture note — this needs a native shell

Foren today is a **browser app** (React + Vite + Dexie + Web Crypto). A browser/PWA **cannot** read the full photo library or OS contacts — only files the user picks via `<input type=file multiple>` / File System Access API.

To get true device-level scanning you need a **native wrapper**. Recommended: **Capacitor** (keeps the existing React codebase; add native plugins for Photos, Contacts, Filesystem, Health). React Native would mean a bigger rewrite.

This gives a clean phasing:

| Phase | Shell | What ships |
|---|---|---|
| **1 — MVP (now)** | Existing web/PWA | Multi-file **batch import**: user selects many photos/files at once → existing OCR/ASR/classifier → review queue. Proves the pipeline with zero new platform work. |
| **2 — Native scan** | Capacitor | Full **photo-library + contacts + calendar** scan with the per-source consent flow above. |
| **3 — Chat imports** | Either | Parsers for **WhatsApp/Telegram exported chats**; Share-to-Foren extension for one-off cross-app items. |

---

## 9. Risks / open questions

- **App-store review** of a game-disguised app requesting photo-library access — needs a cover justification, or accept it's a post-unlock native capability reviewers see. Decide the cover story.
- **Performance** of OCR over large libraries — the pre-filter (step 2) is essential; consider on-device ML image-text detection to skip non-text images.
- **False positives/negatives** in the classifier — always keep the human confirmation step; never auto-import.
- Confirm iOS "limited photo access" vs full — limited (user-picked subset) is safer and may be enough for Phase 2.

---

## 10. Suggested next steps

- Build **Phase 1** on the current web app (fast, no native work) — batch import + review queue, reusing OCR/ASR already in the codebase.
- Spike a **Capacitor** shell to validate Photos/Contacts plugins for Phase 2.
- Add "Smart Import" as a roadmap line in the pitch deck.
