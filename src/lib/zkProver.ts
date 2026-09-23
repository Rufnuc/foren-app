// Main-thread wrapper around the ZK proving Web Worker. Keeps a single worker
// alive and exposes a promise API. The heavy artifacts (wasm ~2 MB, zkey
// ~400 KB) are fetched by the worker on first proof, not bundled into the app.

import type { ZkProofBlock } from './exportBundle';

const RELAY_URL = import.meta.env.VITE_RELAY_URL ?? 'http://127.0.0.1:4000';
// ~1 day of Solana slots (~2.5 slots/sec). The proof discloses which day-sized
// window the anchor fell in, hiding the exact slot within it.
const DAY_SLOTS = 216_000;

export interface ZkEvidenceInput {
  /** 64-char hex SHA-256 of the evidence/root the proof binds to. */
  contentHash: string;
  /** Solana slot the root was anchored at (private). */
  slot: number | string;
  /** Disclosed slot range [min, max] the proof reveals (public). */
  slotMin: number | string;
  slotMax: number | string;
  /** Optional geo commitment inputs (Foren doesn't collect location yet). */
  lat?: number | string;
  lon?: number | string;
  locSalt?: string; // hex
}

export interface ZkProof {
  /** Public signals in circuit order: [slot_min, slot_max, location_commitment, nullifier]. */
  publicSignals: string[];
  /** Canonical snarkjs Groth16 proof — verifiable offline with the public VK. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  proof: any;
  proof_a: string; // 64-byte hex (G1)
  proof_b: string; // 128-byte hex (G2)
  proof_c: string; // 64-byte hex (G1)
}

let worker: Worker | null = null;
let seq = 0;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../workers/zkProver.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (e: MessageEvent) => {
      const { id, ok, result, error } = e.data;
      const p = pending.get(id);
      if (!p) return;
      pending.delete(id);
      if (ok) p.resolve(result);
      else p.reject(new Error(error));
    };
    worker.onerror = (e) => {
      // Surface a hard worker failure to every in-flight caller.
      for (const [, p] of pending) p.reject(new Error(e.message || 'zk worker error'));
      pending.clear();
    };
  }
  return worker;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function call<T>(message: Record<string, any>): Promise<T> {
  const w = getWorker();
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ id, ...message });
  });
}

/** Generate a Groth16 proof for the evidence_zk circuit, entirely client-side. */
export function generateEvidenceProof(input: ZkEvidenceInput): Promise<ZkProof> {
  return call<ZkProof>({ action: 'prove', input });
}

/**
 * Verify a proof OFFLINE against the public verifying key (no relay, no chain).
 * `proof` is the canonical snarkjs proof from {@link ZkProof.proof}.
 */
export async function verifyEvidenceProof(publicSignals: string[], proof: unknown): Promise<boolean> {
  const { valid } = await call<{ valid: boolean }>({ action: 'verify', publicSignals, proof });
  return valid;
}

/**
 * Build the export bundle's `zk_proof` block for an anchored case. Discloses a
 * day-sized slot window (not the exact slot) and binds the proof to the root.
 * Best-effort fetches the on-chain verifier coordinates from the relay so a
 * third party can also check the proof on-chain; offline verification needs
 * only the public VK shipped with the app.
 */
export async function buildEvidenceZkProof(root: string, slot: number): Promise<ZkProofBlock> {
  const slotMin = Math.floor(slot / DAY_SLOTS) * DAY_SLOTS;
  const slotMax = slotMin + DAY_SLOTS;
  const proof = await generateEvidenceProof({ contentHash: root, slot, slotMin, slotMax });

  let programId: string | null = null;
  let vkAccount: string | null = null;
  try {
    const info = await fetch(`${RELAY_URL}/v1/zk`).then((r) => (r.ok ? r.json() : null));
    programId = info?.programId ?? null;
    vkAccount = info?.vkAccount ?? null;
  } catch {
    /* relay offline — offline verification still works with the bundled VK */
  }

  return {
    circuit: 'evidence_zk',
    disclosure:
      `Zero-knowledge proof: this evidence root was anchored on Solana within slots ` +
      `[${slotMin}, ${slotMax}] (about a one-day window) without revealing the exact slot. ` +
      `Bound to the root via a Poseidon nullifier. The location commitment is unused.`,
    public_signals: proof.publicSignals,
    proof: proof.proof,
    proof_solana: { a: proof.proof_a, b: proof.proof_b, c: proof.proof_c },
    program_id: programId,
    vk_account: vkAccount,
  };
}
