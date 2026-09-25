import { useRef, useState } from 'react';
import { Modal } from './Modal';
import { exportEncryptedBackup, importEncryptedBackup, type RestoreOutcome } from '@/data/repository';

// Disguise-safe filename — reads as a puzzle game's save file in Downloads.
const BACKUP_FILENAME = 'puzzle-backup.json';
const MIN_PASSWORD = 8;

function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

interface BackupModalProps {
  mode: 'export' | 'restore';
  onClose: () => void;
  /** Called after a successful restore (the caller re-initialises the app). */
  onRestored?: () => void;
}

export function BackupModal({ mode, onClose, onRestored }: BackupModalProps) {
  return mode === 'export' ? (
    <ExportForm onClose={onClose} />
  ) : (
    <RestoreForm onClose={onClose} onRestored={onRestored} />
  );
}

function ExportForm({ onClose }: { onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async () => {
    setError(null);
    if (password.length < MIN_PASSWORD) return setError(`Use at least ${MIN_PASSWORD} characters.`);
    if (password !== confirm) return setError('The two passwords don’t match.');
    setBusy(true);
    try {
      const file = await exportEncryptedBackup(password);
      downloadText(BACKUP_FILENAME, file);
      setDone(true);
    } catch {
      setError('Could not create the backup. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Export encrypted backup"
      onClose={onClose}
      footer={
        done ? (
          <button type="button" className="btn-primary w-full" onClick={onClose}>
            Done
          </button>
        ) : (
          <>
            <button type="button" className="btn-secondary flex-1" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn-primary flex-1" onClick={submit} disabled={busy}>
              {busy ? 'Encrypting…' : 'Export'}
            </button>
          </>
        )
      }
    >
      {done ? (
        <div className="space-y-3 text-sm text-secondary">
          <p className="font-semibold text-success">Backup saved to your files.</p>
          <p>
            Keep the file <span className="text-primary">and</span> this password somewhere safe and separate.
            You’ll need <span className="text-primary">both</span> to restore — there is no other way in.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-secondary">
            This saves an encrypted copy of everything, locked with a password you choose. Store the file
            somewhere safe (another device, a cloud drive). To restore it you’ll need this password — keep it
            safe, it can’t be recovered.
          </p>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">Backup password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg bg-background px-3 py-2 text-primary"
              autoComplete="new-password"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-secondary">Confirm password</span>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full rounded-lg bg-background px-3 py-2 text-primary"
              autoComplete="new-password"
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
          </label>
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      )}
    </Modal>
  );
}

const RESTORE_ERRORS: Record<Exclude<RestoreOutcome, 'restored'>, string> = {
  'bad-file': 'That doesn’t look like a valid backup file.',
  'wrong-password': 'Wrong password, or the file is corrupted.',
  error: 'Could not restore the backup. Please try again.',
};

function RestoreForm({ onClose, onRestored }: { onClose: () => void; onRestored?: () => void }) {
  const [password, setPassword] = useState('');
  const [fileText, setFileText] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const pickFile = async (file: File) => {
    setError(null);
    try {
      setFileText(await file.text());
      setFileName(file.name);
    } catch {
      setError('Could not read that file.');
    }
  };

  const submit = async () => {
    setError(null);
    if (!fileText) return setError('Choose your backup file first.');
    if (!password) return setError('Enter the backup password.');
    setBusy(true);
    try {
      const outcome = await importEncryptedBackup(fileText, password);
      if (outcome === 'restored') {
        setDone(true);
      } else {
        setError(RESTORE_ERRORS[outcome]);
      }
    } catch {
      setError(RESTORE_ERRORS.error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Restore from a backup"
      onClose={done ? () => {} : onClose}
      footer={
        done ? (
          <button type="button" className="btn-primary w-full" onClick={() => onRestored?.()}>
            Continue
          </button>
        ) : (
          <>
            <button type="button" className="btn-secondary flex-1" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn-primary flex-1" onClick={submit} disabled={busy}>
              {busy ? 'Restoring…' : 'Restore'}
            </button>
          </>
        )
      }
    >
      {done ? (
        <div className="space-y-3 text-sm text-secondary">
          <p className="font-semibold text-success">Restored.</p>
          <p>Unlock with the passcode you used on your other device.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-secondary">
            Restore an encrypted backup. This <span className="text-primary">replaces everything</span>{' '}
            currently on this device with the backup’s contents.
          </p>

          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void pickFile(f);
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-full rounded-lg border border-white/15 bg-background px-3 py-2 text-left text-sm"
          >
            <span className="text-secondary">Backup file: </span>
            <span className="text-primary">{fileName ?? 'Choose a file…'}</span>
          </button>

          <label className="block">
            <span className="mb-1 block text-xs text-secondary">Backup password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg bg-background px-3 py-2 text-primary"
              autoComplete="off"
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
          </label>
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      )}
    </Modal>
  );
}
