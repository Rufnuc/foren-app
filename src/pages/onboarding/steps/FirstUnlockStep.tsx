import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useVaultStore } from '@/store/vaultStore';
import { useTwoFingerSwipeUp } from '@/hooks/useUnlockGesture';
import { DecoyGame } from '@/games/DecoyGame';
import { DiscreteKeypad, PassphraseEntry } from '@/components';
import type { StepProps } from '../types';

const LONG_PRESS_MS = 600;

// Step 6 (spec 1.8): the user proves they can unlock. On success we commit the
// whole onboarding config atomically and enter the vault.
export function FirstUnlockStep({ draft, onBack }: StepProps) {
  const navigate = useNavigate();
  const commitOnboarding = useVaultStore((s) => s.commitOnboarding);
  const [keypadOpen, setKeypadOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const pressTimer = useRef<number | null>(null);

  const open = useCallback(() => setKeypadOpen(true), []);
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

  const handleSubmit = async (code: string): Promise<boolean> => {
    if (code !== draft.passcode || !draft.recovery) return false;
    // commitOnboarding wraps the data key and unlocks in one step.
    await commitOnboarding({
      passcode: draft.passcode,
      passcodeKind: draft.passcodeKind,
      game: draft.game,
      symbol: draft.symbol,
      recovery: draft.recovery,
      duress: draft.duress ?? undefined,
    });
    navigate('/vault', { replace: true });
    return true;
  };

  return (
    <div
      ref={containerRef}
      className="relative flex min-h-screen w-full flex-col items-center justify-center gap-6 bg-background px-6"
    >
      <button
        type="button"
        aria-label="Menu"
        data-testid="corner-activator"
        onDoubleClick={open}
        onPointerDown={startPress}
        onPointerUp={cancelPress}
        onPointerLeave={cancelPress}
        className="absolute right-0 top-0 h-11 w-11 bg-transparent"
      />
      <button type="button" onClick={onBack} className="absolute left-4 top-4 text-sm text-gold">
        ← Back
      </button>

      <div className="text-center">
        <h1 className="text-xl font-semibold text-primary">You’re ready!</h1>
        <p className="mt-1 text-sm text-secondary">
          Draw your symbol (or double-tap the top-right corner), then enter your code.
        </p>
      </div>

      <DecoyGame game={draft.game} />

      {keypadOpen &&
        (draft.passcodeKind === 'passphrase' ? (
          <PassphraseEntry onSubmit={handleSubmit} onCancel={() => setKeypadOpen(false)} />
        ) : (
          <DiscreteKeypad onSubmit={handleSubmit} onCancel={() => setKeypadOpen(false)} />
        ))}
    </div>
  );
}
