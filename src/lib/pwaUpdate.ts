import { registerSW } from 'virtual:pwa-register';

// Reliable, non-disruptive PWA updates.
//
// The problem this solves: an installed PWA (especially on iOS) only checks for
// a new version on a COLD load. If someone keeps the app on their home screen
// and just resumes it, it never notices a new deploy — so it stays stale until
// they delete and reinstall. And a naive auto-update force-reloads mid-use,
// which could drop someone's half-typed evidence.
//
// Fix: check for updates on launch, hourly, and every time the app is resumed;
// and APPLY a found update only at a safe moment — right after a cold start, or
// when the app is sent to the background — never mid-interaction.

let applyUpdate: ((reload?: boolean) => Promise<void>) | null = null;
let updatePending = false;
const startedAt = Date.now();

function applyIfSafe(force = false): void {
  if (!updatePending || !applyUpdate) return;
  const freshLoad = Date.now() - startedAt < 5000; // just opened → seamless
  const backgrounded = document.visibilityState === 'hidden';
  if (force || freshLoad || backgrounded) {
    updatePending = false;
    void applyUpdate(true); // skipWaiting + reload
  }
}

export function setupPwaAutoUpdate(): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      // A new version is installed and waiting.
      updatePending = true;
      applyIfSafe();
    },
    onRegisteredSW(_swUrl, registration) {
      applyUpdate = updateSW;
      if (!registration) return;

      const check = () => {
        if (document.visibilityState === 'visible') registration.update().catch(() => {});
      };
      check(); // check once on startup
      window.setInterval(check, 60 * 60 * 1000); // and hourly while open

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          check(); // resumed → look for a newer version
        } else {
          applyIfSafe(true); // sent to background → apply any pending update now
        }
      });
    },
  });
  applyUpdate = updateSW;
}
