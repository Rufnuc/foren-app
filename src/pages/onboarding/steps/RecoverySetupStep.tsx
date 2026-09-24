import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { RecoveryMethod } from '@/types';
import { WizardLayout } from '../WizardLayout';
import type { StepProps } from '../types';
import {
  generateBase32Secret,
  otpauthUri,
  pickRecoveryWords,
} from '@/lib/recovery';

const METHODS: Array<{ id: RecoveryMethod; title: string; blurb: string; icon: string }> = [
  {
    id: 'authenticator',
    title: 'Authenticator app',
    blurb: 'Store a code in an app like Google Authenticator on another device.',
    icon: '🔐',
  },
  {
    id: 'printed',
    title: 'Printed card',
    blurb: 'Print a recovery code and keep it somewhere safe.',
    icon: '🖨️',
  },
  {
    id: 'words',
    title: 'Memory words',
    blurb: 'Write down 8 words you can use to recover your vault.',
    icon: '🧠',
  },
];

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* clipboard may be unavailable; the secret is shown on screen anyway */
  }
}

// Step 3 (spec 1.5): set up at least one recovery method and capture its secret.
export function RecoverySetupStep({ update, onNext, onBack }: StepProps) {
  const [method, setMethod] = useState<RecoveryMethod | null>(null);
  const [secret, setSecret] = useState('');
  const [words, setWords] = useState<string[]>([]);

  const choose = (m: RecoveryMethod) => {
    setMethod(m);
    if (m === 'words') {
      const w = pickRecoveryWords(8);
      setWords(w);
      setSecret(w.join(' '));
    } else {
      setSecret(generateBase32Secret());
    }
  };

  const confirm = () => {
    if (!method) return;
    update({ recovery: { method, secret } });
    onNext();
  };

  if (!method) {
    return (
      <WizardLayout
        step={3}
        total={7}
        title="Set up recovery"
        subtitle="If you lose your device, you can recover your vault with this."
        onBack={onBack}
      >
        <div className="flex flex-col gap-3">
          {METHODS.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => choose(m.id)}
              className="card flex items-center gap-4 text-left hover:bg-surface/80"
            >
              <span className="text-2xl" aria-hidden="true">{m.icon}</span>
              <span className="flex-1">
                <span className="block font-semibold text-primary">{m.title}</span>
                <span className="block text-sm text-secondary">{m.blurb}</span>
              </span>
              <span className="text-gold" aria-hidden="true">→</span>
            </button>
          ))}
        </div>
      </WizardLayout>
    );
  }

  return (
    <WizardLayout
      step={3}
      total={7}
      title={METHODS.find((m) => m.id === method)!.title}
      subtitle="Save this now — you’ll confirm it on the next step."
      onBack={() => setMethod(null)}
    >
      {method === 'authenticator' && (
        <div className="flex flex-col items-center gap-4">
          <div className="rounded-xl bg-white p-3">
            <QRCodeSVG value={otpauthUri(secret)} size={160} />
          </div>
          <SecretBox value={secret} />
          <a href={otpauthUri(secret)} className="btn-secondary w-full text-center">
            Open in authenticator app
          </a>
        </div>
      )}

      {method === 'printed' && (
        <div className="flex flex-col gap-4">
          <div className="card border border-gold/40 text-center">
            <p className="text-xs uppercase tracking-widest text-gold">Foren Vault</p>
            <p className="text-xs uppercase tracking-widest text-secondary">Recovery Code Card</p>
            <p className="my-4 break-all font-mono text-lg text-primary">{secret}</p>
            <p className="text-xs text-secondary">Keep this somewhere safe. Don’t share it.</p>
          </div>
          <SecretBox value={secret} />
          <button type="button" className="btn-secondary w-full" onClick={() => window.print()}>
            Print
          </button>
        </div>
      )}

      {method === 'words' && (
        <div className="flex flex-col gap-4">
          <ol className="grid grid-cols-2 gap-2">
            {words.map((w, i) => (
              <li key={i} className="card flex items-center gap-2 py-2">
                <span className="w-5 text-right text-xs text-secondary">{i + 1}.</span>
                <span className="font-mono text-base uppercase text-primary">{w}</span>
              </li>
            ))}
          </ol>
          <div className="flex gap-3">
            <button type="button" className="btn-secondary flex-1" onClick={() => copy(secret)}>
              Copy all
            </button>
            <button
              type="button"
              className="btn-secondary flex-1"
              onClick={() => {
                const w = pickRecoveryWords(8);
                setWords(w);
                setSecret(w.join(' '));
              }}
            >
              Different words
            </button>
          </div>
        </div>
      )}

      <button type="button" className="btn-primary mt-8 w-full" onClick={confirm}>
        I’ve saved it — continue
      </button>
    </WizardLayout>
  );
}

function SecretBox({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="w-full">
      <div className="break-all rounded-xl bg-background p-3 font-mono text-sm text-primary">
        {value}
      </div>
      <button
        type="button"
        className="btn-secondary mt-2 w-full"
        onClick={async () => {
          await copy(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? '✓ Copied' : 'Copy to clipboard'}
      </button>
    </div>
  );
}
