/// <reference lib="webworker" />
//
// ZK proving Web Worker. The Groth16 prover runs entirely here, off the main
// thread — the private witness (evidence hash, exact slot, lat/lon, salt) is
// computed and consumed inside the worker and NEVER posted back. Only the
// resulting proof + public inputs (slot range + the two Poseidon commitments)
// leave the worker. Circuit: evidence_zk (see prutet/circuits).

import './zkPolyfill'; // installs Buffer/process globals — must precede snarkjs
import * as snarkjs from 'snarkjs';
import { buildPoseidon } from 'circomlibjs';

// bn254 scalar field modulus (Fr).
const R = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const mod = (x: bigint) => ((x % R) + R) % R;

const feHex = (v: bigint) => v.toString(16).padStart(64, '0');
const g1 = (p: string[]) => feHex(BigInt(p[0])) + feHex(BigInt(p[1]));
const g2 = (p: string[][]) =>
  feHex(BigInt(p[0][1])) + feHex(BigInt(p[0][0])) + feHex(BigInt(p[1][1])) + feHex(BigInt(p[1][0]));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let poseidonPromise: Promise<any> | null = null;
const getPoseidon = () => (poseidonPromise ??= buildPoseidon());

interface ProveInput {
  contentHash: string; // 64-char hex (SHA-256 of the evidence/root)
  slot: number | string;
  slotMin: number | string;
  slotMax: number | string;
  lat?: number | string;
  lon?: number | string;
  locSalt?: string; // hex; if absent, location is a zero commitment
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WorkerMsg =
  | { id: number; action: 'prove'; input: ProveInput }
  | { id: number; action: 'verify'; publicSignals: string[]; proof: unknown };

self.onmessage = async (e: MessageEvent<WorkerMsg>) => {
  const { id } = e.data;
  try {
    if (e.data.action === 'verify') {
      const vk = await fetch(`${self.location.origin}/zk/evidence_zk_vk.json`).then((r) => r.json());
      const ok = await snarkjs.groth16.verify(vk, e.data.publicSignals, e.data.proof);
      self.postMessage({ id, ok: true, result: { valid: ok } });
      return;
    }
    const input = e.data.input;
    const poseidon = await getPoseidon();
    const F = poseidon.F;

    const hex = input.contentHash.replace(/^0x/, '').padStart(64, '0');
    const hi = BigInt('0x' + hex.slice(0, 32)); // high 128 bits
    const lo = BigInt('0x' + hex.slice(32, 64)); // low 128 bits
    const lat = mod(BigInt(input.lat ?? 0));
    const lon = mod(BigInt(input.lon ?? 0));
    const salt = mod(input.locSalt ? BigInt('0x' + input.locSalt.replace(/^0x/, '')) : 0n);

    const nullifier = F.toObject(poseidon([lo, hi])) as bigint;
    const locationCommitment = F.toObject(poseidon([lat, lon, salt])) as bigint;

    const witness = {
      slot_min: String(input.slotMin),
      slot_max: String(input.slotMax),
      location_commitment: locationCommitment.toString(),
      nullifier: nullifier.toString(),
      content_hash_lo: lo.toString(),
      content_hash_hi: hi.toString(),
      slot: String(input.slot),
      lat: lat.toString(),
      lon: lon.toString(),
      loc_salt: salt.toString(),
    };

    const wasmUrl = `${self.location.origin}/zk/evidence_zk.wasm`;
    const zkeyUrl = `${self.location.origin}/zk/evidence_zk_final.zkey`;
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(witness, wasmUrl, zkeyUrl);

    self.postMessage({
      id,
      ok: true,
      result: {
        publicSignals,
        // Canonical snarkjs proof — verifiable offline by anyone with the VK.
        proof,
        // Solana-packed byte layout — for on-chain verification via zk_verifier.
        proof_a: g1(proof.pi_a),
        proof_b: g2(proof.pi_b),
        proof_c: g1(proof.pi_c),
      },
    });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String((err as Error)?.message ?? err) });
  }
};
