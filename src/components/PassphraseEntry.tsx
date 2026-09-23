import { useEffect, useRef, useState } from 'react';

interface PassphraseEntryProps {
  /** Resolve true if accepted (parent then unmounts the entry). */
  onSubmit: (secret: string) => Promise<boolean>;
  onCancel: () => void;
  title?: string;
  submitLabel?: string;
  /** Optional client-side validation (e.g. create mode). Return an error or null. */
  validate?: (secret: string) => string | null | Promise<string | null>;
}

const LOCK_AFTER = 3; // wrong attempts before a short lock
const LOCK_MS = 2000;
const CLOSE_AFTER = 10; // wrong attempts before the app closes
const CLOSE_COUNTDOWN = 30;

// Passphrase counterpart to DiscreteKeypad, for vaults whose unlock secret is an
// alphanumeric passphrase rather than a numeric PIN. Same onSubmit contract and
// brute-force throttling; masked input with a reveal toggle.
export function PassphraseEntry({
  onSubmit,
  onCancel,
  title = 'Enter passphrase',
  submitLabel = 'Unlock',
  validate,
}: PassphraseEntryProps) {
  const [value, setValue] = useState('');
  const [reveal, setReveal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [closeIn, setCloseIn] = useState<number | null>(null);
  const submitting = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isLocked = now < lockedUntil;
  const lockSecondsLeft = Math.ceil((lockedUntil - now) / 1000);
  const canSubmit = value.length > 0 && !isLocked && !submitting.current;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!isLocked && closeIn === null) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [isLocked, closeIn]);

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

  const submit = async () => {
    if (!canSubmit) return;
    submitting.current = true;
    if (validate) {
      const v = await validate(value);
      if (v) {
        setError(v);
        submitting.current = false;
        return;
      }
    }
    try {
      const accepted = await onSubmit(value);
      if (accepted) return; // parent unmounts us
      const next = attempts + 1;
      setAttempts(next);
      setValue('');
      setError('Incorrect passphrase');
      if (next >= CLOSE_AFTER) setCloseIn(CLOSE_COUNTDOWN);
      else if (next % LOCK_AFTER === 0) setLockedUntil(Date.now() + LOCK_MS);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Passphrase submit failed:', err);
      setValue('');
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
            <p className="text-sm text-secondary">{title}</p>

            <div className="my-4 flex items-center gap-2">
              <input
                ref={inputRef}
                type={reveal ? 'text' : 'password'}
                value={value}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                disabled={isLocked}
                onChange={(e) => {
                  setValue(e.target.value);
                  setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submit();
                }}
                className="flex-1 rounded-xl bg-background px-3 py-3 text-primary outline-none focus:ring-1 focus:ring-plum"
                placeholder="Your passphrase"
              />
              <button
                type="button"
                onClick={() => setReveal((r) => !r)}
                aria-label={reveal ? 'Hide passphrase' : 'Show passphrase'}
                className="rounded-lg bg-background px-3 py-3 text-sm text-secondary"
              >
                {reveal ? 'Hide' : 'Show'}
              </button>
            </div>

            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit}
              className="btn-primary w-full disabled:opacity-40"
            >
              {submitLabel}
            </button>

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
