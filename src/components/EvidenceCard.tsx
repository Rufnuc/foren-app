import type { EvidenceItem, EvidenceType } from '@/types';
import { SeverityBadge } from './SeverityBadge';
import { PatternTag } from './PatternTag';
import { CommitmentStatus } from './CommitmentStatus';

interface EvidenceCardProps {
  evidence: EvidenceItem;
  onTap?: () => void;
  onDelete?: () => void;
}

const ICON: Record<EvidenceType, string> = {
  message: '💬',
  screenshot: '📷',
  audio: '🎙️',
  transcript: '📝',
};

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// SCAFFOLD: presentational card (spec Part 2.5). Swipe-to-delete and the
// expansion modal are added in the vault-core slice.
export function EvidenceCard({ evidence, onTap, onDelete }: EvidenceCardProps) {
  return (
    <div className="card cursor-pointer hover:bg-surface/80" onClick={onTap}>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl" aria-hidden="true">{ICON[evidence.type]}</span>
          <div>
            <div className="text-sm text-secondary">{formatTime(evidence.timestamp)}</div>
            <div className="text-xs capitalize text-secondary">{evidence.type}</div>
          </div>
        </div>
        {onDelete && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            aria-label="Delete evidence"
            className="px-2 text-lg text-danger"
          >
            ×
          </button>
        )}
      </div>

      <p className="mb-2 line-clamp-2 text-primary">{evidence.content}</p>

      <div className="mb-2 flex items-center gap-2">
        <SeverityBadge severity={evidence.severity} />
        <CommitmentStatus status={evidence.commitmentStatus} />
      </div>

      {evidence.patternTags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {evidence.patternTags.map((tag) => (
            <PatternTag key={tag} tag={tag} />
          ))}
        </div>
      )}
    </div>
  );
}
