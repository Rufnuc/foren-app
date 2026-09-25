// Hosted, zero-knowledge vault backup.
//
// The whole encrypted backup (from exportEncryptedBackup) is stored on the relay
// via IPFS, addressed by a locator DERIVED from a Backup Code the user keeps.
// The relay only ever sees opaque ciphertext + an opaque locator + a write
// commitment (a hash) — never the code, the key, or the data. To restore on a
// new device you enter the Backup Code; that's the only secret, and losing it
// makes the hosted copy unrecoverable (by design).
//
//   locator     = base64url(SHA-256("foren-backup|loc|"   + code))   → storage address
//   writeSecret = base64url(SHA-256("foren-backup|write|" + code))   → authorises writes
//   blob        = exportEncryptedBackup(code)                        → Argon2id-locked, E2E

import { exportEncryptedBackup, importEncryptedBackup, type RestoreOutcome } from '@/data/repository';
import { db } from '@/data/db';
import { secureGet, secureSet, secureRemove } from '@/lib/secureStore';

const RELAY_URL = import.meta.env.VITE_RELAY_URL ?? 'http://127.0.0.1:4000';
const K_CODE = 'foren.hostedBackup.code'; // normalized code (enables silent sync)
const K_FP = 'foren.hostedBackup.fp'; // fingerprint of the last synced state
const K_AT = 'foren.hostedBackup.at'; // last successful sync (epoch ms)

// Crockford base32 (no I/L/O/U — unambiguous when read/typed).
const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256Url(input: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input) as BufferSource);
  return bytesToBase64Url(new Uint8Array(d));
}

/** A fresh 128-bit Backup Code, shown grouped for readability (e.g. ABCD-EFGH-…). */
export function generateBackupCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16)); // 128 bits
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return (out.match(/.{1,4}/g) ?? [out]).join('-'); // 26 chars → groups of 4
}

/** Normalise for derivation so dashes/case never matter. */
export function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[^0-9A-Z]/g, '');
}

async function derive(normCode: string): Promise<{ locator: string; writeSecret: string }> {
  const [locator, writeSecret] = await Promise.all([
    sha256Url(`foren-backup|loc|${normCode}`),
    sha256Url(`foren-backup|write|${normCode}`),
  ]);
  return { locator, writeSecret };
}

// A cheap fingerprint over the ENCRYPTED rows — changes whenever anything in the
// vault changes (content edits change the ciphertext), so we skip redundant
// re-uploads without decrypting anything.
async function fingerprint(): Promise<string> {
  const [cases, evidence, commitments, accounts] = await Promise.all([
    db.cases.toArray(),
    db.evidence.toArray(),
    db.commitments.toArray(),
    db.accounts.toArray(),
  ]);
  const material = JSON.stringify({
    c: cases.map((x) => [x.id, x.deletedAt, x.cipher.data]),
    e: evidence.map((x) => [x.id, x.commitmentStatus, x.cipher.data, x.mediaCipher?.data ?? null]),
    m: commitments.map((x) => [x.caseId, x.root, x.status, x.solanaTx ?? null, x.bitcoinStatus ?? null]),
    a: accounts.map((x) => [x.caseId, x.cipher.data]),
  });
  return sha256Url(material);
}

// ── relay I/O ────────────────────────────────────────────────────────────────
async function putBlob(locator: string, writeSecret: string, blob: string): Promise<void> {
  const res = await fetch(`${RELAY_URL}/v1/vault-backup/${locator}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/octet-stream', 'x-write-secret': writeSecret },
    body: blob,
  });
  if (!res.ok) throw new Error(`backup upload failed (${res.status})`);
}
async function getBlob(locator: string): Promise<string | null> {
  const res = await fetch(`${RELAY_URL}/v1/vault-backup/${locator}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`backup fetch failed (${res.status})`);
  return res.text();
}
async function deleteBlob(locator: string, writeSecret: string): Promise<void> {
  await fetch(`${RELAY_URL}/v1/vault-backup/${locator}`, {
    method: 'DELETE',
    headers: { 'x-write-secret': writeSecret },
  }).catch(() => {});
}

// ── public API ───────────────────────────────────────────────────────────────
export interface HostedStatus {
  enabled: boolean;
  lastSyncAt: number | null;
}

export async function hostedBackupStatus(): Promise<HostedStatus> {
  const code = await secureGet(K_CODE);
  const at = await secureGet(K_AT);
  return { enabled: !!code, lastSyncAt: at ? Number(at) : null };
}

/**
 * Turn on hosted backup: mint a Backup Code, upload the first encrypted copy,
 * and remember the code locally so future syncs are silent. Returns the DISPLAY
 * code to show the user once (they must save it — it can't be recovered).
 */
export async function enableHostedBackup(): Promise<string> {
  const display = generateBackupCode();
  const norm = normalizeCode(display);
  const { locator, writeSecret } = await derive(norm);
  const blob = await exportEncryptedBackup(norm);
  await putBlob(locator, writeSecret, blob);
  await secureSet(K_CODE, norm);
  await secureSet(K_FP, await fingerprint());
  await secureSet(K_AT, String(Date.now()));
  return display;
}

/** Re-upload if the vault changed since the last sync. `force` uploads regardless. */
export async function syncHostedBackup(force = false): Promise<'synced' | 'unchanged' | 'off'> {
  const norm = await secureGet(K_CODE);
  if (!norm) return 'off';
  const fp = await fingerprint();
  if (!force && fp === (await secureGet(K_FP))) return 'unchanged';
  const { locator, writeSecret } = await derive(norm);
  const blob = await exportEncryptedBackup(norm);
  await putBlob(locator, writeSecret, blob);
  await secureSet(K_FP, fp);
  await secureSet(K_AT, String(Date.now()));
  return 'synced';
}

export type HostedRestoreOutcome = RestoreOutcome | 'not-found' | 'network';

/** Restore on a new device from just the Backup Code. */
export async function restoreFromHostedBackup(code: string): Promise<HostedRestoreOutcome> {
  const norm = normalizeCode(code);
  if (norm.length < 20) return 'wrong-password';
  const { locator } = await derive(norm);
  let blob: string | null;
  try {
    blob = await getBlob(locator);
  } catch {
    return 'network';
  }
  if (blob === null) return 'not-found';
  const outcome = await importEncryptedBackup(blob, norm);
  if (outcome === 'restored') {
    // Enrol this device so it keeps the hosted copy current going forward.
    await secureSet(K_CODE, norm);
    await secureSet(K_FP, await fingerprint());
    await secureSet(K_AT, String(Date.now()));
  }
  return outcome;
}

/** Turn it off and delete the hosted copy. */
export async function disableHostedBackup(): Promise<void> {
  const norm = await secureGet(K_CODE);
  if (norm) {
    const { locator, writeSecret } = await derive(norm);
    await deleteBlob(locator, writeSecret);
  }
  await secureRemove(K_CODE);
  await secureRemove(K_FP);
  await secureRemove(K_AT);
}

// Debounced background sync (best-effort; never throws into the app).
let syncTimer: ReturnType<typeof setTimeout> | null = null;
export function nudgeHostedBackup(delayMs = 4000): void {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    void syncHostedBackup().catch(() => {});
  }, delayMs);
}
