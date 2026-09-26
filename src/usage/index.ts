// Public surface of the anonymous usage-tracking layer. The rest of the app
// imports ONLY from here, so the whole feature can be removed by deleting
// `src/usage/` and the handful of `track(...)` call sites.
//
// PRIVACY: this module measures anonymous product usage as integer counts only.
// It has no access to the encrypted vault (a separate IndexedDB) and can never
// read or transmit incident data, evidence, files, locations, names, or keys.

import { getOrCreateIdentity } from './identity';
import { flush, register } from './track';

export { track, flush, register } from './track';
export { wipeUsage } from './store';
export type { CounterKind } from './store';

/**
 * Initialise usage tracking: ensure the anonymous identity exists and flush any
 * counters left pending from a previous session. Safe to call on every boot;
 * best-effort and never throws. Call once the app is running (e.g. after the
 * vault unlocks) so we never touch storage during the disguise splash.
 */
export async function initUsage(): Promise<void> {
  try {
    await getOrCreateIdentity();
    // Count this install as a user even before it does anything (once per
    // device; idempotent server-side). Then flush any pending action counters.
    await register();
    await flush();
  } catch {
    /* tracking is optional — never block app startup */
  }
}
