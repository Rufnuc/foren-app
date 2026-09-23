import type { GameType, SymbolType, DuressState, RecoveryMethod } from '@/types';
import type { WrappedKey, PasscodeKind } from './crypto';
import { secureGet, secureSet, secureRemove } from './secureStore';

// Persisted vault configuration (v2). Contains ONLY wrapped (encrypted) copies
// of the data key and non-secret preferences — never a plaintext passcode and
// never a verification hash. A wrong secret simply fails to unwrap.
//
// Stored via secureStore, so on a real device this lives in the OS keystore
// (Keychain / Android Keystore), not in a copyable localStorage entry.

const STORAGE_KEY = 'foren.vault.config.v2';
const LEGACY_KEY = 'foren.vault.config.v1';

export interface VaultConfig {
  version: 2;
  passcodeKind: PasscodeKind;
  wrappedByPasscode: WrappedKey;
  wrappedByRecovery: WrappedKey;
  selectedGame: GameType;
  symbol: SymbolType;
  recoveryMethod: RecoveryMethod;
  duressEnabled: boolean;
  duressState: DuressState;
  wrappedByDuress?: WrappedKey;
  /** Opt-in Face ID / fingerprint unlock (native only). */
  biometricEnabled?: boolean;
  panicWipeEnabled: boolean;
  panicWipeSensitivity: number;
  createdAt: number;
}

function isWrappedKey(w: unknown): w is WrappedKey {
  if (!w || typeof w !== 'object') return false;
  const k = w as Record<string, unknown>;
  return (
    typeof k.salt === 'string' &&
    typeof k.iv === 'string' &&
    typeof k.ct === 'string' &&
    !!k.kdf &&
    typeof k.kdf === 'object'
  );
}

/** Structural validation: a tampered or corrupt config is treated as no vault. */
function isValidConfig(c: unknown): c is VaultConfig {
  if (!c || typeof c !== 'object') return false;
  const v = c as Record<string, unknown>;
  return (
    v.version === 2 &&
    (v.passcodeKind === 'pin' || v.passcodeKind === 'passphrase') &&
    isWrappedKey(v.wrappedByPasscode) &&
    isWrappedKey(v.wrappedByRecovery) &&
    (v.wrappedByDuress === undefined || isWrappedKey(v.wrappedByDuress)) &&
    (v.biometricEnabled === undefined || typeof v.biometricEnabled === 'boolean') &&
    typeof v.selectedGame === 'string' &&
    typeof v.recoveryMethod === 'string'
  );
}

export async function loadConfig(): Promise<VaultConfig | null> {
  try {
    const raw = await secureGet(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!isValidConfig(parsed)) {
      // Corrupt/tampered config can never unlock anything; discard it so the app
      // falls back to onboarding rather than getting stuck on a dead vault.
      await secureRemove(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function saveConfig(config: VaultConfig): Promise<void> {
  await secureSet(STORAGE_KEY, JSON.stringify(config));
}

export async function clearConfig(): Promise<void> {
  await secureRemove(STORAGE_KEY);
  await secureRemove(LEGACY_KEY);
}
