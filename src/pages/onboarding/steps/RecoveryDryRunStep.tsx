import { useState } from 'react';
import { WizardLayout } from '../WizardLayout';
import type { StepProps } from '../types';
import { verifyTotp, normaliseSecret, suggestWords } from '@/lib/recovery';

type Status = 'idle' | 'checking' | 'pass' | 'fail';

// Step 4 (spec 1.6): prove the recovery method works before relying on it.
export function RecoveryDryRunStep({ draft, onNext, onBack }: StepProps) {
  const recovery = draft.recovery;
  const [status, setStatus] = useState<Status>('idle');

  // single-field input (authenticator / printed)
  const [text, setText] = useState('');
  // words input
  const [words, setWords] = useState<string[]>(Array(8).fill(''));

  if (!recovery) {
    // Shouldn't happen (step 3 sets it); guard for type-safety.
    return (
      <WizardLayout step={4} total={6} title="Test your recovery" onBack={onBack}>
        <p className="text-sm text-danger">No recovery method set. Go back a step.</p>
      </WizardLayout>
    );
  }

  const check = async () => {
    setStatus('checking');
    let ok = false;
    if (recovery.method === 'authenticator') {
      ok = await verifyTotp(recovery.secret, text);
    } else if (recovery.method === 'words') {
      ok =
        normaliseSecret('words', words.join(' ')) ===
        normaliseSecret('words', recovery.secret);
    } else {
      ok =
        normaliseSecret('printed', text) === normaliseSecret('printed', recovery.secret);
    }
    setStatus(ok ? 'pass' : 'fail');
  };

  const subtitle =
    recovery.method === 'authenticator'
      ? 'Enter the 6-digit code from your authenticator app.'
      : recovery.method === 'words'
        ? 'Enter your 8 recovery words.'
        : 'Enter the recovery code from your card.';

  return (
    <WizardLayout step={4} total={6} title="Test your recovery" subtitle={subtitle} onBack={onBack}>
      {recovery.method === 'authenticator' && (
        <input
          inputMode="numeric"
          maxLength={6}
          value={text}
          onChange={(e) => {
            setText(e.target.value.replace(/\D/g, ''));
            setStatus('idle');
          }}
          placeholder="123456"
          className="w-full rounded-xl bg-background px-4 py-3 text-center text-2xl tracking-widest text-primary"
        />
      )}

      {recovery.method === 'printed' && (
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setStatus('idle');
          }}
          rows={3}
          placeholder="Recovery code"
          className="w-full rounded-xl bg-background px-4 py-3 font-mono text-sm text-primary"
        />
      )}

      {recovery.method === 'words' && (
        <div className="grid grid-cols-2 gap-2">
          {words.map((w, i) => {
            const sugg = suggestWords(w);
            return (
              <div key={i} className="relative">
                <div className="flex items-center gap-1 rounded-xl bg-background px-2 py-2">
                  <span className="w-4 text-right text-xs text-secondary">{i + 1}.</span>
                  <input
                    value={w}
                    onChange={(e) => {
                      const next = [...words];
                      next[i] = e.target.value.toLowerCase();
                      setWords(next);
                      setStatus('idle');
                    }}
                    className="w-full bg-transparent text-sm text-primary outline-none"
                  />
                </div>
                {w && sugg.length > 0 && sugg[0] !== w && (
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      const next = [...words];
                      next[i] = sugg[0];
                      setWords(next);
                    }}
                    className="absolute left-0 right-0 z-10 mt-1 rounded-md bg-surface px-2 py-1 text-left text-xs text-gold"
                  >
                    {sugg[0]}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4 h-5 text-center text-sm" aria-live="polite">
        {status === 'pass' && <span className="text-success">✓ Great! Your recovery works.</span>}
        {status === 'fail' && <span className="text-danger">✗ That didn’t match. Try again.</span>}
      </div>

      {status === 'pass' ? (
        <button type="button" className="btn-primary mt-2 w-full" onClick={onNext}>
          Next
        </button>
      ) : (
        <button
          type="button"
          className="btn-secondary mt-2 w-full"
          disabled={status === 'checking'}
          onClick={check}
        >
          {status === 'checking' ? 'Checking…' : 'Check'}
        </button>
      )}
    </WizardLayout>
  );
}
