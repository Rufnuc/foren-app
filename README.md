# Foren — Frontend

Survivor evidence vault with **disguised entry** (decoy game), on-device
encryption, AI analysis, and Solana/Bitcoin commitment. Mobile-first, dark
theme, warm plum/gold palette.

> This is the survivor-facing frontend. The Solana/Anchor program, ZK circuits,
> and relay live in the sibling `forenlabs-prutet` project.

## Stack

- **React 18** + **TypeScript** + **Vite**
- **Tailwind CSS** (custom Foren palette in `tailwind.config.js`)
- **Zustand** — client/vault state (`src/store/vaultStore.ts`)
- **React Query** — server/async state (`src/lib/queryClient.ts`)
- **React Router v6** — routing (`src/routes/router.tsx`)

## Toolchain note

This machine has two Node installs via nvm. Use **v22.11.0 (arm64)** — the
v24.9.0 install is an x86_64 binary that fails with "Bad CPU type".

```bash
export PATH="$HOME/.nvm/versions/node/v22.11.0/bin:$PATH"
node --version   # v22.11.0
```

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build
npm run typecheck
npm run lint
```

### Run in VS Code

Open this folder in VS Code. A `.nvmrc` pins Node 22, and `.vscode/tasks.json`
provides ready-to-run tasks that already use the arm64 Node:

- **Run Task → "Foren: dev + relay"** — starts the Vite dev server **and** the
  prutet relay (devnet) together. This is the default build task
  (`⇧⌘B`). Open http://localhost:5173.
- "Foren: dev server" / "Relay: dev (devnet)" run them individually.
- `.vscode/launch.json` has an "Open Foren in Chrome" config for debugging.

Notes:
- **Open `http://localhost:5173`, not the "Network" URL** Vite prints
  (`http://192.168.x.x:5173`). Web Crypto — which hashes the passcode and
  derives the encryption key — only works on a *secure context* (`localhost` or
  `https`). On a plain-http LAN address it's disabled, so passcode setup fails.
  The app now shows a "Secure connection needed" screen if you hit this. To test
  on a phone/another device you need an https tunnel (e.g. `ngrok`, or Vite with
  a cert).
- The dev server must stay on **port 5173** — the relay's `CORS_ORIGINS` allows
  `5173`/`5174`. If Vite shifts to another port, add it to `CORS_ORIGINS` in
  `.vscode/tasks.json`.
- Blockchain anchoring needs the relay running; everything else works without
  it. The relay generates + persists a devnet keypair and auto-airdrops it.
- First image OCR / audio ASR downloads a model (cached after).

### Legal documents

The `legal/` folder holds the policy docs (Privacy, Terms, GDPR, Acceptable Use,
Cookies, Disclaimer, EULA). They're the single source of truth — the app imports
them as raw markdown (`src/legal/index.ts`) and renders them in-app at
**Settings → About → Legal** (`/vault/legal`). Fill in the `[PLACEHOLDER]`
fields (company name, addresses, emails, dates) before publishing — see
`legal/README.md`.

## Layout

```
src/
  components/   # component library (Part 5) — some live, some stubbed
  pages/        # route screens (Onboarding, Vault, CaseDetail, Verify, Settings, Help)
  routes/       # router + unlock guard
  store/        # Zustand vault store (auth/config stubs)
  lib/          # React Query client
  types/        # shared domain types (mirrors export bundle schema)
```

## Status

**Foundation** — theme, routing, providers, error boundary, and presentational
components (SeverityBadge, PatternTag, CommitmentStatus, EmptyState,
CrisisBanner, SafetyExit, LoadingSpinner).

**Disguise + unlock (done)** — full create→lock→unlock loop:
- Playable **2048** decoy game (`src/games/`) — keyboard + single-finger swipe.
- Reveal gestures: two-finger upward swipe (`useUnlockGesture`) + a discreet
  top-left corner double-tap / long-press.
- `DiscreteKeypad` with masked entry, create-time validation (no all-same
  digits), 3-attempt lockout (2s) and 10-attempt close countdown.
- **PBKDF2-SHA256** passcode hashing (`src/lib/crypto.ts`); config persisted in
  localStorage (`src/lib/vaultConfig.ts`) — hashes/salts only, never plaintext.
- Vault store (`unlock` → `unlocked` | `duress` | `invalid`); router `Gate`
  routes no-vault→onboarding, locked→game, unlocked→vault.

**Onboarding wizard (done)** — full 6-step flow (`src/pages/onboarding/`):
1. Choose disguise (2048 playable preview; Sudoku/Wordle placeholders).
2. Create passcode — symbol pick + entry **with confirmation pass**.
3. Recovery setup — **authenticator (QR + `otpauth://`)**, **printed card**
   (`window.print`), or **8 BIP39 memory words** (`src/lib/recovery.ts`).
4. Mandatory recovery **dry-run** — live RFC-6238 **TOTP** check / printed-code
   / word re-entry with autocomplete.
5. Optional **duress** code (must differ from passcode) + decoy-state choice.
6. First unlock → atomic `commitOnboarding` → vault.

Config is written once, atomically, holding only salted PBKDF2 hashes. Verified
end-to-end in the preview: words flow, authenticator TOTP round-trip, and the
duress code correctly returns to the game while the real code unlocks.

**Vault core (done)** — the encrypted evidence vault behind the lock:
- **On-device encryption** — AES-256-GCM (`src/lib/crypto.ts`), key derived from
  the passcode at unlock (separate `keySalt`), held in memory only. Persisted in
  **IndexedDB via Dexie** (`src/data/db.ts`) as ciphertext; verified at rest
  (no plaintext title/content leakage; only derived metadata in clear).
- **Repository + React Query** (`src/data/`) — cases & evidence CRUD, soft
  delete (14-day window) / restore / purge.
- **Case dashboard** — search, swipe-to-delete cards, empty state, New Case
  modal.
- **Case detail** — severity timeline, evidence list, Add Evidence modal (paste
  text → on-device analysis → encrypt + save), evidence detail modal + delete.
- **Analysis stub** (`src/lib/analysis.ts`) — heuristic severity + pattern tags
  standing in for the TRE-1 model.

**Settings & Help (done)** — `src/pages/Settings.tsx`, `src/pages/Help.tsx`:
- **Security** — change passcode (verifies old, re-derives the AES key and
  **re-encrypts all records** so data stays readable; verified by unlocking with
  the new code), duress enable/disable + decoy-state, recovery test.
- **Privacy** — notifications (always off), encrypted backup export, **panic
  wipe** (rapid Safety-Exit taps → scary confirm → full wipe; verified).
- **Data** — 14-day soft-delete window, recently-deleted restore/purge, storage
  usage, clear offline cache.
- **About / Danger** — versions, crisis numbers, delete-vault.
- **Help** — 999 quick-dial, crisis banner, device/app safety tips, FAQ accordion.

**Export & verification (done)** — tamper-evident commitment + court bundle:
- **Merkle tree** (`src/lib/merkle.ts`) — real SHA-256 tree, inclusion proofs,
  offline `verifyProof`. Leaves commit to id/type/timestamp/content.
- **Commitment** (`commitments` Dexie table) — compute root, status badge on
  case detail; "Anchor to Solana" is **simulated** here (a production deploy
  submits via the prutet relay).
- **Export bundle** (`src/lib/exportBundle.ts`) — self-verifying JSON (Appendix
  B) + jsPDF report; jsPDF is dynamically imported so it's a lazy chunk.
- **Verification page** (`/vault/verify`, public) — recomputes the root from the
  bundle and checks every proof offline; best-effort Solana RPC lookup; honest
  pending state for Bitcoin/OpenTimestamps. Verified: clean bundle passes,
  tampered content/timestamp is detected.

**Image/audio evidence (done)** — the upload modal now has Paste text / Image /
Audio tabs (`src/lib/media.ts`). Images attach with an OCR stub, audio records
via MediaRecorder (with file-import fallback) and an ASR stub; both produce
editable, machine-generated text that is analysed and committed. The original
media is AES-encrypted at rest (`mediaCipher`) and decrypted on demand only in
the detail view. Verified: image evidence saved with media encrypted, edited
text analysed (critical/threat/stalking), detail modal decrypts + renders it.

**Duress empty-vault decoy (done)** — entering the duress code with the
`empty-vault` option unlocks into a clean decoy: `duressMode` is set, **no real
key is derived** (all data queries return empty), and Settings + New Case are
hidden so the decoy never reveals that duress is configured. `lock()` (and
reset) **clear the React Query cache**, so the decoy can't serve a prior
session's decrypted data. Verified: real code → real case; duress code → empty
vault with the real case hidden; real code round-trips back intact.

**Decoy games (done)** — all three disguises are playable: **2048**, **Sudoku**
(backtracking generator + conflict highlighting), and **Wordle** (6 guesses,
on-screen + physical keyboard, key coloring). A shared `DecoyGame` switch
(`src/games/DecoyGame.tsx`) renders the chosen game on the lock screen, the
onboarding preview, and the first-unlock step. The unlock gesture (two-finger
swipe + corner activator) lives in the wrapper, so it works behind any game.
Verified: each game plays and unlocks to the vault.

**Real Solana anchoring (done)** — "Anchor to Solana" submits the Merkle root
on-chain through the **prutet relay** (`forenlabs-prutet/relay`), which holds the
signing key (never exposed to the browser) and writes an **SPL Memo**
(`foren:v1:<root>`) on a configurable cluster (default **devnet**). The export
bundle records the signature + cluster; the verification page fetches the live
transaction and confirms the **memo commits to the root** — fully, publicly
verifiable. The commitment panel links to Solana Explorer. Verified end-to-end
on devnet (real tx, real airdrop-funded signer).

Run the relay (from `forenlabs-prutet/relay`):
`SOLANA_CLUSTER=devnet CORS_ORIGINS=http://localhost:<vite-port> npx tsx src/index.ts`
Foren points at it via `VITE_RELAY_URL` (default `http://127.0.0.1:4000`).

**Real OCR/ASR (done)** — image and audio evidence are transcribed **entirely
on-device** (`src/lib/media.ts`), so the bytes never leave the device:
- **OCR**: Tesseract.js (WASM). Verified — read "EVIDENCE" off a rendered image.
- **ASR**: a local **Whisper** model via transformers.js (WASM/ONNX). Verified —
  transcribed the JFK speech sample accurately (~7s after model load).
Both are dynamically imported (transformers.js is a ~200 KB-gz lazy chunk),
fetch their models once, and fall back to editable placeholder text on failure.
The extracted text is machine-generated and editable before saving.

**Bitcoin anchoring (done)** — "Anchor to Bitcoin" stamps the root via
**OpenTimestamps** through the relay (`POST /v1/anchor/bitcoin`), returning a
real `.ots` proof that is "pending" until the calendar servers commit it to
Bitcoin (a few hours), then upgradeable to "confirmed". The bundle carries the
`.ots`; the verify page upgrades + checks it (and it's independently verifiable
offline with any OTS client). Verified end-to-end: real stamp → pending →
bundle → verify shows the honest pending state.

Optional future: swap the Solana Memo for the richer `evidence_anchor` Anchor
program (PDA storage) behind the same relay endpoint — no frontend change.

### Status
All major spec slices are implemented. The app is a working end-to-end vertical:
onboarding → disguise/unlock → encrypted vault → commit/export → independent
verification.
