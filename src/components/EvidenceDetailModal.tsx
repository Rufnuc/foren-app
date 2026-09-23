import { useEffect, useState } from 'react';
import type { EvidenceItem } from '@/types';
import { Modal } from './Modal';
import { SeverityBadge } from './SeverityBadge';
import { PatternTag } from './PatternTag';
import { CommitmentStatus } from './CommitmentStatus';
import { LoadingSpinner } from './LoadingSpinner';
import { useVaultStore } from '@/store/vaultStore';
import { getEvidenceMedia } from '@/data/repository';

interface EvidenceDetailModalProps {
  evidence: EvidenceItem;
  onClose: () => void;
  onDelete: () => void;
}

// Evidence detail / expansion (spec 2.6). The encrypted attachment, if any, is
// decrypted on demand only when the detail view opens.
export function EvidenceDetailModal({ evidence, onClose, onDelete }: EvidenceDetailModalProps) {
  const key = useVaultStore((s) => s.encryptionKey);
  const [media, setMedia] = useState<string | null>(null);
  const [loadingMedia, setLoadingMedia] = useState(evidence.hasMedia);

  useEffect(() => {
    let alive = true;
    if (!evidence.hasMedia || !key) return;
    setLoadingMedia(true);
    getEvidenceMedia(key, evidence.id).then((m) => {
      if (alive) {
        setMedia(m);
        setLoadingMedia(false);
      }
    });
    return () => {
      alive = false;
    };
  }, [evidence.id, evidence.hasMedia, key]);

  const isAudio = evidence.mediaType?.startsWith('audio');

  return (
    <Modal
      title="Evidence"
      onClose={onClose}
      footer={
        <button type="button" className="btn-danger w-full" onClick={onDelete}>
          Delete evidence
        </button>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <SeverityBadge severity={evidence.severity} />
          <CommitmentStatus status={evidence.commitmentStatus} />
        </div>

        {evidence.hasMedia && (
          <div className="rounded-xl bg-background p-2">
            {loadingMedia ? (
              <LoadingSpinner label="Decrypting attachment…" />
            ) : media ? (
              isAudio ? (
                <audio src={media} controls className="w-full" />
              ) : (
                <img src={media} alt="evidence attachment" className="max-h-72 w-full rounded-lg object-contain" />
              )
            ) : (
              <p className="text-sm text-secondary">Attachment unavailable.</p>
            )}
          </div>
        )}

        <div className="rounded-xl bg-background p-3">
          <p className="whitespace-pre-wrap break-words text-primary">{evidence.content}</p>
        </div>

        <div className="text-xs text-secondary">
          {new Date(evidence.timestamp).toLocaleString()}
          <span className="block text-secondary/60">
            Claimed time; device clock may not be accurate.
          </span>
        </div>

        {evidence.patternTags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {evidence.patternTags.map((t) => (
              <PatternTag key={t} tag={t} />
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
