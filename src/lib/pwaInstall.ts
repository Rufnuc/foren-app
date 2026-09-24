// PWA install helpers. Chromium fires `beforeinstallprompt` early (often before
// the onboarding step mounts), so we capture it once at module load and stash it.
// iOS Safari has no such event — install there is always the manual Share →
// "Add to Home Screen" flow, which the UI explains.

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // stop Chrome's default mini-infobar; we prompt on demand
    deferredPrompt = e as BeforeInstallPromptEvent;
    listeners.forEach((fn) => fn());
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    listeners.forEach((fn) => fn());
  });
}

/** Whether the page is already running as an installed (standalone) app. */
export function isStandalone(): boolean {
  try {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      // iOS Safari exposes navigator.standalone instead of display-mode.
      (navigator as unknown as { standalone?: boolean }).standalone === true
    );
  } catch {
    return false;
  }
}

export function canPromptInstall(): boolean {
  return deferredPrompt !== null;
}

/** Trigger the native install prompt (Chromium). Returns true if accepted. */
export async function promptInstall(): Promise<boolean> {
  if (!deferredPrompt) return false;
  await deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  listeners.forEach((fn) => fn());
  return outcome === 'accepted';
}

/** Subscribe to install-availability changes; returns an unsubscribe fn. */
export function onInstallChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export type Platform = 'ios' | 'android' | 'desktop';

export function detectPlatform(): Platform {
  const ua = navigator.userAgent || '';
  if (/iphone|ipad|ipod/i.test(ua) || (/^mac/i.test(navigator.platform) && navigator.maxTouchPoints > 1)) {
    return 'ios';
  }
  if (/android/i.test(ua)) return 'android';
  return 'desktop';
}
