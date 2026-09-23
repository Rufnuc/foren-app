import { wordlist } from '@scure/bip39/wordlists/english';
import type { RecoveryMethod } from '@/types';

// Recovery-secret primitives (spec Part 1.5 / Appendix A).
//
// Three recovery methods share one underlying secret representation:
//   • authenticator / printed → a base32 string (also driven as TOTP)
//   • words                   → 8 BIP39 words joined by spaces
//
// The normalised secret is used to WRAP the data key (see vaultStore); the
// secret itself is never persisted. Use normaliseSecret() before wrapping or
// unwrapping so equivalent inputs (case / spacing) match.

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Random base32 secret (default 32 chars → ~160 bits). */
export function generateBase32Secret(length = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = '';
  for (const b of bytes) out += BASE32_ALPHABET[b % 32];
  return out;
}

/** Decode an RFC 4648 base32 string (ignores spaces / '=' padding). */
export function base32Decode(input: string): Uint8Array {
  const clean = input.toUpperCase().replace(/[\s=]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >> bits) & 0xff);
    }
  }
  return Uint8Array.from(out);
}

/** otpauth:// URI for authenticator apps. */
export function otpauthUri(
  secretB32: string,
  account = 'RecoveryKey',
  issuer = 'Foren',
): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({ secret: secretB32, issuer });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** RFC 6238 TOTP (HMAC-SHA1, 30s step, 6 digits) for the given secret. */
export async function totp(
  secretB32: string,
  atMs: number = Date.now(),
  step = 30,
  digits = 6,
): Promise<string> {
  const counter = Math.floor(atMs / 1000 / step);
  const counterBytes = new Uint8Array(8);
  // 64-bit big-endian counter (high 32 bits are ~0 for current timestamps)
  let c = counter;
  for (let i = 7; i >= 0; i--) {
    counterBytes[i] = c & 0xff;
    c = Math.floor(c / 256);
  }

  const key = await crypto.subtle.importKey(
    'raw',
    base32Decode(secretB32) as BufferSource,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const hmac = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, counterBytes as BufferSource),
  );

  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (binary % 10 ** digits).toString().padStart(digits, '0');
}

/** Validate a user-entered TOTP code, allowing ±1 step of clock drift. */
export async function verifyTotp(secretB32: string, code: string): Promise<boolean> {
  const trimmed = code.trim();
  const now = Date.now();
  for (const delta of [-30_000, 0, 30_000]) {
    if ((await totp(secretB32, now + delta)) === trimmed) return true;
  }
  return false;
}

/** Pick N distinct random words from the BIP39 English list. */
export function pickRecoveryWords(count = 8): string[] {
  const words: string[] = [];
  const used = new Set<number>();
  while (words.length < count) {
    const i = crypto.getRandomValues(new Uint32Array(1))[0] % wordlist.length;
    if (used.has(i)) continue;
    used.add(i);
    words.push(wordlist[i]);
  }
  return words;
}

/** Autocomplete suggestions for the words dry-run. */
export function suggestWords(prefix: string, limit = 5): string[] {
  const p = prefix.trim().toLowerCase();
  if (!p) return [];
  return wordlist.filter((w) => w.startsWith(p)).slice(0, limit);
}

/** Normalise a secret to its canonical comparable form before wrapping. */
export function normaliseSecret(method: RecoveryMethod, secret: string): string {
  if (method === 'words') {
    return secret.trim().toLowerCase().split(/\s+/).join(' ');
  }
  return secret.toUpperCase().replace(/\s+/g, '');
}
