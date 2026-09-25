import { useEffect, useState } from 'react';
import { SectionCard, SettingRow } from './SettingsPrimitiveComponents';
import { Modal } from './Modal';
import {
  hostedBackupStatus,
  enableHostedBackup,
  syncHostedBackup,
  disableHostedBackup,
  type HostedStatus,
} from '@/lib/hostedBackup';

function ago(ms: number | null): string {
  if (!ms) return 'never';
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// Settings section for the hosted, zero-knowledge backup. Encrypted on the
// device, stored on the relay via IPFS, recoverable on any device with the
// Backup Code — no cloud account, nothing in an abuser-watched drive.
export function HostedBackupSection({ flash }: { flash: (m: string) => void }) {
  const [status, setStatus] = useState<HostedStatus>({ enabled: false, lastSyncAt: null });
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState<string | null>(null); // shown once, on enable
  const [confirmOff, setConfirmOff] = useState(false);

  const refresh = () => hostedBackupStatus().then(setStatus);
  useEffect(() => {
    void refresh();
  }, []);

  const enable = async () => {
    setBusy(true);
    try {
      setCode(await enableHostedBackup());
      await refresh();
    } catch {
      flash('Couldn’t set up backup — is the relay reachable?');
    } finally {
      setBusy(false);
    }
  };

  const sync = async () => {
    setBusy(true);
    try {
      const r = await syncHostedBackup(true);
      flash(r === 'off' ? 'Backup is off' : 'Backup up to date');
      await refresh();
    } catch {
      flash('Sync failed — try again');
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      await disableHostedBackup();
      setConfirmOff(false);
      await refresh();
      flash('Cloud backup off');
    } catch {
      flash('Couldn’t turn it off');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <SectionCard title="Cloud backup">
        {status.enabled ? (
          <>
            <SettingRow label="Cloud backup" sublabel={`On · synced ${ago(status.lastSyncAt)}`}>
              <span className="text-xs text-success">On</span>
            </SettingRow>
            <SettingRow label="Sync now" sublabel="Update the encrypted copy" onClick={busy ? undefined : sync}>
              <span className="text-xs text-gold">{busy ? '…' : 'Sync'}</span>
            </SettingRow>
            <SettingRow label="Turn off" sublabel="Delete the encrypted copy" onClick={() => setConfirmOff(true)}>
              <span className="text-xs text-danger">Off</span>
            </SettingRow>
          </>
        ) : (
          <SettingRow
            label="Set up cloud backup"
            sublabel="An encrypted copy you can restore on a new phone"
            onClick={busy ? undefined : enable}
          >
            <span className="text-xs text-gold">{busy ? '…' : 'Set up'}</span>
          </SettingRow>
        )}
      </SectionCard>

      {code && (
        <Modal
          title="Save your Backup Code"
          onClose={() => {}}
          footer={
            <button
              type="button"
              className="btn-primary w-full"
              onClick={() => {
                setCode(null);
                flash('Cloud backup on');
              }}
            >
              I’ve saved it
            </button>
          }
        >
          <div className="space-y-4">
            <p className="text-sm text-secondary">
              This is the <span className="text-primary">only</span> way to restore your backup on another device.
              Write it down and keep it somewhere safe and separate. It’s shown once and can’t be recovered.
            </p>
            <div className="rounded-lg bg-background px-4 py-4 text-center">
              <code className="select-all text-lg font-semibold tracking-widest text-gold">{code}</code>
            </div>
            <button
              type="button"
              className="btn-secondary w-full"
              onClick={() => {
                void navigator.clipboard?.writeText(code).then(() => flash('Copied'));
              }}
            >
              Copy code
            </button>
          </div>
        </Modal>
      )}

      {confirmOff && (
        <Modal
          title="Turn off cloud backup?"
          onClose={() => setConfirmOff(false)}
          footer={
            <>
              <button type="button" className="btn-secondary flex-1" onClick={() => setConfirmOff(false)}>
                Keep it
              </button>
              <button type="button" className="btn-primary flex-1" onClick={disable} disabled={busy}>
                Turn off
              </button>
            </>
          }
        >
          <p className="text-sm text-secondary">
            This deletes the encrypted copy from the relay. Your data on this device is untouched, but you won’t be
            able to restore from the cloud until you set it up again.
          </p>
        </Modal>
      )}
    </>
  );
}
