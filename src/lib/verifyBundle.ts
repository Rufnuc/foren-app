import { leafHashFromFields, verifyProof } from './merkle';
import type { ExportBundle } from './exportBundle';

// Independent, offline verification of an export bundle (spec 2.10). Nothing
// here trusts Foren: it recomputes each leaf hash from the evidence content and
// folds it through the supplied Merkle proof to confirm it reproduces the root.

export interface MerkleVerification {
  ok: boolean;
  rootHash: string;
  total: number;
  verified: number;
  failures: string[]; // evidence ids that didn't verify
  note?: string;
}

export interface SolanaVerification {
  status: 'verified' | 'mismatch' | 'pending' | 'skipped' | 'error' | 'revoked';
  message: string;
  slot?: number;
}

export interface SolanaVerifyInput {
  signature: string | null;
  cluster: string | null;
  rootHash: string;
  programId?: string | null;
  recordPda?: string | null;
}

export function isExportBundle(value: unknown): value is ExportBundle {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as ExportBundle).format === 'foren-bundle-v1' &&
    Array.isArray((value as ExportBundle).evidence)
  );
}

export async function verifyMerkle(bundle: ExportBundle): Promise<MerkleVerification> {
  const root = bundle.proof_chain.root_hash;
  // A single-leaf tree has an empty (but valid) proof, so only flag genuinely
  // missing proofs when there's more than one item.
  const hasProofs =
    bundle.evidence.length <= 1 || bundle.evidence.some((e) => e.merkle_proof.length > 0);
  const failures: string[] = [];
  let verified = 0;

  for (const e of bundle.evidence) {
    const leaf = await leafHashFromFields({
      id: e.id,
      type: e.type,
      timestamp: Date.parse(e.timestamp),
      content: e.content ?? '',
    });
    // Leaf must match the bundle's stated hash AND fold to the root.
    const leafMatches = leaf === e.commitment_hash;
    const proofOk =
      bundle.evidence.length === 1
        ? leaf === root // single-leaf tree: leaf is the root
        : await verifyProof(leaf, e.merkle_proof, root);
    if (leafMatches && proofOk) verified += 1;
    else failures.push(e.id);
  }

  return {
    ok: failures.length === 0 && bundle.evidence.length > 0,
    rootHash: root,
    total: bundle.evidence.length,
    verified,
    failures,
    note: hasProofs ? undefined : 'Bundle has no Merkle proofs (exported without proof chain).',
  };
}

function rpcForCluster(cluster: string | null): string {
  switch (cluster) {
    case 'localnet':
      return 'http://127.0.0.1:8899';
    case 'mainnet-beta':
      return 'https://api.mainnet-beta.solana.com';
    case 'devnet':
    default:
      return 'https://api.devnet.solana.com';
  }
}

function bytesToHex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

// AnchorRecord layout (see programs/evidence_anchor): 8-byte discriminator,
// then owner[32], hash[32], location_commitment[32], timestamp i64, slot u64,
// nonce u64, revoked u8, bump u8.
const HASH_OFFSET = 8 + 32;
const SLOT_OFFSET = 8 + 32 + 32 + 32 + 8;
const REVOKED_OFFSET = 8 + 32 + 32 + 32 + 8 + 8 + 8;

/**
 * Verify the Solana anchor. Preferred path: read the evidence_anchor PDA
 * account directly and confirm the hash it stores equals the bundle's root and
 * that the account is owned by the anchoring program — proving the commitment
 * from live on-chain program state, not merely that some transaction exists.
 * Falls back to the legacy memo-log check for older bundles.
 */
export async function verifySolana(input: SolanaVerifyInput): Promise<SolanaVerification> {
  const { signature, cluster, rootHash, programId, recordPda } = input;
  const rpc = rpcForCluster(cluster);

  // Program-record path.
  if (recordPda) {
    try {
      const res = await fetch(rpc, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getAccountInfo',
          params: [recordPda, { encoding: 'base64' }],
        }),
      });
      const json = await res.json();
      const value = json.result?.value;
      if (!value) {
        return {
          status: 'pending',
          message: `On-chain record not found on ${cluster ?? 'devnet'} yet (may take a few seconds).`,
        };
      }
      if (programId && value.owner !== programId) {
        return {
          status: 'mismatch',
          message: 'The anchor account is not owned by the evidence_anchor program.',
        };
      }
      const data = Uint8Array.from(atob(value.data[0]), (c) => c.charCodeAt(0));
      const storedHash = bytesToHex(data.slice(HASH_OFFSET, HASH_OFFSET + 32));
      if (storedHash !== rootHash) {
        return {
          status: 'mismatch',
          message: 'On-chain record found, but the hash it stores does not match this evidence root.',
        };
      }
      const slot = Number(new DataView(data.buffer).getBigUint64(SLOT_OFFSET, true));
      const revoked = data[REVOKED_OFFSET] === 1;
      if (revoked) {
        return {
          status: 'revoked',
          message: `On-chain record commits to this root (slot ${slot}) but has been marked revoked.`,
          slot,
        };
      }
      return {
        status: 'verified',
        message: `On-chain record on ${cluster ?? 'devnet'} commits to this root (program-verified, slot ${slot}).`,
        slot,
      };
    } catch {
      return { status: 'error', message: 'Could not reach the Solana network.' };
    }
  }

  // Legacy memo path (bundles anchored before the program upgrade).
  if (!signature) return { status: 'skipped', message: 'No Solana anchor in bundle.' };
  try {
    const res = await fetch(rpc, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getTransaction',
        params: [signature, { maxSupportedTransactionVersion: 0 }],
      }),
    });
    const json = await res.json();
    if (!json.result) {
      return {
        status: 'pending',
        message: `Transaction not found on ${cluster ?? 'devnet'} yet (may take a few seconds).`,
      };
    }
    const logs: string[] = json.result.meta?.logMessages ?? [];
    const memoMatches = logs.some((l) => l.includes(rootHash));
    if (!memoMatches) {
      return {
        status: 'mismatch',
        message: 'Transaction found, but its memo does not commit to this root.',
      };
    }
    return {
      status: 'verified',
      message: `Anchored on ${cluster ?? 'devnet'}; memo commits to this root.`,
      slot: json.result.slot,
    };
  } catch {
    return { status: 'error', message: 'Could not reach the Solana network.' };
  }
}
