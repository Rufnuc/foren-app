import { buildCommitment, type ProofStep } from './merkle';
import type { CaseSummary, EvidenceItem } from '@/types';

// Court bundle (spec 2.9 / Appendix B). The JSON is self-verifying: each
// evidence item carries its leaf hash + Merkle proof, and proof_chain holds the
// root. The verification page (and any third party) can recompute everything
// offline. The PDF is the human-readable companion.

export interface BundleEvidence {
  id: string;
  type: string;
  timestamp: string; // ISO
  content?: string;
  severity?: string;
  tags?: string[];
  commitment_hash: string;
  merkle_proof: ProofStep[];
}

export interface ExportBundle {
  format: 'foren-bundle-v1';
  exported_at: string;
  // 'full' includes the exact Solana anchor identifiers (tx + record PDA), which
  // reveal the exact anchoring slot. 'private' omits them: because the anchor
  // uses a random, root-unlinkable nonce, the record can't be re-derived from
  // the root, so the exact slot stays hidden — the Bitcoin timestamp (coarse)
  // and any ZK proof (slot range) carry the anchoring evidence instead.
  export_mode: 'full' | 'private';
  case: {
    id: string;
    title: string;
    created_at: string;
    evidence_count: number;
    severity_max: string;
  };
  evidence: BundleEvidence[];
  /**
   * Machine-generated assessment that travels WITH the evidence but is
   * deliberately NOT part of the cryptographic commitment (the Merkle root
   * commits only to evidence content). Present when analysis is included.
   */
  analysis?: {
    source: string;
    disclaimer: string;
  };
  proof_chain: {
    root_hash: string;
    solana_tx: string | null;
    solana_cluster: string | null;
    // The evidence_anchor program + PDA holding the on-chain record. A verifier
    // reads this account and checks its stored hash equals root_hash — proving
    // the commitment from program state, not just a memo log. Null for legacy
    // memo-only anchors.
    solana_program: string | null;
    solana_record_pda: string | null;
    // OpenTimestamps proof (base64) + status; independently verifiable with any
    // OTS client. Null when the case hasn't been Bitcoin-anchored.
    bitcoin_anchor: { ots: string; status: string } | null;
    // Optional zero-knowledge proof (Groth16, evidence_zk circuit): proves the
    // root was anchored on Solana within a disclosed slot range WITHOUT revealing
    // the exact slot, bound to the root via a Poseidon nullifier. Verifiable
    // offline with the VK, or on-chain via the zk_verifier program.
    zk_proof: ZkProofBlock | null;
  };
}

export interface ZkProofBlock {
  circuit: 'evidence_zk';
  disclosure: string;
  // Public signals in circuit order: [slot_min, slot_max, location_commitment, nullifier].
  public_signals: string[];
  // Canonical snarkjs proof — verifiable offline with the public VK.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  proof: any;
  // Solana-packed byte layout (hex) for on-chain verification.
  proof_solana: { a: string; b: string; c: string };
  // The on-chain verifier + verifying-key account (for the trustless path).
  program_id: string | null;
  vk_account: string | null;
}

export interface BundleOptions {
  includeProofChain: boolean;
  includeAnalysis: boolean;
  solanaTx?: string | null;
  solanaCluster?: string | null;
  solanaProgram?: string | null;
  solanaRecordPda?: string | null;
  bitcoinOts?: string | null;
  bitcoinStatus?: string | null;
  zkProof?: ZkProofBlock | null;
  /** Omit the exact Solana anchor identifiers (unlinkable private export). */
  privateExport?: boolean;
}

const iso = (ms: number) => new Date(ms).toISOString();

export async function buildBundle(
  summary: CaseSummary,
  evidence: EvidenceItem[],
  options: BundleOptions,
): Promise<ExportBundle> {
  const { root, entries } = await buildCommitment(evidence);
  const byId = new Map(entries.map((e) => [e.id, e]));

  const bundleEvidence: BundleEvidence[] = [...evidence]
    .sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id))
    .map((e) => {
      const entry = byId.get(e.id)!;
      return {
        id: e.id,
        type: e.type,
        timestamp: iso(e.timestamp),
        content: e.content,
        severity: options.includeAnalysis ? e.severity : undefined,
        tags: options.includeAnalysis ? e.patternTags : undefined,
        commitment_hash: entry.leafHash,
        merkle_proof: options.includeProofChain ? entry.proof : [],
      };
    });

  // In a private export the exact on-chain anchor is withheld so the slot stays
  // hidden (the anchor's random nonce makes it unrecoverable from the root).
  const priv = !!options.privateExport;
  const solanaTx = priv ? null : (options.solanaTx ?? null);
  const solanaCluster = priv ? null : (options.solanaCluster ?? null);
  const solanaProgram = priv ? null : (options.solanaProgram ?? null);
  const solanaRecordPda = priv ? null : (options.solanaRecordPda ?? null);

  return {
    format: 'foren-bundle-v1',
    exported_at: new Date().toISOString(),
    export_mode: priv ? 'private' : 'full',
    case: {
      id: summary.id,
      title: summary.title,
      created_at: iso(summary.createdAt),
      evidence_count: evidence.length,
      severity_max: summary.severityMax,
    },
    evidence: bundleEvidence,
    analysis: options.includeAnalysis
      ? {
          source: 'Foren on-device analysis model (assistive)',
          disclaimer:
            'Pattern tags and severity are machine-generated, editable, and provided to assist ' +
            'review. They are NOT evidence and are NOT part of the cryptographic commitment — the ' +
            'Merkle root commits only to the evidence content, so a bundle without analysis verifies identically.',
        }
      : undefined,
    proof_chain: {
      root_hash: root,
      solana_tx: options.includeProofChain ? solanaTx : null,
      solana_cluster: options.includeProofChain ? solanaCluster : null,
      solana_program: options.includeProofChain ? solanaProgram : null,
      solana_record_pda: options.includeProofChain ? solanaRecordPda : null,
      bitcoin_anchor:
        options.includeProofChain && options.bitcoinOts
          ? { ots: options.bitcoinOts, status: options.bitcoinStatus ?? 'pending' }
          : null,
      zk_proof: options.includeProofChain ? (options.zkProof ?? null) : null,
    },
  };
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadJson(filename: string, data: unknown) {
  downloadBlob(filename, new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
}
