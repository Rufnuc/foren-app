import { useRef, useState } from 'react';
import type { CaseSummary } from '@/types';
import { SeverityBadge } from './SeverityBadge';

interface CaseCardProps {
  summary: CaseSummary;
  onOpen: () => void;
  onDelete: () => void;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const REVEAL = 88; // px the card slides to expose Delete

// Case card with swipe-left-to-delete (spec 2.3). A persistent Delete affordance
// sits behind the card; swiping or tapping the handle reveals it. Keyboard users
// get the same action via the revealed button.
export function CaseCard({ summary, onOpen, onDelete }: CaseCardProps) {
  const [revealed, setRevealed] = useState(false);
  const startX = useRef<number | null>(null);

  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (startX.current === null) return;
    const dx = e.changedTouches[0].clientX - startX.current;
    startX.current = null;
    if (dx < -30) setRevealed(true);
    else if (dx > 30) setRevealed(false);
  };

  return (
    <div className="relative overflow-hidden rounded-2xl">
      {/* delete layer */}
      <div className="absolute inset-y-0 right-0 flex w-[88px] items-center justify-center bg-danger">
        <button type="button" onClick={onDelete} className="text-sm font-semibold text-primary">
          Delete
        </button>
      </div>

      {/* foreground card */}
      <div
        className="card relative flex items-center gap-3 transition-transform"
        style={{ transform: revealed ? `translateX(-${REVEAL}px)` : 'translateX(0)' }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <button type="button" onClick={onOpen} className="flex-1 text-left">
          <div className="font-semibold text-primary">{summary.title || 'Untitled case'}</div>
          <div className="mt-1 flex items-center gap-2 text-xs text-secondary">
            <span>Created {formatDate(summary.createdAt)}</span>
            <span>·</span>
            <span>{summary.evidenceCount} item{summary.evidenceCount === 1 ? '' : 's'}</span>
          </div>
        </button>
        <SeverityBadge severity={summary.severityMax} />
        <button
          type="button"
          aria-label={revealed ? 'Hide delete' : 'Show delete'}
          onClick={() => setRevealed((r) => !r)}
          className="px-1 text-secondary"
        >
          ⋯
        </button>
      </div>
    </div>
  );
}
