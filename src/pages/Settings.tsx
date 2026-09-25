import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  SafetyExit,
  SectionCard,
  SettingRow,
  Toggle,
  ChangePasscodeModal,
  RecoveryTestModal,
  BackupModal,
  HostedBackupSection,
  HelpAFriendSection,
  DiscreteKeypad,
  PassphraseEntry,
  CrisisBanner,
} from '@/components';
import { useVaultStore } from '@/store/vaultStore';
import { useCases, useRestoreCase, usePurgeCase } from '@/data/queries';
import { storageUsage, recoveryDeadline } from '@/data/repository';
import { biometricAvailable } from '@/lib/biometric';
import type { DuressState } from '@/types';

const RECOVERY_LABEL = {
  authenticator: 'Authenticator app',
  printed: 'Printed card',
  words: 'Memory words',
} as const;

function formatBytes(n: number): string {
  if (n <= 0) return '0 KB';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  return `${(n / 1024 ** i).toFixed(1)} ${units[i]}`;
}

// Settings (spec 2.11).
export function Settings() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const config = useVaultStore((s) => s.config);
  const setDuress = useVaultStore((s) => s.setDuress);
  const setDuressState = useVaultStore((s) => s.setDuressState);
  const disableDuress = useVaultStore((s) => s.disableDuress);
  const setPanicWipe = useVaultStore((s) => s.setPanicWipe);
  const resetVault = useVaultStore((s) => s.resetVault);
  const verifySecret = useVaultStore((s) => s.verifySecret);
  const enableBiometric = useVaultStore((s) => s.enableBiometric);
  const disableBiometric = useVaultStore((s) => s.disableBiometric);
  const duressMode = useVaultStore((s) => s.duressMode);

  const { data: deleted } = useCases(true);
  const restore = useRestoreCase();
  const purge = usePurgeCase();

  const [showChangePass, setShowChangePass] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);
  const [backupMode, setBackupMode] = useState<null | 'export' | 'restore'>(null);
  const [duressKeypad, setDuressKeypad] = useState(false);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioPrompt, setBioPrompt] = useState(false);
  const [storage, setStorage] = useState({ usedBytes: 0, quotaBytes: 0 });
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    storageUsage().then(setStorage);
    biometricAvailable().then(setBioAvailable);
  }, []);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  };

  if (!config) return null;
  // Never expose settings (which would reveal duress is configured) in the decoy.
  if (duressMode) return <Navigate to="/vault" replace />;

  const duressValidate = async (code: string) => {
    if (/^(\d)\1*$/.test(code)) return 'Code can’t be all the same digit';
    if (await verifySecret(code)) {
      return 'Must differ from your unlock code';
    }
    return null;
  };

  return (
    <div className="app-shell px-4 py-4">
      <header className="mb-4 flex items-center gap-3">
        <Link to="/vault" className="text-gold" aria-label="Back to vault">←</Link>
        <h1 className="text-lg font-semibold text-primary">Settings</h1>
      </header>

      <div className="flex flex-col gap-4">
        {/* SECURITY */}
        <SectionCard title="Security">
          <SettingRow label="Change passcode" sublabel="Set a new unlock code" onClick={() => setShowChangePass(true)}>
            <span className="text-gold">→</span>
          </SettingRow>
          {bioAvailable && (
            <SettingRow label="Face ID / fingerprint" sublabel={config.biometricEnabled ? 'Enabled' : 'Off'}>
              <Toggle
                label="Biometric unlock"
                checked={!!config.biometricEnabled}
                onChange={(v) => {
                  if (v) setBioPrompt(true);
                  else {
                    void disableBiometric();
                    flash('Biometric unlock off');
                  }
                }}
              />
            </SettingRow>
          )}
          <SettingRow label="Duress protection" sublabel={config.duressEnabled ? 'Enabled' : 'Off'}>
            <Toggle
              label="Duress protection"
              checked={config.duressEnabled}
              onChange={(v) => (v ? setDuressKeypad(true) : disableDuress())}
            />
          </SettingRow>
          {config.duressEnabled && (
            <SettingRow label="When duress code is used">
              <select
                value={config.duressState}
                onChange={(e) => setDuressState(e.target.value as DuressState)}
                className="rounded-lg bg-background px-2 py-1 text-xs text-primary"
              >
                <option value="return-to-game">Return to game</option>
                <option value="empty-vault">Empty vault</option>
              </select>
            </SettingRow>
          )}
          <SettingRow label="Recovery" sublabel={RECOVERY_LABEL[config.recoveryMethod]} onClick={() => setShowRecovery(true)}>
            <span className="text-xs text-gold">Test</span>
          </SettingRow>
        </SectionCard>

        {/* PRIVACY */}
        <SectionCard title="Privacy">
          <SettingRow label="Notifications" sublabel="Always disabled for safety">
            <span className="text-xs text-secondary">Disabled</span>
          </SettingRow>
          <SettingRow
            label="Encrypted backup"
            sublabel="Export a password-locked copy of everything"
            onClick={() => setBackupMode('export')}
          >
            <span className="text-xs text-gold">Export</span>
          </SettingRow>
          <SettingRow
            label="Restore from backup"
            sublabel="Replace this device’s data with a backup"
            onClick={() => setBackupMode('restore')}
          >
            <span className="text-xs text-gold">Restore</span>
          </SettingRow>
          <SettingRow label="Panic wipe" sublabel="Rapid Safety-Exit taps wipe the device">
            <Toggle
              label="Panic wipe"
              checked={config.panicWipeEnabled}
              onChange={(v) => setPanicWipe(v)}
            />
          </SettingRow>
          {config.panicWipeEnabled && (
            <SettingRow label="Wipe after" sublabel="rapid taps">
              <input
                type="number"
                min={3}
                max={10}
                value={config.panicWipeSensitivity}
                onChange={(e) => setPanicWipe(true, Number(e.target.value))}
                className="w-16 rounded-lg bg-background px-2 py-1 text-center text-primary"
              />
            </SettingRow>
          )}
        </SectionCard>

        <HostedBackupSection flash={flash} />

        <HelpAFriendSection flash={flash} />

        {/* DATA */}
        <SectionCard title="Data">
          <SettingRow label="Soft-delete window">
            <span className="text-xs text-secondary">14 days</span>
          </SettingRow>
          {(deleted ?? []).length > 0 && (
            <div className="py-2">
              <div className="mb-2 text-xs text-secondary">Recently deleted</div>
              <div className="flex flex-col gap-2">
                {(deleted ?? []).map((c) => (
                  <div key={c.id} className="rounded-lg bg-background p-3">
                    <div className="text-sm text-primary">{c.title}</div>
                    <div className="mb-2 text-xs text-secondary">
                      Recoverable until{' '}
                      {new Date(recoveryDeadline(c.deletedAt!)).toLocaleDateString()}
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="rounded-md bg-plum px-3 py-1 text-xs text-primary"
                        onClick={() => restore.mutate(c.id)}
                      >
                        Restore
                      </button>
                      <button
                        type="button"
                        className="rounded-md bg-danger px-3 py-1 text-xs text-primary"
                        onClick={() => {
                          if (confirm('Permanently delete this case? This cannot be undone.')) {
                            purge.mutate(c.id);
                          }
                        }}
                      >
                        Delete forever
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <SettingRow label="Storage used" sublabel={storage.quotaBytes ? `of ${formatBytes(storage.quotaBytes)} available` : undefined}>
            <span className="text-xs text-secondary">{formatBytes(storage.usedBytes)}</span>
          </SettingRow>
          <SettingRow
            label="Clear offline cache"
            sublabel="Safe — re-fetches on next unlock"
            onClick={() => {
              qc.clear();
              flash('Cache cleared');
            }}
          >
            <span className="text-xs text-gold">Clear</span>
          </SettingRow>
        </SectionCard>

        {/* ABOUT */}
        <SectionCard title="About">
          <SettingRow label="App version"><span className="text-xs text-secondary">v1.0.0</span></SettingRow>
          <SettingRow label="Model version"><span className="text-xs text-secondary">TRE-1 v0.1.0</span></SettingRow>
          <SettingRow
            label="Legal"
            sublabel="Privacy, Terms, Licence & more"
            onClick={() => navigate('/vault/legal')}
          >
            <span className="text-gold">→</span>
          </SettingRow>
        </SectionCard>

        <CrisisBanner />

        {/* DANGER */}
        <SectionCard title="Danger zone">
          <SettingRow
            label="Delete vault"
            sublabel="Permanently erase everything on this device"
            onClick={async () => {
              if (confirm('This will permanently delete ALL evidence. This cannot be undone.')) {
                await resetVault();
                navigate('/', { replace: true });
              }
            }}
          >
            <span className="text-xs text-danger">Erase</span>
          </SettingRow>
        </SectionCard>
      </div>

      {toast && (
        <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full bg-plum px-4 py-2 text-sm text-primary shadow-lg">
          {toast}
        </div>
      )}

      {showChangePass && (
        <ChangePasscodeModal
          onClose={() => setShowChangePass(false)}
          onChanged={() => {
            setShowChangePass(false);
            flash('Passcode changed');
          }}
        />
      )}

      {showRecovery && <RecoveryTestModal onClose={() => setShowRecovery(false)} />}

      {backupMode && (
        <BackupModal
          mode={backupMode}
          onClose={() => setBackupMode(null)}
          onRestored={() => window.location.reload()}
        />
      )}

      {duressKeypad && (
        <DiscreteKeypad
          title="Set duress code"
          validate={duressValidate}
          onCancel={() => setDuressKeypad(false)}
          onSubmit={async (code) => {
            await setDuress(code, config.duressState);
            setDuressKeypad(false);
            flash('Duress code set');
            return true;
          }}
        />
      )}

      {bioPrompt &&
        (config.passcodeKind === 'passphrase' ? (
          <PassphraseEntry
            title="Enter your passphrase to enable Face ID"
            submitLabel="Enable"
            onCancel={() => setBioPrompt(false)}
            onSubmit={async (secret) => {
              const ok = await enableBiometric(secret);
              if (ok) {
                setBioPrompt(false);
                flash('Biometric unlock on');
              }
              return ok;
            }}
          />
        ) : (
          <DiscreteKeypad
            title="Enter your code to enable Face ID"
            onCancel={() => setBioPrompt(false)}
            onSubmit={async (secret) => {
              const ok = await enableBiometric(secret);
              if (ok) {
                setBioPrompt(false);
                flash('Biometric unlock on');
              }
              return ok;
            }}
          />
        ))}

      <SafetyExit />
    </div>
  );
}
