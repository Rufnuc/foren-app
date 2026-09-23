import { Capacitor } from '@capacitor/core';

// Storage abstraction for small, high-value secrets (the wrapped vault config
// and the brute-force attempt counter).
//
//   • On a real device (Capacitor): the OS keystore — iOS Keychain / Android
//     Keystore (EncryptedSharedPreferences). Hardware-backed, sandboxed to this
//     app, not readable by other apps and not present in a plain file/localStorage
//     dump. This is what closes the "editable/copyable localStorage" gap that a
//     pure web app can't.
//   • On the web (dev / PWA fallback): localStorage. Same behaviour as before —
//     no secure enclave exists in a browser.
//
// Bulk evidence stays in IndexedDB (already AES-GCM ciphertext); only these
// small secrets need the keystore.
//
// IMPORTANT: the native plugin's `SecureStorage` export is a Capacitor proxy.
// Never return it from an async function — the promise machinery would call
// `.then()` on it (forwarded to native as an unimplemented call, which hangs).
// So each function imports the plugin and calls the method inline.

const native = Capacitor.isNativePlatform();

export function isNativePlatform(): boolean {
  return native;
}

export async function secureGet(key: string): Promise<string | null> {
  if (!native) return localStorage.getItem(key);
  try {
    const { SecureStorage } = await import('@aparajita/capacitor-secure-storage');
    const value = await SecureStorage.get(key);
    return value == null ? null : String(value);
  } catch {
    return null; // not found (or unreadable) → treat as absent
  }
}

export async function secureSet(key: string, value: string): Promise<void> {
  if (!native) {
    localStorage.setItem(key, value);
    return;
  }
  const { SecureStorage } = await import('@aparajita/capacitor-secure-storage');
  await SecureStorage.set(key, value);
}

export async function secureRemove(key: string): Promise<void> {
  if (!native) {
    localStorage.removeItem(key);
    return;
  }
  try {
    const { SecureStorage } = await import('@aparajita/capacitor-secure-storage');
    await SecureStorage.remove(key);
  } catch {
    /* already absent */
  }
}

/** Remove every stored key that starts with `prefix` (used for a full wipe). */
export async function secureRemovePrefix(prefix: string): Promise<void> {
  if (!native) {
    for (const k of Object.keys(localStorage)) if (k.startsWith(prefix)) localStorage.removeItem(k);
    return;
  }
  try {
    const { SecureStorage } = await import('@aparajita/capacitor-secure-storage');
    const keys = await SecureStorage.keys();
    await Promise.all(keys.filter((k) => k.startsWith(prefix)).map((k) => SecureStorage.remove(k)));
  } catch {
    /* ignore */
  }
}
