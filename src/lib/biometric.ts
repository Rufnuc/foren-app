import { Capacitor } from '@capacitor/core';

// Face ID / Touch ID / fingerprint wrapper. Native-only — on the web these
// return false so no biometric UI is ever shown. The plugin is lazy-imported so
// it is never pulled into the web runtime.
//
// Prompt strings are deliberately disguise-safe ("Puzzle", "Unlock") — the OS
// shows them in the system biometric sheet, so they must never mention a vault
// or evidence.
//
// Like secureStore, never return the plugin proxy from an async function (the
// promise machinery would call `.then()` on it); call methods inline.

const native = Capacitor.isNativePlatform();

/** True if the device has biometrics set up and available. */
export async function biometricAvailable(): Promise<boolean> {
  if (!native) return false;
  try {
    const { BiometricAuth } = await import('@aparajita/capacitor-biometric-auth');
    const info = await BiometricAuth.checkBiometry();
    return info.isAvailable;
  } catch {
    return false;
  }
}

/** Prompt the system biometric sheet. Resolves true on success, false otherwise. */
export async function biometricAuthenticate(): Promise<boolean> {
  if (!native) return false;
  try {
    const { BiometricAuth } = await import('@aparajita/capacitor-biometric-auth');
    await BiometricAuth.authenticate({
      reason: 'Unlock Puzzle',
      cancelTitle: 'Use code',
      iosFallbackTitle: 'Use code',
      allowDeviceCredential: false,
      androidTitle: 'Unlock',
      androidSubtitle: 'Puzzle',
      androidConfirmationRequired: false,
    });
    return true;
  } catch {
    return false; // cancelled, failed, or locked out → caller falls back to code
  }
}
