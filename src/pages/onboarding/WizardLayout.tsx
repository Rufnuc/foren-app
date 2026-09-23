import type { ReactNode } from 'react';

interface WizardLayoutProps {
  step: number; // 1-based
  total: number;
  title: string;
  subtitle?: string;
  onBack?: () => void;
  children: ReactNode;
}

export function WizardLayout({
  step,
  total,
  title,
  subtitle,
  onBack,
  children,
}: WizardLayoutProps) {
  return (
    <div className="app-shell px-6 py-6">
      <div className="mb-6">
        <div className="mb-3 flex items-center gap-3">
          {onBack && (
            <button type="button" onClick={onBack} className="text-gold" aria-label="Back">
              ←
            </button>
          )}
          <span className="text-xs uppercase tracking-wide text-secondary">
            Step {step} of {total}
          </span>
        </div>
        {/* progress bar */}
        <div className="flex gap-1" aria-hidden="true">
          {Array.from({ length: total }).map((_, i) => (
            <span
              key={i}
              className={`h-1 flex-1 rounded-full ${i < step ? 'bg-gold' : 'bg-surface'}`}
            />
          ))}
        </div>
        <h1 className="mt-5 text-2xl font-semibold text-primary">{title}</h1>
        {subtitle && <p className="mt-2 text-sm text-secondary">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}
