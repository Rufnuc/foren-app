# Privacy Policy

**Effective date:** 23 September 2026
**Controller:** Foren Labs, United Kingdom ("Foren", "we", "us", "our").
**Contact:** israel.egede@outlook.com · Data Protection Officer: israel.egede@outlook.com

---

## 1. Our privacy promise in plain language

Foren is built so that **your evidence stays on your device**. It is encrypted on your device with a key derived from your passcode, and that key never leaves your device. We have designed our systems so that **we cannot read your evidence** — not because we promise not to look, but because we do not hold the keys.

This Policy explains the limited information that is processed, by whom, and your rights over it. Because Foren is "local-first" and "zero-knowledge", there is far less personal data flowing to us than in a typical app — but there are still a few things you should understand.

## 2. Key concepts

- **On-device / local-first:** Your cases, evidence, attachments, analysis, and encryption keys live in storage on your device.
- **Zero-knowledge services:** Where Foren uses a server (the "relay") or a third party, it is designed to receive only data that cannot reveal your evidence — for example a cryptographic **hash**, or content you have already encrypted.
- **Controller / processor:** Under UK GDPR and EU GDPR, the "controller" decides why and how data is processed. For data that stays on your device under your control, **you** are effectively in control of it; for the limited server-side activities below, Foren Labs is the controller.

## 3. Information processed on your device (not sent to us)

The following are created and stored **only on your device** and are **not transmitted to us** in the normal operation of the app:

- Case titles, descriptions, and notes.
- Evidence content (messages, pasted text), and attachments (images, audio).
- Machine-generated analysis (incident classification, severity, pattern tags) and machine-generated text from on-device OCR/transcription.
- Your passcode is **never stored**; only a salted hash is kept on-device to verify it. Your encryption key is derived from your passcode at unlock and held in memory only.
- Duress, recovery, and panic-wipe settings (stored as hashes/flags, on-device).

We do not have access to this information.

## 4. Information processed by us or our service providers

Only the following limited data leaves your device, and only when you use the relevant feature:

| Activity | What is sent | Who receives it | Why |
|---|---|---|---|
| **Blockchain anchoring (Solana)** | A cryptographic **Merkle root hash** (not your evidence) | Our relay and a public Solana network/RPC provider | To create an immutable, timestamped proof that your evidence has not been altered |
| **Bitcoin timestamping (OpenTimestamps)** | A cryptographic **hash** | OpenTimestamps calendar servers / Bitcoin network | Secondary integrity timestamp |
| **On-device transcription (ASR) setup** | A request to download the speech model files (your IP address is visible to the host) | Model hosting CDN (e.g. Hugging Face) | To run transcription locally in your browser; the audio itself is **not** sent |
| **Optional encrypted backup (if offered/enabled)** | A **pre-encrypted** blob we cannot read | Our relay / pinning provider | To let you restore your vault |
| **Optional emergency dispatch (if offered/enabled)** | A **pre-encrypted** message and the recipient contact you provide | Our relay and an SMS/email provider (e.g. Twilio/SMTP) | To deliver a message you chose to send |
| **App delivery & security** | Standard technical request data (e.g. IP address, timestamp, user-agent) | Our hosting/CDN provider | To serve the app and protect against abuse |

We do **not** sell your data, and we do **not** use it for advertising or profiling.

## 5. What we deliberately do **not** collect

- We do not require an account, email, or phone number to use the core vault.
- We do not collect your evidence content.
- We do not run third-party advertising or analytics trackers inside the vault.
- We do not track your location.

## 6. Lawful bases for processing (UK GDPR / EU GDPR, Art. 6)

Where we do process personal data, we rely on:

- **Performance of a contract (Art. 6(1)(b)):** to provide the features you request (e.g. anchoring, backup, dispatch).
- **Legitimate interests (Art. 6(1)(f)):** to keep the service secure and prevent abuse (e.g. rate-limiting, basic request logs). We have balanced these interests against your rights.
- **Consent (Art. 6(1)(a)):** for optional features you switch on (e.g. emergency dispatch, transcription model download). You can withdraw consent at any time by not using the feature.

Evidence may relate to **special-category data** (Art. 9) and to criminal-offence data (Art. 10). Because such data remains under your control on your device and is not processed by us, we do not determine the purposes of processing it. Where any special-category data would be processed by us (e.g. content you choose to send via dispatch), we rely on your **explicit consent** and/or that the data is **manifestly made public by you**, and on substantial-public-interest/legal-claims conditions where applicable under the Data Protection Act 2018.

## 7. The blockchain and your "right to erasure"

Anchoring publishes a one-way **hash** to a public, immutable ledger. A hash is not your evidence and cannot be reversed into it. Because the ledger is immutable and operated by a decentralised network, **on-chain hashes cannot be deleted** by us or anyone. You can always delete the underlying evidence on your device; doing so does not remove the historical hash, but the hash alone reveals nothing about you or your evidence. Please consider this before anchoring.

## 8. Retention

- **On your device:** evidence is retained until you delete it. Deleted cases enter a soft-delete state with a recovery window (e.g. 14 days) before permanent deletion, and a panic-wipe permanently erases everything.
- **Our servers:** because we hold no plaintext evidence, there is nothing of yours to retain. Minimal security/operational logs (e.g. request metadata) are retained for 30 days then deleted or anonymised.
- **Blockchain:** anchored hashes are permanent (see §7).

## 9. International transfers

Some service providers (e.g. CDN, model hosting, public blockchain nodes) may process technical data outside the UK/EEA. Where they do, we rely on appropriate safeguards such as **UK International Data Transfer Agreement / EU Standard Contractual Clauses** and adequacy decisions where available. Public blockchains are inherently global and decentralised.

## 10. Your rights

Subject to the limits above (notably the on-device and immutable-ledger realities), you have the right to:

- **Access** a copy of personal data we hold about you;
- **Rectify** inaccurate data;
- **Erase** data ("right to be forgotten");
- **Restrict** or **object** to processing;
- **Data portability** — Foren's export feature already lets you take your full case file with you;
- **Withdraw consent** for optional features at any time;
- **Lodge a complaint** with your local data protection authority.

For most data, you exercise these rights **directly in the app** (view, edit, export, delete). For any data we hold, contact israel.egede@outlook.com; we will respond within one month as required by law. We may need to verify your request, though note we often cannot identify you because we hold so little.

## 11. Children

Foren is intended for users aged 16 and over. A younger person may use Foren only with the direct involvement and supervision of a responsible adult (such as a parent, guardian, or support worker). If you believe a child has provided personal data to us, contact israel.egede@outlook.com.

## 12. Security

We use authenticated encryption (AES-256-GCM) on-device, passcode-derived key stretching (PBKDF2), and minimise the data our servers ever see. No method of storage or transmission is perfectly secure; in particular, the security of on-device data depends on the security of your device and the secrecy of your passcode. See the [Disclaimer](DISCLAIMER.md) and our safety guidance in the app.

## 13. Changes

We may update this Policy. Material changes will be notified in-app or at https://forenlabs.co.uk. The "Effective date" shows the latest version.

## 14. Contact

Foren Labs, United Kingdom · israel.egede@outlook.com · DPO: israel.egede@outlook.com
