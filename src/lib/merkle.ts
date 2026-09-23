import type { EvidenceItem } from '@/types';

// SHA-256 Merkle tree for tamper-evident evidence commitment (spec 2.8 / 2.10 /
// Appendix B). Everything here is deterministic and verifiable offline with
// nothing but the leaf data + proof + root — no trust in Foren required.

const encoder = new TextEncoder();

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(input) as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export interface LeafFields {
  id: string;
  type: string;
  timestamp: number; // epoch ms
  content: string;
}

/**
 * Canonical leaf payload. Commits to the immutable facts of a piece of evidence
 * (id, type, claimed time, content) so any later change breaks the proof.
 * Derived analysis (severity/tags) is intentionally excluded so a bundle can
 * omit it and still be verifiable. Field order is fixed.
 */
export function leafPayload(f: LeafFields): string {
  return JSON.stringify({ id: f.id, type: f.type, timestamp: f.timestamp, content: f.content });
}

export function evidenceLeafPayload(e: EvidenceItem): string {
  return leafPayload({ id: e.id, type: e.type, timestamp: e.timestamp, content: e.content });
}

export async function evidenceLeafHash(e: EvidenceItem): Promise<string> {
  return sha256Hex(evidenceLeafPayload(e));
}

export async function leafHashFromFields(f: LeafFields): Promise<string> {
  return sha256Hex(leafPayload(f));
}

export interface ProofStep {
  hash: string;
  position: 'left' | 'right'; // which side the sibling sits on
}

export interface MerkleTree {
  root: string;
  /** layers[0] = leaves … layers[n] = [root] */
  layers: string[][];
}

/** Build a tree from ordered leaf hashes (odd nodes duplicate the last hash). */
export async function buildTree(leaves: string[]): Promise<MerkleTree> {
  if (leaves.length === 0) return { root: '', layers: [[]] };
  const layers: string[][] = [leaves];
  while (layers[layers.length - 1].length > 1) {
    const prev = layers[layers.length - 1];
    const next: string[] = [];
    for (let i = 0; i < prev.length; i += 2) {
      const left = prev[i];
      const right = i + 1 < prev.length ? prev[i + 1] : prev[i]; // duplicate last
      next.push(await sha256Hex(left + right));
    }
    layers.push(next);
  }
  return { root: layers[layers.length - 1][0], layers };
}

/** Inclusion proof for the leaf at `index`. */
export function inclusionProof(tree: MerkleTree, index: number): ProofStep[] {
  const proof: ProofStep[] = [];
  let idx = index;
  for (let level = 0; level < tree.layers.length - 1; level++) {
    const layer = tree.layers[level];
    const isRightNode = idx % 2 === 1;
    const siblingIdx = isRightNode ? idx - 1 : idx + 1;
    const sibling = siblingIdx < layer.length ? layer[siblingIdx] : layer[idx]; // duplicated
    proof.push({ hash: sibling, position: isRightNode ? 'left' : 'right' });
    idx = Math.floor(idx / 2);
  }
  return proof;
}

/** Recompute the root from a leaf hash + proof and compare. */
export async function verifyProof(
  leafHash: string,
  proof: ProofStep[],
  root: string,
): Promise<boolean> {
  let hash = leafHash;
  for (const step of proof) {
    hash =
      step.position === 'left'
        ? await sha256Hex(step.hash + hash)
        : await sha256Hex(hash + step.hash);
  }
  return hash === root;
}

export interface CommitmentBuild {
  root: string;
  /** leaf hash + proof per evidence id, in tree order. */
  entries: Array<{ id: string; leafHash: string; proof: ProofStep[] }>;
}

/** Build root + per-evidence proofs. Evidence is ordered by timestamp, then id. */
export async function buildCommitment(evidence: EvidenceItem[]): Promise<CommitmentBuild> {
  const ordered = [...evidence].sort(
    (a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id),
  );
  const leaves = await Promise.all(ordered.map(evidenceLeafHash));
  const tree = await buildTree(leaves);
  const entries = ordered.map((e, i) => ({
    id: e.id,
    leafHash: leaves[i],
    proof: inclusionProof(tree, i),
  }));
  return { root: tree.root, entries };
}
