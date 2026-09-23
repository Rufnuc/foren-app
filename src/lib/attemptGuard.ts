import { secureGet, secureSet, secureRemove } from './secureStore';

// Persistent brute-force guard for vault unlocking.
//
// The count + lockout deadline persist via secureStore (OS keystore on device,
// localStorage on web), so reloading/relaunching the app can't reset the
// throttle. After WIPE_THRESHOLD failures the caller force-wipes the vault.
//
// The state is mirrored in an in-memory cache so the hot path (unlock) can read
// it synchronously; writes persist asynchronously. Call load() once at startup.
//
// Honest limitation: on the web build this lives in localStorage, which someone
// with dev tools on the live device could edit. On a real device it lives in the
// keystore, which is far harder to tamper with. The ultimate backstop is the
// Argon2id cost per guess plus this on-device wipe; an offline copy of the
// ciphertext can never be protected by an in-app wipe.

const KEY = 'foren.unlock.guard.v1';

/** Failures at which the vault is wiped (the familiar "erase after 10"). */
export const WIPE_THRESHOLD = 10;

export interface GuardState {
  fails: number;
  lockedUntil: number; // epoch ms
}

let cache: GuardState = { fails: 0, lockedUntil: 0 };

/** Hydrate the in-memory cache from storage. Call once during app init. */
export async function load(): Promise<void> {
  try {
    const raw = await secureGet(KEY);
    if (!raw) {
      cache = { fails: 0, lockedUntil: 0 };
      return;
    }
    const parsed = JSON.parse(raw);
    cache = { fails: Number(parsed.fails) || 0, lockedUntil: Number(parsed.lockedUntil) || 0 };
  } catch {
    cache = { fails: 0, lockedUntil: 0 };
  }
}

function persist(): void {
  void secureSet(KEY, JSON.stringify(cache));
}

/** Escalating lockout after each failure (ms). Grows before the final wipe. */
function lockFor(fails: number): number {
  if (fails < 3) return 0;
  if (fails < 5) return 15_000; // 15s
  if (fails < 7) return 60_000; // 1 min
  if (fails < 9) return 5 * 60_000; // 5 min
  return 15 * 60_000; // 15 min (before the wipe at 10)
}

export function guardState(): GuardState {
  return cache;
}

export function isLocked(): boolean {
  return Date.now() < cache.lockedUntil;
}

export function lockRemainingMs(): number {
  return Math.max(0, cache.lockedUntil - Date.now());
}

/** Failures still allowed before the vault erases. */
export function attemptsRemaining(): number {
  return Math.max(0, WIPE_THRESHOLD - cache.fails);
}

export interface FailureResult {
  wipe: boolean;
  fails: number;
  attemptsRemaining: number;
  lockedUntil: number;
}

/** Record a failed unlock. If the threshold is reached, signal a wipe. */
export function recordFailure(): FailureResult {
  const fails = cache.fails + 1;
  if (fails >= WIPE_THRESHOLD) {
    clear();
    return { wipe: true, fails, attemptsRemaining: 0, lockedUntil: 0 };
  }
  cache = { fails, lockedUntil: Date.now() + lockFor(fails) };
  persist();
  return { wipe: false, fails, attemptsRemaining: WIPE_THRESHOLD - fails, lockedUntil: cache.lockedUntil };
}

export function recordSuccess(): void {
  clear();
}

export function clear(): void {
  cache = { fails: 0, lockedUntil: 0 };
  void secureRemove(KEY);
}
