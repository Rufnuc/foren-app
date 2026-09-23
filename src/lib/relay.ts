// Client for the prutet relay. The relay holds the Solana signing key and
// submits the on-chain anchor; the browser never touches a keypair.

const RELAY_URL = import.meta.env.VITE_RELAY_URL ?? 'http://127.0.0.1:4000';

export interface AnchorResponse {
  signature: string;
  cluster: string;
  // The `evidence_anchor` program and the PDA that now holds the on-chain
  // record (hash + slot + timestamp). Verification reads this account directly.
  programId: string;
  recordPda: string;
  nonce: string;
  slot?: number;
  explorer: string;
}

export interface BitcoinStampResponse {
  ots: string;
  status: 'pending';
}

export interface BitcoinVerifyResponse {
  status: 'pending' | 'confirmed';
  attestedAt?: number;
  height?: number;
  ots?: string;
}

export class RelayError extends Error {}

async function post<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${RELAY_URL}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new RelayError('Could not reach the relay. Is it running?');
  }
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new RelayError(detail.error ?? `Relay error (${res.status})`);
  }
  return res.json();
}

/**
 * Anchor a Merkle root on-chain (Solana) via the relay. Pass a previously
 * returned `nonce` to make a re-anchor idempotent (same record PDA); omit it for
 * the first anchor, where the relay mints a random, root-unlinkable nonce.
 */
export function anchorRoot(root: string, nonce?: string): Promise<AnchorResponse> {
  return post<AnchorResponse>('/v1/anchor/solana', nonce ? { root, nonce } : { root });
}

/** Stamp a Merkle root to Bitcoin via OpenTimestamps (returns a pending proof). */
export function stampBitcoin(root: string): Promise<BitcoinStampResponse> {
  return post<BitcoinStampResponse>('/v1/anchor/bitcoin', { root });
}

/** Upgrade + verify a Bitcoin OTS proof (pending until confirmed on-chain). */
export function verifyBitcoin(root: string, ots: string): Promise<BitcoinVerifyResponse> {
  return post<BitcoinVerifyResponse>('/v1/anchor/bitcoin/verify', { root, ots });
}
