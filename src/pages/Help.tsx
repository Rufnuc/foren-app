import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CrisisBanner, SafetyExit, SectionCard } from '@/components';

const DEVICE_TIPS = [
  'Check for spyware/stalkerware: look for unfamiliar apps.',
  'Unknown devices: ask who owns other phones or tablets nearby.',
  'Shared WiFi: others on the network may see your traffic.',
  'Always use a screen lock code (avoid biometrics if you may be forced).',
];

const APP_TIPS = [
  'The decoy game is real — play it if someone is watching.',
  'Never write down your passcode.',
  'Use a duress code if you feel unsafe.',
  'Back up your recovery secret somewhere safe.',
];

const FAQ: Array<{ q: string; a: string }> = [
  { q: 'Can someone see this app?', a: 'Yes — it looks like a normal game. Your vault is hidden behind a code only you know.' },
  { q: 'What if I forget my passcode?', a: 'You can recover using the backup secret you saved during setup.' },
  { q: 'Is my evidence really encrypted?', a: 'Yes — on your device, with AES-256-GCM. The key is derived from your passcode and never leaves the device.' },
  { q: 'Can Foren see my evidence?', a: 'No. Encryption keys stay on your device. We cannot read your data even if asked.' },
  { q: 'What if someone steals my phone?', a: 'Without the passcode they cannot unlock the vault — they only see the game.' },
];

// Help & Safety (spec 2.12).
export function Help() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div className="app-shell px-4 py-4">
      <header className="mb-4 flex items-center gap-3">
        <Link to="/vault" className="text-gold" aria-label="Back to vault">←</Link>
        <h1 className="text-lg font-semibold text-primary">Help &amp; Safety</h1>
      </header>

      <div className="flex flex-col gap-4">
        {/* Crisis support — large, immediate */}
        <a href="tel:999" className="btn-danger w-full text-center text-lg">
          Call 999 — immediate danger
        </a>
        <CrisisBanner />
        <p className="px-1 text-xs text-secondary">
          Domestic abuse, silent call? Dial 999, then press 55 (Silent Solution).
        </p>

        <SectionCard title="Device safety">
          <ul className="list-disc space-y-2 py-1 pl-5 text-sm text-secondary">
            {DEVICE_TIPS.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard title="Using this app">
          <ul className="list-disc space-y-2 py-1 pl-5 text-sm text-secondary">
            {APP_TIPS.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard title="FAQ">
          <div className="flex flex-col divide-y divide-white/5">
            {FAQ.map((item, i) => (
              <div key={item.q} className="py-1">
                <button
                  type="button"
                  onClick={() => setOpen(open === i ? null : i)}
                  aria-expanded={open === i}
                  className="flex w-full items-center justify-between gap-3 py-2 text-left"
                >
                  <span className="text-sm text-primary">{item.q}</span>
                  <span className="text-gold" aria-hidden="true">{open === i ? '−' : '+'}</span>
                </button>
                {open === i && <p className="pb-2 text-sm text-secondary">{item.a}</p>}
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <SafetyExit />
    </div>
  );
}
