import { useState } from 'react';
import type { DuressState } from '@/types';
import { DiscreteKeypad } from '@/components';
import { WizardLayout } from '../WizardLayout';
import type { StepProps } from '../types';

const STATES: Array<{ id: DuressState; label: string; blurb: string }> = [
  { id: 'return-to-game', label: 'Return to the game', blurb: 'Safest — reveals nothing.' },
  { id: 'empty-vault', label: 'Show an empty vault', blurb: 'Riskier — reveals the app exists.' },
];

// Step 5 (spec 1.7): optional duress code that shows a safe decoy under coercion.
export function DuressSetupStep({ draft, update, onNext, onBack }: StepProps) {
  const [enabled, setEnabled] = useState(draft.duress !== null);
  const [state, setState] = useState<DuressState>(draft.duress?.state ?? 'return-to-game');
  const [code, setCode] = useState(draft.duress?.passcode ?? '');
  const [keypadOpen, setKeypadOpen] = useState(false);

  const validate = (c: string): string | null => {
    if (/^(\d)\1*$/.test(c)) return 'Code can’t be all the same digit';
    if (c === draft.passcode) return 'Must differ from your unlock code';
    return null;
  };

  const handleContinue = () => {
    if (enabled && code) update({ duress: { passcode: code, state } });
    else update({ duress: null });
    onNext();
  };

  return (
    <WizardLayout
      step={5}
      total={7}
      title="Set up a duress code (optional)"
      subtitle="If someone forces you to unlock, this code shows a safe decoy instead of your real vault."
      onBack={onBack}
    >
      <label className="card flex items-center justify-between">
        <span className="font-medium text-primary">Enable duress protection</span>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-5 w-5 accent-plum"
        />
      </label>

      {enabled && (
        <div className="mt-4 flex flex-col gap-4">
          <button type="button" className="btn-secondary w-full" onClick={() => setKeypadOpen(true)}>
            {code ? '✓ Duress code set — change' : 'Set duress code'}
          </button>

          <fieldset>
            <legend className="mb-2 text-sm text-secondary">When the duress code is used:</legend>
            <div className="flex flex-col gap-2">
              {STATES.map((s) => (
                <label
                  key={s.id}
                  className={`card flex items-center gap-3 ${state === s.id ? 'ring-2 ring-gold' : ''}`}
                >
                  <input
                    type="radio"
                    name="duress-state"
                    checked={state === s.id}
                    onChange={() => setState(s.id)}
                    className="accent-plum"
                  />
                  <span>
                    <span className="block text-sm font-medium text-primary">{s.label}</span>
                    <span className="block text-xs text-secondary">{s.blurb}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      )}

      <button
        type="button"
        className="btn-primary mt-8 w-full"
        disabled={enabled && !code}
        onClick={handleContinue}
      >
        Continue
      </button>

      {keypadOpen && (
        <DiscreteKeypad
          title="Set duress code"
          validate={validate}
          onSubmit={async (c) => {
            setCode(c);
            setKeypadOpen(false);
            return true;
          }}
          onCancel={() => setKeypadOpen(false)}
        />
      )}
    </WizardLayout>
  );
}
