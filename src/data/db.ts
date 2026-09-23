import Dexie, { type Table } from 'dexie';
import type { Ciphertext } from '@/lib/crypto';
import type { EvidenceType, CommitmentStatus, SeverityLabel, SeverityLevel, PromptAnswer } from '@/types';

// On-device encrypted store. ALL sensitive fields (title, description, evidence
// content, and the metadata that would reveal the nature of the vault —
// timestamps, severity, pattern tags, type) are persisted only inside an
// AES-GCM ciphertext blob. On a locked device, IndexedDB shows nothing but
// opaque ciphertext plus opaque UUIDs, so an onlooker learns neither that this
// is an evidence vault nor anything about its contents.
//
// The only cleartext fields are: the record ids and caseId (random UUIDs, no
// information), and two low-value flags kept in clear so they can be updated
// without the key — commitmentStatus (an anchor happened) and a case's
// deletedAt (soft-delete marker). Neither reveals anything about the abuse.

/** Plaintext shape encrypted into StoredEvidence.cipher. */
export interface EvidencePlain {
  type: EvidenceType;
  timestamp: number;
  createdAt: number;
  content: string;
  severity: SeverityLabel;
  severityNumeric: SeverityLevel;
  patternTags: string[];
  mediaType?: string;
}

export interface StoredEvidence {
  id: string;
  caseId: string;
  commitmentStatus: CommitmentStatus;
  cipher: Ciphertext; // encrypts EvidencePlain
  // Optional encrypted attachment (image/audio) as a data-URL ciphertext.
  mediaCipher?: Ciphertext | null;
}

/** Plaintext shape encrypted into StoredCase.cipher. */
export interface CasePlain {
  createdAt: number;
  startDate: number;
  title: string;
  description?: string;
}

export interface StoredCase {
  id: string;
  deletedAt: number | null; // soft-delete marker (recovery window is 14 days)
  cipher: Ciphertext; // encrypts CasePlain
}

/** Plaintext shape encrypted into StoredAccount.cipher. */
export interface AccountPlain {
  promptAnswers: PromptAnswer[];
  narrative: string;
  createdAt: number;
  updatedAt: number;
}

/** The survivor's experience account for a case (one per case). */
export interface StoredAccount {
  caseId: string;
  cipher: Ciphertext; // encrypts AccountPlain
}

export interface StoredCommitment {
  caseId: string; // one (latest) commitment per case
  root: string;
  evidenceIds: string[]; // tree order
  createdAt: number;
  status: CommitmentStatus;
  solanaTx?: string;
  solanaCluster?: string;
  // The evidence_anchor program + PDA record for this root (on-chain state that
  // verification reads directly). Absent for legacy memo-only anchors.
  solanaProgram?: string;
  solanaRecordPda?: string;
  // The slot the root was anchored at — the private witness for the ZK
  // slot-range proof (client-side prover).
  solanaSlot?: number;
  // The random anchor nonce. Kept so a re-anchor reuses the same record PDA
  // (idempotent), and so a private export can OMIT it — without it, the record
  // is not derivable from the root, so the anchor stays unlinkable.
  solanaNonce?: string;
  // Bitcoin (OpenTimestamps): a base64 .ots proof that is "pending" until the
  // calendar servers commit it to Bitcoin (a few hours), then "confirmed".
  bitcoinOts?: string;
  bitcoinStatus?: 'pending' | 'confirmed';
  bitcoinAttestedAt?: number;
}

class ForenDb extends Dexie {
  cases!: Table<StoredCase, string>;
  evidence!: Table<StoredEvidence, string>;
  commitments!: Table<StoredCommitment, string>;
  accounts!: Table<StoredAccount, string>;

  constructor() {
    super('ForenVault');
    this.version(1).stores({
      cases: 'id, createdAt, deletedAt',
      evidence: 'id, caseId, timestamp',
    });
    this.version(2).stores({
      cases: 'id, createdAt, deletedAt',
      evidence: 'id, caseId, timestamp',
      commitments: 'caseId',
    });
    // v3 moves all sensitive metadata into the encrypted blob. Indexes are
    // reduced to opaque ids only. Pre-v3 records used a different shape and a
    // pre-Argon2 key, so they can't be read under the new scheme — drop them.
    this.version(3)
      .stores({
        cases: 'id, deletedAt',
        evidence: 'id, caseId',
        commitments: 'caseId',
      })
      .upgrade((tx) =>
        Promise.all([
          tx.table('cases').clear(),
          tx.table('evidence').clear(),
          tx.table('commitments').clear(),
        ]),
      );
    // v4 adds the experience-account store (one encrypted account per case).
    this.version(4).stores({
      cases: 'id, deletedAt',
      evidence: 'id, caseId',
      commitments: 'caseId',
      accounts: 'caseId',
    });
  }
}

export const db = new ForenDb();

/** Permanently clear all local data (panic wipe / reset). */
export async function wipeAll(): Promise<void> {
  await Promise.all([
    db.cases.clear(),
    db.evidence.clear(),
    db.commitments.clear(),
    db.accounts.clear(),
  ]);
}
