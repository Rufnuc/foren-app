// Vault cryptography (v2): envelope encryption with a memory-hard KDF.
//
// Threat model: an adversary with physical access to the device, who can read
// localStorage and IndexedDB. The old design derived the evidence key straight
// from a 4-digit PIN via PBKDF2 (GPU-friendly) and stored a verification hash in
// plaintext, so a PIN could be brute-forced offline in seconds. This module
// fixes that:
//
//   • A random 256-bit Data Encryption Key (DEK) encrypts all evidence. It has
//     full entropy and is never derived from the passcode.
//   • The DEK is *wrapped* (AES-GCM) under a Key-Encryption-Key derived from the
//     user secret with Argon2id (memory-hard, GPU/ASIC-resistant).
//   • The same DEK is wrapped under the recovery secret and (for duress) a decoy
//     DEK is wrapped under the duress code — so recovery genuinely restores
//     access and duress never touches the real key.
//   • There is no separate verification hash: a wrong secret simply fails to
//     unwrap (GCM auth tag), so there is no cheaper offline oracle than paying
//     the full Argon2id cost per guess.
//
// crypto.subtle requires a secure context; localhost and HTTPS both qualify.

import { argon2id } from 'hash-wasm';

const enc = new TextEncoder();

// ── base64 helpers ───────────────────────────────────────────────────────────

export function bufferToBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ── Argon2id key derivation + envelope wrapping ──────────────────────────────

export interface KdfParams {
  algo: 'argon2id';
  /** Memory cost in KiB. 65536 = 64 MiB. */
  memKiB: number;
  iterations: number;
  parallelism: number;
}

// Tuned to be a few hundred ms on a mid-range phone: expensive per guess, but
// unobtrusive for a single unlock. Stored alongside each wrap so params can be
// raised later without breaking existing vaults.
export const DEFAULT_KDF: KdfParams = {
  algo: 'argon2id',
  memKiB: 65536,
  iterations: 3,
  parallelism: 1,
};

/** An AES-GCM-wrapped copy of the DEK plus the KDF salt/params to reproduce it. */
export interface WrappedKey {
  salt: string; // base64, Argon2id salt
  kdf: KdfParams;
  iv: string; // base64, AES-GCM IV
  ct: string; // base64, wrapped DEK
}

async function deriveKek(secret: string, salt: Uint8Array, kdf: KdfParams): Promise<CryptoKey> {
  const raw = await argon2id({
    password: secret,
    salt,
    parallelism: kdf.parallelism,
    iterations: kdf.iterations,
    memorySize: kdf.memKiB,
    hashLength: 32,
    outputType: 'binary',
  });
  return crypto.subtle.importKey('raw', raw as BufferSource, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

/** A fresh random 256-bit data key (raw bytes). */
export function generateDekRaw(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

/** Import raw DEK bytes as a non-extractable AES-GCM key for evidence crypto. */
export async function importDek(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw as BufferSource, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}

/** Wrap raw DEK bytes under a secret (passcode / passphrase / recovery). */
export async function wrapDek(
  secret: string,
  dekRaw: Uint8Array,
  kdf: KdfParams = DEFAULT_KDF,
): Promise<WrappedKey> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const kek = await deriveKek(secret, salt, kdf);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, kek, dekRaw as BufferSource);
  return { salt: bufferToBase64(salt), kdf, iv: bufferToBase64(iv), ct: bufferToBase64(ct) };
}

/** Unwrap a DEK with a secret. Returns raw bytes, or null if the secret is wrong. */
export async function unwrapDek(secret: string, w: WrappedKey): Promise<Uint8Array | null> {
  const kek = await deriveKek(secret, base64ToBytes(w.salt), w.kdf);
  try {
    const raw = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(w.iv) as BufferSource },
      kek,
      base64ToBytes(w.ct) as BufferSource,
    );
    return new Uint8Array(raw);
  } catch {
    return null; // wrong secret: GCM authentication failed
  }
}

// ── AES-256-GCM evidence encryption (interface unchanged) ─────────────────────
// Callers pass the DEK obtained from importDek().

export interface Ciphertext {
  iv: string;
  data: string;
}

export async function encryptString(key: CryptoKey, plaintext: string): Promise<Ciphertext> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(plaintext) as BufferSource,
  );
  return { iv: bufferToBase64(iv), data: bufferToBase64(data) };
}

export async function decryptString(key: CryptoKey, cipher: Ciphertext): Promise<string> {
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(cipher.iv) as BufferSource },
    key,
    base64ToBytes(cipher.data) as BufferSource,
  );
  return new TextDecoder().decode(plaintext);
}

// ── Passcode / passphrase strength ───────────────────────────────────────────

export type PasscodeKind = 'pin' | 'passphrase';

export const MIN_PIN_LENGTH = 6;
export const MAX_PIN_LENGTH = 12;
export const MIN_PASSPHRASE_LENGTH = 8;

export interface StrengthResult {
  ok: boolean;
  reason?: string;
}

const COMMON_PINS = new Set([
  '123456', '654321', '111111', '000000', '121212', '112233', '123123', '159753',
  '696969', '666666', '999999', '101010', '789456', '147258', '1234567', '12345678',
]);

function isMonotonicSequence(s: string): boolean {
  let asc = true;
  let desc = true;
  for (let i = 1; i < s.length; i++) {
    const d = s.charCodeAt(i) - s.charCodeAt(i - 1);
    if (d !== 1) asc = false;
    if (d !== -1) desc = false;
  }
  return asc || desc;
}

/** Reject weak secrets before they ever become the only thing protecting a vault. */
export function checkPasscodeStrength(secret: string, kind: PasscodeKind): StrengthResult {
  if (kind === 'pin') {
    if (!/^\d+$/.test(secret)) return { ok: false, reason: 'A PIN must be digits only' };
    if (secret.length < MIN_PIN_LENGTH) return { ok: false, reason: `Use at least ${MIN_PIN_LENGTH} digits` };
    if (secret.length > MAX_PIN_LENGTH) return { ok: false, reason: `Use at most ${MAX_PIN_LENGTH} digits` };
    if (/^(\d)\1*$/.test(secret)) return { ok: false, reason: 'Not all the same digit' };
    if (isMonotonicSequence(secret)) return { ok: false, reason: 'Avoid sequences like 123456' };
    if (COMMON_PINS.has(secret)) return { ok: false, reason: 'That PIN is too common' };
    return { ok: true };
  }
  // passphrase
  const s = secret.trim();
  if (s.length < MIN_PASSPHRASE_LENGTH) {
    return { ok: false, reason: `Use at least ${MIN_PASSPHRASE_LENGTH} characters` };
  }
  if (/^(.)\1*$/.test(s)) return { ok: false, reason: 'Too repetitive' };
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^a-zA-Z0-9]/].filter((re) => re.test(s)).length;
  if (classes < 2) return { ok: false, reason: 'Mix letters with numbers or symbols' };
  return { ok: true };
}
