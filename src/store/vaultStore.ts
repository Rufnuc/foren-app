import { create } from 'zustand';
import type { GameType, SymbolType, DuressState, RecoveryMethod } from '@/types';
import {
  generateDekRaw,
  wrapDek,
  unwrapDek,
  importDek,
  bufferToBase64,
  base64ToBytes,
  type PasscodeKind,
} from '@/lib/crypto';
import { normaliseSecret } from '@/lib/recovery';
import { biometricAuthenticate } from '@/lib/biometric';
import * as attemptGuard from '@/lib/attemptGuard';
import { secureGet, secureSet, secureRemove, secureRemovePrefix } from '@/lib/secureStore';

// The raw data key, stored (keystore on device) for opt-in biometric unlock.
const BIO_DEK_KEY = 'foren.vault.biodek';
import { wipeAll } from '@/data/db';
import { queryClient } from '@/lib/queryClient';
import { loadConfig, saveConfig, clearConfig, type VaultConfig } from '@/lib/vaultConfig';

// Result of an unlock attempt.
//   'duress'  — a valid duress code was entered; caller shows the decoy.
//   'locked'  — too many recent failures; unlocking is temporarily blocked.
//   'wiped'   — the failure threshold was hit and the vault was force-erased.
export type UnlockResult = 'unlocked' | 'duress' | 'invalid' | 'locked' | 'wiped';

interface OnboardingInput {
  passcode: string;
  passcodeKind: PasscodeKind;
  game: GameType;
  symbol: SymbolType;
  recovery: { method: RecoveryMethod; secret: string };
  duress?: { passcode: string; state: DuressState };
}

interface VaultState {
  // False until init() has loaded persisted state from secure storage.
  initialized: boolean;
  hasVault: boolean;
  config: VaultConfig | null;

  // Session
  isUnlocked: boolean;
  /** AES data key, obtained by unwrapping at unlock; in-memory only. */
  encryptionKey: CryptoKey | null;
  /**
   * True when unlocked via a duress code with the "empty-vault" decoy. Only a
   * decoy key exists, so all data queries return empty — the coercer sees a
   * clean vault and no sign that the real vault exists.
   */
  duressMode: boolean;
  currentCaseId: string | null;

  // Actions
  /** Load persisted config + guard state from secure storage. Call once at boot. */
  init: () => Promise<void>;
  commitOnboarding: (input: OnboardingInput) => Promise<void>;
  unlock: (secret: string) => Promise<UnlockResult>;
  /** Unlock with Face ID / fingerprint (native, opt-in). Falls back to passcode. */
  unlockWithBiometric: () => Promise<UnlockResult>;
  /** Enable biometric unlock: stash the data key in the keystore. Needs the passcode. */
  enableBiometric: (secret: string) => Promise<boolean>;
  disableBiometric: () => Promise<void>;
  lock: () => void;
  /** True if the secret is the current passcode (gates sensitive settings). */
  verifySecret: (secret: string) => Promise<boolean>;
  /** True if the secret matches the stored recovery secret. */
  verifyRecovery: (secret: string) => Promise<boolean>;
  changePasscode: (oldCode: string, newCode: string, kind?: PasscodeKind) => Promise<boolean>;
  /** Restore access with the recovery secret and set a new passcode. */
  recover: (recoverySecret: string, newPasscode: string, kind?: PasscodeKind) => Promise<boolean>;
  setDuress: (passcode: string, duressState: DuressState) => Promise<void>;
  setDuressState: (duressState: DuressState) => void;
  disableDuress: () => void;
  setPanicWipe: (enabled: boolean, sensitivity?: number) => void;
  selectCase: (caseId: string | null) => void;
  resetVault: () => Promise<void>;
}

export const useVaultStore = create<VaultState>((set, get) => ({
  initialized: false,
  hasVault: false,
  config: null,

  isUnlocked: false,
  encryptionKey: null,
  duressMode: false,
  currentCaseId: null,

  init: async () => {
    if (get().initialized) return;
    await attemptGuard.load();
    const config = await loadConfig();
    set({ config, hasVault: config !== null, initialized: true });
  },

  commitOnboarding: async ({ passcode, passcodeKind, game, symbol, recovery, duress }) => {
    // Drop any orphaned pre-v2 vault (its data can't be decrypted under the new
    // scheme) so the device starts clean.
    await clearConfig();
    await wipeAll();

    // One random data key protects all evidence. It is wrapped under the
    // passcode and (separately) under the recovery secret.
    const dekRaw = generateDekRaw();
    const wrappedByPasscode = await wrapDek(passcode, dekRaw);
    const wrappedByRecovery = await wrapDek(
      normaliseSecret(recovery.method, recovery.secret),
      dekRaw,
    );

    const config: VaultConfig = {
      version: 2,
      passcodeKind,
      wrappedByPasscode,
      wrappedByRecovery,
      selectedGame: game,
      symbol,
      recoveryMethod: recovery.method,
      duressEnabled: false,
      duressState: 'return-to-game',
      panicWipeEnabled: false,
      panicWipeSensitivity: 5,
      createdAt: Date.now(),
    };

    if (duress) {
      // Duress wraps a throwaway DECOY key — never the real data key.
      const decoyRaw = generateDekRaw();
      config.duressEnabled = true;
      config.duressState = duress.state;
      config.wrappedByDuress = await wrapDek(duress.passcode, decoyRaw);
    }

    await saveConfig(config);
    const encryptionKey = await importDek(dekRaw);
    set({ config, hasVault: true, isUnlocked: true, encryptionKey, duressMode: false });
  },

  unlock: async (secret) => {
    const { config } = get();
    if (!config) return 'invalid';

    // Brute-force guard: refuse while locked out (persists across reloads).
    if (attemptGuard.isLocked()) return 'locked';

    // Real passcode: unwraps the data key.
    const dekRaw = await unwrapDek(secret, config.wrappedByPasscode);
    if (dekRaw) {
      attemptGuard.recordSuccess();
      const encryptionKey = await importDek(dekRaw);
      set({ isUnlocked: true, encryptionKey, duressMode: false });
      return 'unlocked';
    }

    // Duress code: unwraps only the decoy key (never the real one). Treated as a
    // legitimate entry, so it clears the guard (a coerced user isn't penalised).
    if (config.duressEnabled && config.wrappedByDuress) {
      const decoy = await unwrapDek(secret, config.wrappedByDuress);
      if (decoy) {
        attemptGuard.recordSuccess();
        if (config.duressState === 'empty-vault') {
          // Empty decoy vault: no real key, so every query returns nothing.
          set({ isUnlocked: true, encryptionKey: null, duressMode: true });
        }
        // 'return-to-game' leaves the lock screen up.
        return 'duress';
      }
    }

    // Wrong secret: record the failure and, at the threshold, force a wipe.
    const failure = attemptGuard.recordFailure();
    if (failure.wipe) {
      await get().resetVault();
      return 'wiped';
    }
    return 'invalid';
  },

  unlockWithBiometric: async () => {
    const { config } = get();
    if (!config?.biometricEnabled) return 'invalid';
    if (attemptGuard.isLocked()) return 'locked';
    // The OS biometric sheet is the gate; only then do we read the stored key.
    const ok = await biometricAuthenticate();
    if (!ok) return 'invalid'; // cancelled/failed → caller falls back to passcode
    const b64 = await secureGet(BIO_DEK_KEY);
    if (!b64) return 'invalid';
    attemptGuard.recordSuccess();
    const encryptionKey = await importDek(base64ToBytes(b64));
    set({ isUnlocked: true, encryptionKey, duressMode: false });
    return 'unlocked';
  },

  enableBiometric: async (secret) => {
    const { config } = get();
    if (!config) return false;
    // Confirm identity with the passcode, then stash the unwrapped data key in
    // the keystore so biometrics can retrieve it later.
    const dekRaw = await unwrapDek(secret, config.wrappedByPasscode);
    if (!dekRaw) return false;
    await secureSet(BIO_DEK_KEY, bufferToBase64(dekRaw));
    const next: VaultConfig = { ...config, biometricEnabled: true };
    await saveConfig(next);
    set({ config: next });
    return true;
  },

  disableBiometric: async () => {
    const { config } = get();
    if (!config) return;
    await secureRemove(BIO_DEK_KEY);
    const next: VaultConfig = { ...config, biometricEnabled: false };
    await saveConfig(next);
    set({ config: next });
  },

  lock: () => {
    // Purge decrypted data from the React Query cache so a later unlock (a
    // duress decoy especially) can never serve a previous session's data.
    queryClient.clear();
    set({ isUnlocked: false, encryptionKey: null, duressMode: false, currentCaseId: null });
  },

  verifySecret: async (secret) => {
    const { config } = get();
    if (!config) return false;
    return (await unwrapDek(secret, config.wrappedByPasscode)) !== null;
  },

  verifyRecovery: async (secret) => {
    const { config } = get();
    if (!config) return false;
    const normalised = normaliseSecret(config.recoveryMethod, secret);
    return (await unwrapDek(normalised, config.wrappedByRecovery)) !== null;
  },

  changePasscode: async (oldCode, newCode, kind) => {
    const { config } = get();
    if (!config) return false;
    // Unwrap with the old secret, then re-wrap the SAME data key under the new
    // one. Evidence stays encrypted under the unchanged key — no re-encryption.
    const dekRaw = await unwrapDek(oldCode, config.wrappedByPasscode);
    if (!dekRaw) return false;

    const wrappedByPasscode = await wrapDek(newCode, dekRaw);
    const next: VaultConfig = {
      ...config,
      passcodeKind: kind ?? config.passcodeKind,
      wrappedByPasscode,
    };
    await saveConfig(next);
    set({ config: next, encryptionKey: await importDek(dekRaw), isUnlocked: true });
    return true;
  },

  recover: async (recoverySecret, newPasscode, kind) => {
    const { config } = get();
    if (!config) return false;
    const normalised = normaliseSecret(config.recoveryMethod, recoverySecret);
    const dekRaw = await unwrapDek(normalised, config.wrappedByRecovery);
    if (!dekRaw) return false;

    const wrappedByPasscode = await wrapDek(newPasscode, dekRaw);
    const next: VaultConfig = {
      ...config,
      passcodeKind: kind ?? config.passcodeKind,
      wrappedByPasscode,
    };
    await saveConfig(next);
    set({ config: next, encryptionKey: await importDek(dekRaw), isUnlocked: true, duressMode: false });
    return true;
  },

  setDuress: async (passcode, duressState) => {
    const { config } = get();
    if (!config) return;
    const decoyRaw = generateDekRaw();
    const wrappedByDuress = await wrapDek(passcode, decoyRaw);
    const next: VaultConfig = {
      ...config,
      duressEnabled: true,
      duressState,
      wrappedByDuress,
    };
    await saveConfig(next);
    set({ config: next });
  },

  setDuressState: (duressState) => {
    const { config } = get();
    if (!config) return;
    const next: VaultConfig = { ...config, duressState };
    set({ config: next });
    void saveConfig(next);
  },

  disableDuress: () => {
    const { config } = get();
    if (!config) return;
    const next: VaultConfig = {
      ...config,
      duressEnabled: false,
      wrappedByDuress: undefined,
    };
    set({ config: next });
    void saveConfig(next);
  },

  setPanicWipe: (enabled, sensitivity) => {
    const { config } = get();
    if (!config) return;
    const next: VaultConfig = {
      ...config,
      panicWipeEnabled: enabled,
      panicWipeSensitivity: sensitivity ?? config.panicWipeSensitivity,
    };
    set({ config: next });
    void saveConfig(next);
  },

  selectCase: (currentCaseId) => set({ currentCaseId }),

  resetVault: async () => {
    await clearConfig();
    attemptGuard.clear();
    // Remove any other foren.* secrets (defensive). On device these live in the
    // keystore; the innocuous game high-score uses an underscore key and stays.
    await secureRemovePrefix('foren.');
    await wipeAll();
    queryClient.clear();
    set({
      config: null,
      hasVault: false,
      isUnlocked: false,
      encryptionKey: null,
      duressMode: false,
      currentCaseId: null,
    });
  },
}));
