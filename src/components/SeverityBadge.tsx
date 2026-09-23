import type { SeverityLabel } from '@/types';

interface SeverityBadgeProps {
  severity: SeverityLabel;
}

// Color is never the sole signal (accessibility): the label text is always shown.
const CONFIG: Record<SeverityLabel, { label: string; className: string }> = {
  critical: { label: 'Critical', className: 'bg-severity-critical/20 text-severity-critical' },
  high: { label: 'High', className: 'bg-severity-high/20 text-severity-high' },
  medium: { label: 'Medium', className: 'bg-severity-medium/20 text-severity-medium' },
  low: { label: 'Low', className: 'bg-severity-low/20 text-severity-low' },
};

export function SeverityBadge({ severity }: SeverityBadgeProps) {
  const { label, className } = CONFIG[severity];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${className}`}
    >
      {label}
    </span>
  );
}
