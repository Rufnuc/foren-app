// Local persistence for the anonymous usage-tracking layer. This is a SEPARATE
// IndexedDB database ("ForenUsage") with NO connection to the encrypted vault
// ("ForenVault" in src/data/db.ts). It stores only:
//   • the anonymous keypair (non-extractable private CryptoKey + raw public key)
//   • integer usage counters (deltas not yet acknowledged by the server)
//   • sequence numbers + an in-flight "pending" submission for exactly-once
// It can never read vault contents, and holds nothing about incidents.

import Dexie, { type Table } from 'dexie';

export type CounterKind =
  | 'record_created'
  | 'record_updated'
  | 'evidence_added'
  | 'verification_performed'
  | 'export_performed';

export const COUNTER_KINDS: CounterKind[] = [
  'record_created',
  'record_updated',
  'evidence_added',
  'verification_performed',
  'export_performed',
];

export type Counters = Record<CounterKind, number>;

export function zeroCounters(): Counters {
  return {
    record_created: 0,
    record_updated: 0,
    evidence_added: 0,
    verification_performed: 0,
    export_performed: 0,
  };
}

export function countersAllZero(c: Counters): boolean {
  return COUNTER_KINDS.every((k) => (c[k] ?? 0) === 0);
}

/** The anonymous identity for this installation (one row, id = "self"). */
export interface IdentityRow {
  id: 'self';
  privKey: CryptoKey; // non-extractable where supported; never leaves the device
  pubKeyB64: string; // base64url(raw P-256 public key, 65 bytes) — safe to send
  anonId: string; // base64url(SHA-256(raw public key))
  createdAt: number;
}

/** A snapshot of counters that has been sent but not yet acknowledged. */
export interface Pending {
  seq: number;
  counters: Counters;
}

/** Mutable usage state (one row, id = "self"). */
export interface StateRow {
  id: 'self';
  counters: Counters; // accumulated, not yet flushed
  pending: Pending | null; // in-flight submission (retried verbatim until acked)
  nextSeq: number; // seq for the NEXT new pending
  lastAckedSeq: number;
  lastFlushAt: number;
}

class ForenUsageDb extends Dexie {
  identity!: Table<IdentityRow, string>;
  state!: Table<StateRow, string>;

  constructor() {
    super('ForenUsage');
    this.version(1).stores({
      identity: 'id',
      state: 'id',
    });
  }
}

export const usageDb = new ForenUsageDb();

export async function getIdentity(): Promise<IdentityRow | undefined> {
  return usageDb.identity.get('self');
}

export async function putIdentity(row: IdentityRow): Promise<void> {
  await usageDb.identity.put(row);
}

export async function getState(): Promise<StateRow> {
  const s = await usageDb.state.get('self');
  if (s) return s;
  const fresh: StateRow = {
    id: 'self',
    counters: zeroCounters(),
    pending: null,
    nextSeq: 1,
    lastAckedSeq: 0,
    lastFlushAt: 0,
  };
  await usageDb.state.put(fresh);
  return fresh;
}

export async function putState(row: StateRow): Promise<void> {
  await usageDb.state.put(row);
}

/** Remove all usage data (used by the app's full reset / panic wipe path). */
export async function wipeUsage(): Promise<void> {
  try {
    await Promise.all([usageDb.identity.clear(), usageDb.state.clear()]);
  } catch {
    /* best-effort */
  }
}
