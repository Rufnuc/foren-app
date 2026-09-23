import {
  db,
  type StoredCase,
  type StoredEvidence,
  type StoredCommitment,
  type StoredAccount,
  type CasePlain,
  type EvidencePlain,
  type AccountPlain,
} from './db';
import { encryptString, decryptString } from '@/lib/crypto';
import { analyzeText } from '@/lib/analysis';
import { buildCommitment } from '@/lib/merkle';
import { anchorRoot, stampBitcoin, verifyBitcoin } from '@/lib/relay';
import { track } from '@/usage';
import type {
  CaseSummary,
  EvidenceItem,
  EvidenceType,
  ExperienceAccount,
  PromptAnswer,
  SeverityLabel,
  SeverityLevel,
} from '@/types';

const SOFT_DELETE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

function uuid(): string {
  return crypto.randomUUID();
}

const LABELS: SeverityLabel[] = ['low', 'medium', 'high', 'critical'];
export function severityLabel(n: SeverityLevel): SeverityLabel {
  return LABELS[n - 1] ?? 'low';
}

export interface CaseInput {
  title: string;
  description?: string;
  startDate: number;
}

export interface EvidenceInput {
  caseId: string;
  type: EvidenceType;
  timestamp: number;
  content: string;
  severity: SeverityLabel;
  severityNumeric: SeverityLevel;
  patternTags: string[];
  /** Optional attachment as a data URL (image/audio). */
  media?: string;
  mediaType?: string;
}

// ── Cases ────────────────────────────────────────────────────────────────────

async function decryptCase(key: CryptoKey, c: StoredCase): Promise<CasePlain> {
  return JSON.parse(await decryptString(key, c.cipher)) as CasePlain;
}

/** Severity, keyed by caseId — decrypted once so case summaries can show a max. */
interface EvidenceSeverity {
  caseId: string;
  severityNumeric: SeverityLevel;
}

async function severitiesFor(key: CryptoKey, rows: StoredEvidence[]): Promise<EvidenceSeverity[]> {
  return Promise.all(
    rows.map(async (e) => ({
      caseId: e.caseId,
      severityNumeric: (JSON.parse(await decryptString(key, e.cipher)) as EvidencePlain)
        .severityNumeric,
    })),
  );
}

async function summarise(
  key: CryptoKey,
  c: StoredCase,
  severities: EvidenceSeverity[],
): Promise<CaseSummary> {
  const plain = await decryptCase(key, c);
  const mine = severities.filter((e) => e.caseId === c.id);
  const maxNumeric = mine.reduce<SeverityLevel>(
    (m, e) => (e.severityNumeric > m ? e.severityNumeric : m),
    1,
  );
  return {
    id: c.id,
    title: plain.title,
    description: plain.description,
    createdAt: plain.createdAt,
    startDate: plain.startDate,
    evidenceCount: mine.length,
    severityMax: severityLabel(maxNumeric),
    deletedAt: c.deletedAt ?? undefined,
  };
}

export async function listCases(key: CryptoKey, includeDeleted = false): Promise<CaseSummary[]> {
  const [cases, evidence] = await Promise.all([db.cases.toArray(), db.evidence.toArray()]);
  const filtered = cases.filter((c) => (includeDeleted ? c.deletedAt : !c.deletedAt));
  const severities = await severitiesFor(key, evidence);
  const summaries = await Promise.all(filtered.map((c) => summarise(key, c, severities)));
  return summaries.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getCase(key: CryptoKey, id: string): Promise<CaseSummary | undefined> {
  const c = await db.cases.get(id);
  if (!c) return undefined;
  const evidence = await db.evidence.where('caseId').equals(id).toArray();
  return summarise(key, c, await severitiesFor(key, evidence));
}

export async function createCase(key: CryptoKey, input: CaseInput): Promise<CaseSummary> {
  const plain: CasePlain = {
    createdAt: Date.now(),
    startDate: input.startDate,
    title: input.title,
    description: input.description || undefined,
  };
  const record: StoredCase = {
    id: uuid(),
    deletedAt: null,
    cipher: await encryptString(key, JSON.stringify(plain)),
  };
  await db.cases.add(record);
  track('record_created'); // anonymous usage count only — no case content leaves the device
  return summarise(key, record, []);
}

export async function softDeleteCase(id: string): Promise<void> {
  await db.cases.update(id, { deletedAt: Date.now() });
}

export async function restoreCase(id: string): Promise<void> {
  await db.cases.update(id, { deletedAt: null });
}

/** Permanently remove a case, its evidence, and its experience account. */
export async function purgeCase(id: string): Promise<void> {
  await db.transaction('rw', db.cases, db.evidence, db.accounts, async () => {
    await db.evidence.where('caseId').equals(id).delete();
    await db.accounts.delete(id);
    await db.cases.delete(id);
  });
}

/** Soft-deleted cases whose 14-day recovery window has passed. */
export function recoveryDeadline(deletedAt: number): number {
  return deletedAt + SOFT_DELETE_WINDOW_MS;
}

// ── Evidence ──────────────────────────────────────────────────────────────────

export async function listEvidence(key: CryptoKey, caseId: string): Promise<EvidenceItem[]> {
  const rows = await db.evidence.where('caseId').equals(caseId).toArray();
  const items = await Promise.all(
    rows.map(async (e) => {
      const p = JSON.parse(await decryptString(key, e.cipher)) as EvidencePlain;
      return {
        id: e.id,
        caseId: e.caseId,
        type: p.type,
        timestamp: p.timestamp,
        content: p.content,
        severity: p.severity,
        severityNumeric: p.severityNumeric,
        patternTags: p.patternTags,
        commitmentStatus: e.commitmentStatus,
        createdAt: p.createdAt,
        hasMedia: !!e.mediaCipher,
        mediaType: p.mediaType,
      };
    }),
  );
  return items.sort((a, b) => b.timestamp - a.timestamp); // newest first
}

/** Decrypt an evidence attachment on demand (data URL), or null if none. */
export async function getEvidenceMedia(key: CryptoKey, id: string): Promise<string | null> {
  const e = await db.evidence.get(id);
  if (!e?.mediaCipher) return null;
  return decryptString(key, e.mediaCipher);
}

export async function addEvidence(key: CryptoKey, input: EvidenceInput): Promise<EvidenceItem> {
  const plain: EvidencePlain = {
    type: input.type,
    timestamp: input.timestamp,
    createdAt: Date.now(),
    content: input.content,
    severity: input.severity,
    severityNumeric: input.severityNumeric,
    patternTags: input.patternTags,
    mediaType: input.mediaType,
  };
  const mediaCipher = input.media ? await encryptString(key, input.media) : null;
  const record: StoredEvidence = {
    id: uuid(),
    caseId: input.caseId,
    commitmentStatus: 'pending',
    cipher: await encryptString(key, JSON.stringify(plain)),
    mediaCipher,
  };
  await db.evidence.add(record);
  track('evidence_added'); // anonymous count only — evidence content never leaves the device
  return {
    id: record.id,
    caseId: record.caseId,
    type: plain.type,
    timestamp: plain.timestamp,
    content: plain.content,
    severity: plain.severity,
    severityNumeric: plain.severityNumeric,
    patternTags: plain.patternTags,
    commitmentStatus: record.commitmentStatus,
    createdAt: plain.createdAt,
    hasMedia: !!mediaCipher,
    mediaType: plain.mediaType,
  };
}

export async function deleteEvidence(id: string): Promise<void> {
  await db.evidence.delete(id);
}

/**
 * Re-run the on-device analysis over a case's evidence and persist refreshed
 * tags/severity. Called at commit time so the report + bundle reflect the
 * CURRENT model, not whatever was tagged when each item was added. Analysis is
 * excluded from the Merkle leaf, so re-tagging never changes the commitment.
 */
export async function reanalyzeEvidence(key: CryptoKey, caseId: string): Promise<void> {
  const rows = await db.evidence.where('caseId').equals(caseId).toArray();
  for (const e of rows) {
    const p = JSON.parse(await decryptString(key, e.cipher)) as EvidencePlain;
    if (!p.content.trim()) continue;
    const res = await analyzeText(p.content);
    const updated: EvidencePlain = {
      ...p,
      severity: res.severity,
      severityNumeric: res.severityNumeric,
      patternTags: res.patternTags,
    };
    await db.evidence.update(e.id, { cipher: await encryptString(key, JSON.stringify(updated)) });
  }
}

// ── Experience accounts ───────────────────────────────────────────────────────

export interface AccountInput {
  promptAnswers: PromptAnswer[];
  narrative: string;
}

export async function getAccount(
  key: CryptoKey,
  caseId: string,
): Promise<ExperienceAccount | undefined> {
  const row = await db.accounts.get(caseId);
  if (!row) return undefined;
  const p = JSON.parse(await decryptString(key, row.cipher)) as AccountPlain;
  return {
    caseId,
    promptAnswers: p.promptAnswers,
    narrative: p.narrative,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

/** Create or overwrite a case's experience account (preserves createdAt). */
export async function saveAccount(
  key: CryptoKey,
  caseId: string,
  input: AccountInput,
): Promise<ExperienceAccount> {
  const existing = await db.accounts.get(caseId);
  const createdAt = existing
    ? (JSON.parse(await decryptString(key, existing.cipher)) as AccountPlain).createdAt
    : Date.now();
  const plain: AccountPlain = {
    promptAnswers: input.promptAnswers,
    narrative: input.narrative,
    createdAt,
    updatedAt: Date.now(),
  };
  const record: StoredAccount = { caseId, cipher: await encryptString(key, JSON.stringify(plain)) };
  await db.accounts.put(record);
  track('record_updated'); // anonymous count only — the account narrative never leaves the device
  return { caseId, ...plain };
}

// ── Maintenance ──────────────────────────────────────────────────────────────

/** Raw encrypted backup (records stay ciphertext; safe to write to disk). */
export async function exportEncryptedBackup(): Promise<string> {
  const [cases, evidence] = await Promise.all([db.cases.toArray(), db.evidence.toArray()]);
  return JSON.stringify({ format: 'foren-backup-v1', exportedAt: Date.now(), cases, evidence }, null, 2);
}

// ── Commitments ──────────────────────────────────────────────────────────────

export async function getCommitment(caseId: string): Promise<StoredCommitment | undefined> {
  return db.commitments.get(caseId);
}

/**
 * Compute the Merkle root over a case's evidence and persist a pending
 * commitment. The root itself is a real, verifiable cryptographic commitment.
 */
export async function commitCase(key: CryptoKey, caseId: string): Promise<StoredCommitment> {
  const evidence = await listEvidence(key, caseId);
  const { root, entries } = await buildCommitment(evidence);
  const evidenceIds = entries.map((e) => e.id);

  // If an existing commitment has the SAME root, its on-chain anchor still
  // commits to this exact evidence — keep it rather than discard it. Re-running
  // analysis (tags/severity) never changes the root, so a re-commit after
  // auto-analysis must not throw away a valid Solana/Bitcoin anchor.
  const existing = await db.commitments.get(caseId);
  if (existing && existing.root === root) {
    const preserved: StoredCommitment = { ...existing, evidenceIds };
    await db.commitments.put(preserved);
    return preserved;
  }

  const commitment: StoredCommitment = {
    caseId,
    root,
    evidenceIds,
    createdAt: Date.now(),
    status: 'pending',
  };
  await db.commitments.put(commitment);
  return commitment;
}

/**
 * Anchor the case's Merkle root on-chain via the prutet relay (real Solana
 * transaction). Throws if there is no commitment or the relay call fails.
 */
export async function anchorToSolana(caseId: string): Promise<StoredCommitment> {
  const existing = await db.commitments.get(caseId);
  if (!existing) throw new Error('Commit the case before anchoring.');

  // Reuse a prior nonce so re-anchoring the same case is idempotent (same PDA).
  const { signature, cluster, programId, recordPda, slot, nonce } = await anchorRoot(
    existing.root,
    existing.solanaNonce,
  );

  const updated: StoredCommitment = {
    ...existing,
    status: 'solana',
    solanaTx: signature,
    solanaCluster: cluster,
    solanaProgram: programId,
    solanaRecordPda: recordPda,
    solanaSlot: slot,
    solanaNonce: nonce,
  };
  await db.commitments.put(updated);
  // Reflect committed status on the evidence cards.
  await db.evidence.where('caseId').equals(caseId).modify({ commitmentStatus: 'solana' });
  track('verification_performed'); // anonymous count of the on-chain anchoring operation
  return updated;
}

/** Stamp the case's root to Bitcoin via OpenTimestamps (pending until confirmed). */
export async function anchorToBitcoin(caseId: string): Promise<StoredCommitment> {
  const existing = await db.commitments.get(caseId);
  if (!existing) throw new Error('Commit the case before anchoring.');
  const { ots } = await stampBitcoin(existing.root);
  const updated: StoredCommitment = { ...existing, bitcoinOts: ots, bitcoinStatus: 'pending' };
  await db.commitments.put(updated);
  return updated;
}

/** Re-check a pending Bitcoin proof; persists the upgraded proof if confirmed. */
export async function refreshBitcoin(caseId: string): Promise<StoredCommitment | undefined> {
  const existing = await db.commitments.get(caseId);
  if (!existing?.bitcoinOts) return existing;
  const res = await verifyBitcoin(existing.root, existing.bitcoinOts);
  const updated: StoredCommitment = {
    ...existing,
    bitcoinOts: res.ots ?? existing.bitcoinOts,
    bitcoinStatus: res.status,
    bitcoinAttestedAt: res.attestedAt,
  };
  await db.commitments.put(updated);
  return updated;
}

export interface StorageUsage {
  usedBytes: number;
  quotaBytes: number;
}

export async function storageUsage(): Promise<StorageUsage> {
  if (navigator.storage?.estimate) {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    return { usedBytes: usage, quotaBytes: quota };
  }
  return { usedBytes: 0, quotaBytes: 0 };
}
