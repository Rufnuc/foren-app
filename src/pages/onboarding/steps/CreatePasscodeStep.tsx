import { useState } from 'react';
import type { SymbolType } from '@/types';
import { DiscreteKeypad, PassphraseEntry } from '@/components';
import { checkPasscodeStrength, type PasscodeKind } from '@/lib/crypto';
import { WizardLayout } from '../WizardLayout';
import type { StepProps } from '../types';

const SYMBOLS: Array<{ id: SymbolType; glyph: string; label: string }> = [
  { id: 'star', glyph: '★', label: 'Star' },
  { id: 'diamond', glyph: '◆', label: 'Diamond' },
  { id: 'check', glyph: '✓', label: 'Check' },
  { id: 'circle', glyph: '◯', label: 'Circle' },
];

const KINDS: Array<{ id: PasscodeKind; label: string; hint: string }> = [
  { id: 'pin', label: 'Number PIN', hint: 'Fast to enter. 6–12 digits.' },
  { id: 'passphrase', label: 'Passphrase', hint: 'Stronger. Letters, numbers, symbols.' },
];

type Phase = 'symbol' | 'enter' | 'confirm';

// Step 2 (spec 1.4): choose PIN or passphrase and a gesture symbol, then set the
// secret with a confirmation pass (it can't be reset, so we double-check it).
export function CreatePasscodeStep({ draft, update, onNext, onBack }: StepProps) {
  const [symbol, setSymbol] = useState<SymbolType>(draft.symbol);
  const [kind, setKind] = useState<PasscodeKind>(draft.passcodeKind);
  const [phase, setPhase] = useState<Phase>('symbol');
  const [first, setFirst] = useState('');

  const validateStrength = (secret: string) => checkPasscodeStrength(secret, kind).reason ?? null;
  const validateMatch = (secret: string) =>
    secret === first ? null : kind === 'pin' ? 'Codes don’t match — try again' : 'Passphrases don’t match — try again';

  const subtitle =
    kind === 'pin'
      ? 'Choose a number code (6–12 digits). Avoid repeats, sequences, and common PINs. You won’t be able to reset it, so remember it.'
      : 'Choose a passphrase (8+ characters, mixing letters with numbers or symbols). Longer is stronger. You won’t be able to reset it, so remember it.';

  // Shared handlers for the enter / confirm passes (same for PIN and passphrase).
  const isEnter = phase === 'enter';
  const entryTitle = isEnter
    ? kind === 'passphrase'
      ? 'Create a passphrase'
      : 'Create a code'
    : 'Re-enter to confirm';
  const entryValidate = isEnter ? validateStrength : validateMatch;
  const entrySubmit = isEnter
    ? async (secret: string) => {
        setFirst(secret);
        setPhase('confirm');
        return true;
      }
    : async (secret: string) => {
        update({ symbol, passcode: secret, passcodeKind: kind });
        onNext();
        return true;
      };
  const entryCancel = () => setPhase(isEnter ? 'symbol' : 'enter');

  return (
    <WizardLayout
      step={2}
      total={6}
      title="Create a code to unlock your vault"
      subtitle={subtitle}
      onBack={onBack}
    >
      <fieldset className="mb-6">
        <legend className="mb-3 text-sm text-secondary">How do you want to unlock?</legend>
        <div className="grid grid-cols-2 gap-3">
          {KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              aria-pressed={kind === k.id}
              onClick={() => setKind(k.id)}
              className={`flex flex-col items-start gap-1 rounded-xl p-3 text-left ${
                kind === k.id ? 'bg-plum text-primary ring-2 ring-gold' : 'bg-surface text-secondary'
              }`}
            >
              <span className="font-semibold">{k.label}</span>
              <span className="text-xs opacity-80">{k.hint}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-3 text-sm text-secondary">
          Pick a symbol you’ll draw on the game to open the {kind === 'passphrase' ? 'entry' : 'keypad'}.
        </legend>
        <div className="grid grid-cols-4 gap-3">
          {SYMBOLS.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-label={s.label}
              aria-pressed={symbol === s.id}
              onClick={() => setSymbol(s.id)}
              className={`flex h-16 items-center justify-center rounded-xl text-2xl ${
                symbol === s.id ? 'bg-plum text-primary ring-2 ring-gold' : 'bg-surface text-secondary'
              }`}
            >
              {s.glyph}
            </button>
          ))}
        </div>
      </fieldset>

      <button type="button" className="btn-primary mt-8 w-full" onClick={() => setPhase('enter')}>
        {kind === 'passphrase' ? 'Set passphrase' : 'Set code'}
      </button>

      {phase !== 'symbol' &&
        (kind === 'passphrase' ? (
          <PassphraseEntry
            key={phase}
            title={entryTitle}
            submitLabel={isEnter ? 'Continue' : 'Confirm'}
            validate={entryValidate}
            onSubmit={entrySubmit}
            onCancel={entryCancel}
          />
        ) : (
          <DiscreteKeypad
            key={phase}
            title={entryTitle}
            validate={entryValidate}
            onSubmit={entrySubmit}
            onCancel={entryCancel}
          />
        ))}
    </WizardLayout>
  );
}
