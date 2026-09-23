// Build and sign a usage submission. The signature covers the canonical
// serialization of every field EXCEPT `signature` itself, so the server can
// recompute the exact bytes and verify against the submitted public key.

import { canonicalize } from './canonical';
import { SIGN_PARAMS, bytesToBase64Url } from './identity';
import type { Counters } from './store';
import type { IdentityRow } from './store';

export interface UsagePayload {
  v: 1;
  anonId: string;
  pubKey: string; // base64url raw P-256 public key
  counters: Counters;
  seq: number;
  nonce: string; // base64url 16 random bytes
  issuedAt: number; // epoch ms
}

export interface SignedSubmission extends UsagePayload {
  signature: string; // base64url ECDSA P-256 / SHA-256 (P1363 r||s)
}

/** The exact bytes that get signed (canonical payload without the signature). */
export function signingBytes(payload: UsagePayload): Uint8Array {
  return new TextEncoder().encode(canonicalize(payload));
}

function randomNonce(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return bytesToBase64Url(b);
}

/** Assemble a fresh signed submission for the given counters + sequence. */
export async function buildSignedSubmission(
  identity: IdentityRow,
  counters: Counters,
  seq: number,
): Promise<SignedSubmission> {
  const payload: UsagePayload = {
    v: 1,
    anonId: identity.anonId,
    pubKey: identity.pubKeyB64,
    counters,
    seq,
    nonce: randomNonce(),
    issuedAt: Date.now(),
  };
  const sig = await crypto.subtle.sign(SIGN_PARAMS, identity.privKey, signingBytes(payload) as BufferSource);
  return { ...payload, signature: bytesToBase64Url(new Uint8Array(sig)) };
}
