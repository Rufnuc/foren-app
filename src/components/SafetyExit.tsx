import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useVaultStore } from '@/store/vaultStore';

const TAP_WINDOW_MS = 600;

// Always-visible quick exit. A single tap locks back to the disguise. When panic
// wipe is enabled (spec 4.4), N rapid taps instead prompt a permanent wipe.
export function SafetyExit() {
  const navigate = useNavigate();
  const lock = useVaultStore((s) => s.lock);
  const resetVault = useVaultStore((s) => s.resetVault);
  const panicEnabled = useVaultStore((s) => s.config?.panicWipeEnabled ?? false);
  const sensitivity = useVaultStore((s) => s.config?.panicWipeSensitivity ?? 5);

  const taps = useRef(0);
  const timer = useRef<number | null>(null);
  const [confirmWipe, setConfirmWipe] = useState(false);

  const onTap = () => {
    if (!panicEnabled) {
      lock();
      return;
    }
    // Panic enabled: count rapid taps; lock only if the streak ends below target.
    taps.current += 1;
    if (timer.current !== null) clearTimeout(timer.current);

    if (taps.current >= sensitivity) {
      taps.current = 0;
      setConfirmWipe(true);
      return;
    }
    timer.current = window.setTimeout(() => {
      taps.current = 0;
      lock();
    }, TAP_WINDOW_MS);
  };

  const doWipe = async () => {
    await resetVault();
    navigate('/', { replace: true });
  };

  return (
    <>
      <button
        type="button"
        onClick={onTap}
        aria-label="Safety exit — lock the vault"
        className="fixed bottom-4 right-4 z-50 flex h-12 w-12 items-center justify-center
                   rounded-full bg-surface/90 text-primary shadow-lg ring-1 ring-white/10
                   backdrop-blur hover:bg-surface"
      >
        <span aria-hidden="true" className="text-xl">×</span>
      </button>

      {confirmWipe && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-6">
          <div className="card w-full max-w-app border border-danger/50 text-center">
            <p className="text-base font-semibold text-danger">⚠️ Panic wipe</p>
            <p className="mt-2 text-sm text-secondary">
              This will <strong className="text-primary">permanently delete</strong> all evidence on
              this device. You will not be able to recover it.
            </p>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                className="btn-secondary flex-1"
                onClick={() => setConfirmWipe(false)}
              >
                Cancel
              </button>
              <button type="button" className="btn-danger flex-1" onClick={doWipe}>
                Wipe &amp; close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
