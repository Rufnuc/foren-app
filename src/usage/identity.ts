// Anonymous cryptographic identity for usage tracking. ECDSA P-256 keypair via
// WebCrypto. The private key is stored NON-EXTRACTABLE where supported: we
// generate an extractable pair (so we can read the public key bytes), re-import
// ONLY the private key as non-extractable, and discard the extractable original.
// The private key never leaves the device and is never sent anywhere. The
// anonymous id is derived from the public key, not from any personal data.

import { getIdentity, putIdentity, type IdentityRow } from './store';

export const EC_PARAMS: EcKeyGenParams = { name: 'ECDSA', namedCurve: 'P-256' };
export const SIGN_PARAMS: EcdsaParams = { name: 'ECDSA', hash: 'SHA-256' };

export function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
  const bin = atob(b64 + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return new Uint8Array(digest);
}

/** Derive the anonymous id: base64url(SHA-256(raw public key)). */
export async function deriveAnonId(rawPubKey: Uint8Array): Promise<string> {
  return bytesToBase64Url(await sha256(rawPubKey));
}

async function createIdentity(): Promise<IdentityRow> {
  // Generate extractable so we can export the public key; then lock the private.
  const pair = await crypto.subtle.generateKey(EC_PARAMS, true, ['sign', 'verify']);
  const rawPub = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));

  // Re-import the private key as NON-EXTRACTABLE and drop the extractable one.
  let privKey: CryptoKey;
  try {
    const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
    privKey = await crypto.subtle.importKey('jwk', jwk, EC_PARAMS, false, ['sign']);
  } catch {
    // Some engines refuse re-import of the private JWK; fall back to the
    // generated (extractable) key. It still never leaves the device.
    privKey = pair.privateKey;
  }

  const row: IdentityRow = {
    id: 'self',
    privKey,
    pubKeyB64: bytesToBase64Url(rawPub),
    anonId: await deriveAnonId(rawPub),
    createdAt: Date.now(),
  };
  await putIdentity(row);
  return row;
}

/** Get the installation's anonymous identity, creating it on first use. */
export async function getOrCreateIdentity(): Promise<IdentityRow> {
  const existing = await getIdentity();
  if (existing) return existing;
  return createIdentity();
}
