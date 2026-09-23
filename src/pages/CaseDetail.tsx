import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  SafetyExit,
  TimelineView,
  EvidenceCard,
  EmptyState,
  LoadingSpinner,
  EvidenceUploadModal,
  EvidenceDetailModal,
} from '@/components';
import { useCase, useEvidence, useDeleteEvidence } from '@/data/queries';
import type { EvidenceItem } from '@/types';

// Case detail / timeline (spec 2.5).
export function CaseDetail() {
  const { caseId } = useParams();
  const { data: summary } = useCase(caseId);
  const { data: evidence, isLoading } = useEvidence(caseId);
  const deleteEvidence = useDeleteEvidence(caseId ?? '');
  const [showUpload, setShowUpload] = useState(false);
  const [selected, setSelected] = useState<EvidenceItem | null>(null);

  return (
    <div className="app-shell px-4 py-4">
      <header className="mb-4 flex items-center gap-3">
        <Link to="/vault" className="text-gold" aria-label="Back to vault">←</Link>
        <h1 className="truncate text-lg font-semibold text-primary">
          {summary?.title ?? 'Case'}
        </h1>
      </header>

      <TimelineView evidenceItems={evidence ?? []} />

      <Link
        to={`/vault/case/${caseId}/experience`}
        className="card mt-3 flex items-center justify-between gap-3 hover:bg-surface/80"
      >
        <div className="min-w-0">
          <div className="text-sm font-semibold text-primary">Your experience</div>
          <div className="text-xs text-secondary">
            Tell your story in your own words — see the patterns and what your evidence backs up.
          </div>
        </div>
        <span className="text-gold" aria-hidden="true">→</span>
      </Link>

      <Link
        to={`/vault/case/${caseId}/report`}
        className="card mt-3 flex items-center justify-between gap-3 hover:bg-surface/80"
      >
        <div className="min-w-0">
          <div className="text-sm font-semibold text-primary">Case report</div>
          <div className="text-xs text-secondary">
            A report naming the offences the behaviour may engage, with a downloadable PDF.
          </div>
        </div>
        <span className="text-gold" aria-hidden="true">→</span>
      </Link>

      <h2 className="mb-2 mt-6 text-xs uppercase tracking-wide text-secondary">
        Evidence (newest first)
      </h2>

      {isLoading ? (
        <LoadingSpinner label="Decrypting evidence…" className="justify-center py-12" />
      ) : (evidence ?? []).length === 0 ? (
        <EmptyState
          icon="📄"
          title="No evidence yet"
          description="Add the first piece of evidence to this case."
          action={
            <button type="button" className="btn-primary" onClick={() => setShowUpload(true)}>
              Add evidence
            </button>
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {(evidence ?? []).map((e) => (
            <EvidenceCard key={e.id} evidence={e} onTap={() => setSelected(e)} />
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => setShowUpload(true)}
        aria-label="Add evidence"
        className="fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-plum text-2xl text-primary shadow-lg"
      >
        +
      </button>

      {showUpload && caseId && (
        <EvidenceUploadModal caseId={caseId} onClose={() => setShowUpload(false)} />
      )}

      {selected && (
        <EvidenceDetailModal
          evidence={selected}
          onClose={() => setSelected(null)}
          onDelete={() =>
            deleteEvidence.mutate(selected.id, { onSuccess: () => setSelected(null) })
          }
        />
      )}

      <SafetyExit />
    </div>
  );
}
