import { useEffect, useState } from 'react';
import { WizardLayout } from '../WizardLayout';
import type { StepProps } from '../types';
import {
  detectPlatform,
  isStandalone,
  canPromptInstall,
  promptInstall,
  onInstallChange,
  type Platform,
} from '@/lib/pwaInstall';

// Step 6: get the app onto the home screen. Installed, it opens full-screen from
// an ordinary-looking game icon (no browser chrome, works offline) — which is
// both better UX and better disguise. Instructions are platform-specific because
// only Chromium exposes a one-tap install; iOS is always manual.
export function AddToHomeStep({ onNext, onBack }: StepProps) {
  const [platform] = useState<Platform>(detectPlatform);
  const [installed, setInstalled] = useState(isStandalone);
  const [canPrompt, setCanPrompt] = useState(canPromptInstall);

  useEffect(() => onInstallChange(() => {
    setInstalled(isStandalone());
    setCanPrompt(canPromptInstall());
  }), []);

  const handleInstall = async () => {
    const ok = await promptInstall();
    if (ok) setInstalled(true);
  };

  return (
    <WizardLayout
      step={6}
      total={7}
      title="Add it to your Home Screen"
      subtitle="So it opens like a normal app — and looks like one."
      onBack={onBack}
    >
      <div className="flex flex-col gap-5">
        <div className="card text-sm text-secondary">
          On your Home Screen the icon looks like an ordinary puzzle game. Opening it this way is
          faster, works offline, and shows no web address — nothing hints at what’s inside.
        </div>

        {installed ? (
          <div className="card border border-success/40 text-center text-sm font-semibold text-success">
            ✓ It’s already on your Home Screen. You’re all set.
          </div>
        ) : (
          <div className="card">
            {platform === 'ios' ? (
              <ol className="list-decimal space-y-2 pl-5 text-sm text-primary">
                <li>Tap the <span className="font-semibold">Share</span> button (the square with an arrow) at the bottom of Safari.</li>
                <li>Scroll down and tap <span className="font-semibold">Add to Home Screen</span>.</li>
                <li>Tap <span className="font-semibold">Add</span> in the top corner.</li>
              </ol>
            ) : platform === 'android' ? (
              <>
                {canPrompt ? (
                  <button type="button" onClick={handleInstall} className="btn-primary w-full">
                    Add to Home Screen
                  </button>
                ) : (
                  <ol className="list-decimal space-y-2 pl-5 text-sm text-primary">
                    <li>Tap the <span className="font-semibold">⋮</span> menu in the top-right of your browser.</li>
                    <li>Tap <span className="font-semibold">Add to Home screen</span> (or <span className="font-semibold">Install app</span>).</li>
                    <li>Confirm <span className="font-semibold">Add</span>.</li>
                  </ol>
                )}
              </>
            ) : (
              <>
                {canPrompt ? (
                  <button type="button" onClick={handleInstall} className="btn-primary w-full">
                    Install app
                  </button>
                ) : (
                  <p className="text-sm text-primary">
                    In your browser’s address bar, click the <span className="font-semibold">install</span> icon
                    (a monitor with a down-arrow), then confirm.
                  </p>
                )}
              </>
            )}
          </div>
        )}

        <button type="button" onClick={onNext} className="btn-primary w-full">
          {installed ? 'Continue' : 'Done — continue'}
        </button>
        {!installed && (
          <button type="button" onClick={onNext} className="text-center text-sm text-secondary underline">
            I’ll do this later
          </button>
        )}
      </div>
    </WizardLayout>
  );
}
