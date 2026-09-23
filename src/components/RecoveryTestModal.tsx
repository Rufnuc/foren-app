import { useState } from 'react';
import { Modal } from './Modal';
import { useVaultStore } from '@/store/vaultStore';

interface RecoveryTestModalProps {
  onClose: () => void;
}

// Re-test the saved recovery method (spec 2.11 Security → Recovery). Confirms the
// secret can unwrap the data key. We can't re-display the secret — only a wrapped
// copy of the key is persisted.
export function RecoveryTestModal({ onClose }: RecoveryTestModalProps) {
  const config = useVaultStore((s) => s.config);
  const verifyRecovery = useVaultStore((s) => s.verifyRecovery);
  const [value, setValue] = useState('');
  const [status, setStatus] = useState<'idle' | 'pass' | 'fail'>('idle');

  if (!config) return null;
  const method = config.recoveryMethod;

  const check = async () => {
    // Succeeds only if the entered secret actually unwraps the data key.
    const ok = await verifyRecovery(value);
    setStatus(ok ? 'pass' : 'fail');
  };

  const label =
    method === 'words'
      ? 'Enter your 8 recovery words'
      : method === 'authenticator'
        ? 'Enter your recovery secret'
        : 'Enter your recovery code';

  return (
    <Modal
      title="Test recovery"
      onClose={onClose}
      footer={
        <button type="button" className="btn-primary w-full" onClick={check} disabled={!value.trim()}>
          Check
        </button>
      }
    >
      <label className="flex flex-col gap-2">
        <span className="text-sm text-secondary">{label}</span>
        <textarea
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setStatus('idle');
          }}
          rows={3}
          className="rounded-xl bg-background px-3 py-3 font-mono text-sm text-primary"
        />
      </label>
      <div className="mt-3 h-5 text-sm" aria-live="polite">
        {status === 'pass' && <span className="text-success">✓ Recovery verified.</span>}
        {status === 'fail' && <span className="text-danger">✗ That didn’t match.</span>}
      </div>
    </Modal>
  );
}
