import type { ReactNode } from 'react';

export function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gold">{title}</h2>
      <div className="flex flex-col divide-y divide-white/5">{children}</div>
    </section>
  );
}

interface SettingRowProps {
  label: string;
  sublabel?: string;
  children?: ReactNode; // trailing control
  onClick?: () => void;
}

export function SettingRow({ label, sublabel, children, onClick }: SettingRowProps) {
  const content = (
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <div className="text-sm text-primary">{label}</div>
        {sublabel && <div className="text-xs text-secondary">{sublabel}</div>}
      </div>
      {children}
    </div>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="w-full text-left">
        {content}
      </button>
    );
  }
  return content;
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="h-5 w-5 accent-plum"
    />
  );
}
