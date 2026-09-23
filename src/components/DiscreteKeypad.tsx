import { useEffect, useRef, useState } from 'react';

interface DiscreteKeypadProps {
  /** Resolve true if the code was accepted (parent then unmounts the keypad). */
  onSubmit: (code: string) => Promise<boolean>;
  onCancel: () => void;
  title?: string;
  /** Optional client-side validation (e.g. create mode). Return an error or null. */
  validate?: (code: string) => string | null | Promise<string | null>;
  minLength?: number;
  maxLength?: number;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '✓'] as const;

const LOCK_AFTER = 3; // wrong attempts before a short lock
const LOCK_MS = 2000;
const CLOSE_AFTER = 10; // wrong attempts before the app closes
const CLOSE_COUNTDOWN = 30;

function vibrate(ms: number) {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(ms);
}

// Discrete numeric keypad (spec Part 2.2). Masked entry, validation, and
// brute-force throttling. Auth itself happens in the parent via onSubmit.
export function DiscreteKeypad({
  onSubmit,
  onCancel,
  title = 'Enter code',
  validate,
  minLength = 6,
  maxLength = 12,
}: DiscreteKeypadProps) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [closeIn, setCloseIn] = useState<number | null>(null);
  const submitting = useRef(false);

  const isLocked = now < lockedUntil;
  const lockSecondsLeft = Math.ceil((lockedUntil - now) / 1000);
  const canSubmit = code.length >= minLength && code.length <= maxLength && !isLocked;

  // Tick while locked or counting down to close.
  useEffect(() => {
    if (!isLocked && closeIn === null) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [isLocked, closeIn]);

  // Close-countdown after too many failures.
  useEffect(() => {
    if (closeIn === null) return;
    if (closeIn <= 0) {
      window.close(); // may be blocked on mobile web; fall back to cancel
      onCancel();
      return;
    }
    const id = setTimeout(() => setCloseIn((c) => (c === null ? null : c - 1)), 1000);
    return () => clearTimeout(id);
  }, [closeIn, onCancel]);

  const press = async (key: (typeof KEYS)[number]) => {
    if (isLocked || closeIn !== null || submitting.current) return;
    vibrate(8);

    if (key === 'C') {
      setCode((c) => c.slice(0, -1));
      return;
    }
    if (key !== '✓') {
      setError(null);
      setCode((c) => (c.length < maxLength ? c + key : c));
      return;
    }

    // Submit (✓)
    if (!canSubmit) return;
    submitting.current = true;
    if (validate) {
      const v = await validate(code);
      if (v) {
        setError(v);
        setCode('');
        vibrate(40);
        submitting.current = false;
        return;
      }
    }

    try {
      const accepted = await onSubmit(code);
      if (accepted) return; // parent will unmount us
      // Wrong code
      const next = attempts + 1;
      setAttempts(next);
      setCode('');
      setError('Incorrect code');
      vibrate(60);
      if (next >= CLOSE_AFTER) setCloseIn(CLOSE_COUNTDOWN);
      else if (next % LOCK_AFTER === 0) setLockedUntil(Date.now() + LOCK_MS);
    } catch (err) {
      // Never hang silently — surface the failure (e.g. Web Crypto unavailable).
      // eslint-disable-next-line no-console
      console.error('Keypad submit failed:', err);
      setCode('');
      setError('Something went wrong. Please try again.');
    } finally {
      submitting.current = false;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4">
      <div className="card w-full max-w-app">
        {closeIn !== null ? (
          <div className="py-4 text-center">
            <p className="text-base font-semibold text-danger">Too many tries</p>
            <p className="mt-1 text-sm text-secondary">Closing in {closeIn}s…</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <p className="text-sm text-secondary">
                {title} ({minLength}-{maxLength} digits)
              </p>
            </div>

            <div className="my-4 flex h-5 items-center gap-2" aria-label="Entered digits">
              {Array.from(code).map((_, i) => (
                <span key={i} className="h-3 w-3 rounded-full bg-primary" />
              ))}
            </div>

            <div className="grid grid-cols-3 gap-3">
              {KEYS.map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-label={k === 'C' ? 'Delete' : k === '✓' ? 'Submit' : k}
                  onClick={() => press(k)}
                  disabled={isLocked || (k === '✓' && !canSubmit)}
                  className="btn bg-background text-lg text-primary hover:bg-black/40 disabled:opacity-40"
                >
                  {k}
                </button>
              ))}
            </div>

            <div className="mt-3 h-5 text-center text-sm" aria-live="polite">
              {isLocked ? (
                <span className="text-secondary">Try again in {lockSecondsLeft}s</span>
              ) : error ? (
                <span className="text-danger">{error}</span>
              ) : null}
            </div>

            <button type="button" onClick={onCancel} className="btn-secondary mt-2 w-full">
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}
