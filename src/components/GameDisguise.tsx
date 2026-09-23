import { useCallback, useEffect, useRef, useState } from 'react';
import { useVaultStore } from '@/store/vaultStore';
import { useTwoFingerSwipeUp } from '@/hooks/useUnlockGesture';
import * as attemptGuard from '@/lib/attemptGuard';
import { DecoyGame } from '@/games/DecoyGame';
import { DiscreteKeypad } from './DiscreteKeypad';
import { PassphraseEntry } from './PassphraseEntry';

// The locked experience (spec Part 2.1): a real, playable decoy game with a
// hidden path to the unlock entry. On success the store flips `isUnlocked` and
// the router redirects to the vault.
//
// A persistent brute-force guard (attemptGuard) throttles repeated wrong
// entries across reloads and, once the failure threshold is hit, forces a full
// wipe. The user is warned as attempts run low so they can recover instead.

const LONG_PRESS_MS = 600;
// Start warning once this few attempts remain before the wipe.
const WARN_AT_REMAINING = 4;

export function GameDisguise() {
  const config = useVaultStore((s) => s.config);
  const unlock = useVaultStore((s) => s.unlock);
  const unlockWithBiometric = useVaultStore((s) => s.unlockWithBiometric);
  const [entryOpen, setEntryOpen] = useState(false);
  const [banner, setBanner] = useState<{ lockedUntil: number; attemptsLeft: number } | null>(null);
  const [now, setNow] = useState(Date.now());
  const containerRef = useRef<HTMLDivElement>(null);
  const pressTimer = useRef<number | null>(null);

  const locked = banner ? now < banner.lockedUntil : false;
  const lockSecondsLeft = banner ? Math.ceil((banner.lockedUntil - now) / 1000) : 0;

  // Tick while a lockout countdown is showing.
  useEffect(() => {
    if (!locked) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [locked]);

  const showLockBanner = useCallback(() => {
    setBanner({
      lockedUntil: attemptGuard.guardState().lockedUntil,
      attemptsLeft: attemptGuard.attemptsRemaining(),
    });
    setNow(Date.now());
  }, []);

  const open = useCallback(async () => {
    if (attemptGuard.isLocked()) {
      showLockBanner();
      return;
    }
    // Biometric unlock (native, opt-in): the deliberate gesture already happened,
    // so prompting Face ID here is expected. On cancel/failure fall back to code.
    if (config?.biometricEnabled) {
      const r = await unlockWithBiometric();
      if (r === 'unlocked' || r === 'duress' || r === 'wiped') return;
      if (r === 'locked') {
        showLockBanner();
        return;
      }
    }
    setBanner(null);
    setEntryOpen(true);
  }, [config?.biometricEnabled, unlockWithBiometric, showLockBanner]);

  useTwoFingerSwipeUp(containerRef, open);

  const startPress = () => {
    pressTimer.current = window.setTimeout(open, LONG_PRESS_MS);
  };
  const cancelPress = () => {
    if (pressTimer.current !== null) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  const handleSubmit = async (secret: string): Promise<boolean> => {
    const result = await unlock(secret);
    if (result === 'unlocked' || result === 'duress') {
      setEntryOpen(false);
      setBanner(null);
      return true; // store flips isUnlocked / duress → router redirects or stays
    }
    if (result === 'wiped') {
      // Vault erased: config is now null, so the app re-renders to onboarding.
      setEntryOpen(false);
      return true;
    }
    // 'invalid' or 'locked': surface the guard state. Once locked or attempts
    // run low, close the entry and show the warning banner instead.
    const nowLocked = attemptGuard.isLocked();
    const attemptsLeft = attemptGuard.attemptsRemaining();
    if (result === 'locked' || nowLocked || attemptsLeft <= WARN_AT_REMAINING) {
      setEntryOpen(false);
      setBanner({ lockedUntil: attemptGuard.guardState().lockedUntil, attemptsLeft });
      setNow(Date.now());
      return true; // close entry; banner takes over
    }
    return false; // keep entry open with its own "incorrect" feedback
  };

  return (
    <div
      ref={containerRef}
      className="relative flex h-full min-h-screen w-full flex-col items-center justify-center bg-background"
    >
      {/* Discreet corner activator: nearly invisible, 1px border, 44px target. */}
      <button
        type="button"
        aria-label="Menu"
        data-testid="corner-activator"
        onDoubleClick={open}
        onPointerDown={startPress}
        onPointerUp={cancelPress}
        onPointerLeave={cancelPress}
        className="absolute left-0 top-0 h-11 w-11 border border-white/5"
      />

      <DecoyGame game={config?.selectedGame ?? 'game2048'} />

      {entryOpen &&
        (config?.passcodeKind === 'passphrase' ? (
          <PassphraseEntry onSubmit={handleSubmit} onCancel={() => setEntryOpen(false)} />
        ) : (
          <DiscreteKeypad onSubmit={handleSubmit} onCancel={() => setEntryOpen(false)} />
        ))}

      {banner && !entryOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4">
          <div className="card w-full max-w-app text-center">
            <p className="text-base font-semibold text-danger">Incorrect</p>
            {locked ? (
              <p className="mt-2 text-sm text-secondary">
                Too many attempts. Try again in {lockSecondsLeft}s.
              </p>
            ) : (
              <p className="mt-2 text-sm text-secondary">
                {banner.attemptsLeft} attempt{banner.attemptsLeft === 1 ? '' : 's'} left before this
                device erases everything. If you’ve forgotten it, restore with your recovery code.
              </p>
            )}
            <button
              type="button"
              disabled={locked}
              onClick={() => {
                setBanner(null);
                setEntryOpen(true);
              }}
              className="btn-primary mt-4 w-full disabled:opacity-40"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => setBanner(null)}
              className="btn-secondary mt-2 w-full"
            >
              Back to game
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
