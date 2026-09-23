import type { ReactNode } from 'react';

// Web Crypto (crypto.subtle) — used to hash the passcode and derive the
// encryption key — is only available in a "secure context": https:// or
// http://localhost. If the app is opened over a plain-http LAN address
// (e.g. http://192.168.x.x:5173 or from a phone), crypto.subtle is undefined
// and setup silently fails. Detect that and explain it clearly instead.
export function SecureContextGuard({ children }: { children: ReactNode }) {
  const cryptoOk = typeof crypto !== 'undefined' && !!crypto.subtle;
  if (cryptoOk) return <>{children}</>;

  const localhostUrl = `http://localhost:${window.location.port || '5173'}${window.location.pathname}`;

  return (
    <div className="app-shell items-center justify-center gap-4 px-6 py-12 text-center">
      <h1 className="text-xl font-semibold text-primary">Secure connection needed</h1>
      <p className="max-w-xs text-sm text-secondary">
        This app encrypts everything on your device, which needs a secure address.
        You’re on <span className="break-all font-mono text-gold">{window.location.origin}</span>,
        where the browser blocks encryption.
      </p>
      <p className="max-w-xs text-sm text-secondary">
        Open it on <span className="break-all font-mono text-gold">{localhostUrl}</span> instead
        (or over <strong className="text-primary">https</strong>). On another device, you’ll need an
        https address.
      </p>
      <a href={localhostUrl} className="btn-primary">Open on localhost</a>
    </div>
  );
}
