import type { EvidenceItem } from '@/types';

interface TimelineViewProps {
  evidenceItems: EvidenceItem[];
}

// SCAFFOLD STUB — see spec Part 2.5.
// Renders a minimal severity-over-time sparkline. The vault-core slice will
// add axes, labels, and tap-to-jump interactions.
export function TimelineView({ evidenceItems }: TimelineViewProps) {
  if (evidenceItems.length === 0) {
    return <div className="card text-center text-sm text-secondary">No evidence to chart yet.</div>;
  }

  const sorted = [...evidenceItems].sort((a, b) => a.timestamp - b.timestamp);
  const W = 320;
  const H = 80;
  const step = sorted.length > 1 ? W / (sorted.length - 1) : 0;
  const points = sorted
    .map((e, i) => `${i * step},${H - (e.severityNumeric / 4) * (H - 8) - 4}`)
    .join(' ');

  return (
    <div className="card">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-20 w-full" role="img" aria-label="Severity over time">
        <polyline points={points} fill="none" stroke="#E8B96D" strokeWidth="2" />
        {sorted.map((e, i) => (
          <circle key={e.id} cx={i * step} cy={H - (e.severityNumeric / 4) * (H - 8) - 4} r="3" fill="#E8B96D" />
        ))}
      </svg>
    </div>
  );
}
