// The tracking core. Public surface: track(kind) and flush(). Everything here
// is best-effort and MUST NEVER throw into the calling app — a failure to
// record usage can never affect the vault or the UI. Only integer counter
// deltas leave the device (see sign.ts), signed by the anonymous identity.

import { getOrCreateIdentity } from './identity';
import { buildSignedSubmission, type SignedSubmission } from './sign';
import {
  getState,
  putState,
  zeroCounters,
  countersAllZero,
  type CounterKind,
  type Counters,
  type StateRow,
} from './store';

const RELAY_URL = import.meta.env.VITE_RELAY_URL ?? 'http://127.0.0.1:4000';
const ENDPOINT = `${RELAY_URL}/v1/usage`;
const ENABLED = import.meta.env.VITE_USAGE_ENABLED !== 'false';
const FLUSH_DEBOUNCE_MS = 15_000;

// Serialize all state mutations so a track() during a flush() can't clobber it.
let chain: Promise<unknown> = Promise.resolve();
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => undefined);
  return run;
}

let flushTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleFlush(): void {
  if (!ENABLED || flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flush();
  }, FLUSH_DEBOUNCE_MS);
}

/** Record one meaningful product action. Fire-and-forget; never throws. */
export function track(kind: CounterKind): void {
  if (!ENABLED) return;
  void withLock(async () => {
    try {
      const s = await getState();
      s.counters[kind] = (s.counters[kind] ?? 0) + 1;
      await putState(s);
      scheduleFlush();
    } catch {
      /* tracking must never break the app */
    }
  });
}

async function postSubmission(sub: SignedSubmission): Promise<'ok' | 'permanent' | 'retry'> {
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(sub),
      keepalive: true,
    });
  } catch {
    return 'retry'; // network unreachable — keep pending, try again later
  }
  if (res.ok) return 'ok';
  // 400 = malformed/invalid signature: dropping avoids a poison-retry loop.
  // 429/5xx and anything else: transient, keep pending for a later retry.
  return res.status === 400 ? 'permanent' : 'retry';
}

/**
 * Flush accumulated counters as a single signed submission. Single-flight and
 * exactly-once: an unacknowledged submission is stored as `pending` and resent
 * verbatim (fresh nonce/timestamp) until the server applies it. New actions
 * accumulate separately and ship in the next sequence number.
 */
export async function flush(): Promise<void> {
  if (!ENABLED) return;
  await withLock(async () => {
    try {
      const identity = await getOrCreateIdentity();
      const s = await getState();

      let pendingCounters: Counters;
      let seq: number;

      if (s.pending) {
        // Resend the in-flight submission (idempotent server-side via seq).
        pendingCounters = s.pending.counters;
        seq = s.pending.seq;
      } else {
        if (countersAllZero(s.counters)) return;
        pendingCounters = s.counters;
        seq = s.nextSeq;
        // Persist the move BEFORE any network call so a crash can't lose it.
        const moved: StateRow = {
          ...s,
          pending: { seq, counters: pendingCounters },
          counters: zeroCounters(),
          nextSeq: s.nextSeq + 1,
        };
        await putState(moved);
      }

      const sub = await buildSignedSubmission(identity, pendingCounters, seq);
      const result = await postSubmission(sub);
      if (result === 'retry') return; // leave pending; a later flush retries

      // ok OR permanent(400): clear pending either way (400 can't be fixed by
      // resending the same bytes; dropping prevents an endless poison loop).
      const cur = await getState();
      await putState({
        ...cur,
        pending: null,
        lastAckedSeq: result === 'ok' ? seq : cur.lastAckedSeq,
        lastFlushAt: Date.now(),
      });
    } catch {
      /* never throw */
    }
  });
}
