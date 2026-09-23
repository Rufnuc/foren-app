import { useState } from 'react';
import { DiscreteKeypad } from './DiscreteKeypad';
import { PassphraseEntry } from './PassphraseEntry';
import { useVaultStore } from '@/store/vaultStore';
import { checkPasscodeStrength } from '@/lib/crypto';

interface ChangePasscodeModalProps {
  onClose: () => void;
  onChanged: () => void;
}

type Phase = 'old' | 'new' | 'confirm';

// Change passcode (spec 2.11 Security). Verifies the current secret by unwrapping
// the data key, then re-wraps the SAME key under the new secret — instant, and
// existing evidence stays readable without re-encryption. Uses whichever entry
// style (PIN keypad or passphrase) the vault was set up with.
export function ChangePasscodeModal({ onClose, onChanged }: ChangePasscodeModalProps) {
  const config = useVaultStore((s) => s.config);
  const verifySecret = useVaultStore((s) => s.verifySecret);
  const changePasscode = useVaultStore((s) => s.changePasscode);
  const [phase, setPhase] = useState<Phase>('old');
  const [oldCode, setOldCode] = useState('');
  const [newCode, setNewCode] = useState('');

  const kind = config?.passcodeKind ?? 'pin';
  const noun = kind === 'passphrase' ? 'passphrase' : 'code';

  let title: string;
  let validate: ((s: string) => string | null) | undefined;
  let onSubmit: (secret: string) => Promise<boolean>;

  if (phase === 'old') {
    title = `Enter current ${noun}`;
    onSubmit = async (secret) => {
      const ok = await verifySecret(secret);
      if (ok) {
        setOldCode(secret);
        setPhase('new');
      }
      return ok;
    };
  } else if (phase === 'new') {
    title = `Enter new ${noun}`;
    validate = (s) => checkPasscodeStrength(s, kind).reason ?? null;
    onSubmit = async (secret) => {
      setNewCode(secret);
      setPhase('confirm');
      return true;
    };
  } else {
    title = `Confirm new ${noun}`;
    validate = (s) => (s === newCode ? null : `${noun[0].toUpperCase() + noun.slice(1)}s don’t match — try again`);
    onSubmit = async (secret) => {
      const ok = await changePasscode(oldCode, secret, kind);
      if (ok) onChanged();
      return ok;
    };
  }

  return kind === 'passphrase' ? (
    <PassphraseEntry
      key={phase}
      title={title}
      submitLabel={phase === 'confirm' ? 'Confirm' : 'Continue'}
      validate={validate}
      onSubmit={onSubmit}
      onCancel={onClose}
    />
  ) : (
    <DiscreteKeypad key={phase} title={title} validate={validate} onSubmit={onSubmit} onCancel={onClose} />
  );
}
