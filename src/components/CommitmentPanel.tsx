import { useState } from 'react';
import type { CaseSummary, EvidenceItem } from '@/types';
import { ExportModal } from './ExportModal';
import {
  useCommitment,
  useCommitCase,
  useAnchorSolana,
  useAnchorBitcoin,
  useRefreshBitcoin,
} from '@/data/queries';

interface CommitmentPanelProps {
  summary: CaseSummary;
  evidence: EvidenceItem[];
}

function explorerUrl(sig: string, cluster?: string): string {
  const suffix = !cluster || cluster === 'mainnet-beta' ? '' : `?cluster=${cluster}`;
  return `https://explorer.solana.com/tx/${sig}${suffix}`;
}

// Commit + anchor + export controls for a case (spec 2.8 / 2.9). The Merkle
// root is a real cryptographic commitment; "Anchor to Solana" submits it
// on-chain (SPL Memo) through the prutet relay.
export function CommitmentPanel({ summary, evidence }: CommitmentPanelProps) {
  const { data: commitment } = useCommitment(summary.id);
  const commit = useCommitCase(summary.id);
  const anchor = useAnchorSolana(summary.id);
  const anchorBtc = useAnchorBitcoin(summary.id);
  const refreshBtc = useRefreshBitcoin(summary.id);
  const [showExport, setShowExport] = useState(false);

  const disabled = evidence.length === 0;
  const stale = commitment && commitment.evidenceIds.length !== evidence.length;

  return (
    <div className="card mt-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-primary">Commitment</h2>
        {commitment ? (
          <span className="text-xs font-semibold text-gold">
            {commitment.status === 'solana'
              ? `◎ ${commitment.solanaCluster ?? 'Solana'}`
              : '⏳ Committed (pending)'}
          </span>
        ) : (
          <span className="text-xs text-secondary">Not committed</span>
        )}
      </div>

      {commitment && (
        <p className="mt-1 break-all font-mono text-[10px] text-secondary">
          root {commitment.root.slice(0, 32)}…
        </p>
      )}
      {commitment?.solanaTx && (
        <a
          href={explorerUrl(commitment.solanaTx, commitment.solanaCluster)}
          target="_blank"
          rel="noreferrer"
          className="block break-all font-mono text-[10px] text-gold underline"
        >
          tx {commitment.solanaTx.slice(0, 32)}…
        </a>
      )}
      {commitment?.bitcoinStatus && (
        <p className="font-mono text-[10px] text-secondary">
          🔗 Bitcoin (OpenTimestamps):{' '}
          {commitment.bitcoinStatus === 'confirmed'
            ? `confirmed ${commitment.bitcoinAttestedAt ? new Date(commitment.bitcoinAttestedAt * 1000).toLocaleDateString() : ''}`
            : 'pending Bitcoin confirmation'}
        </p>
      )}
      {stale && <p className="mt-1 text-xs text-danger">Evidence changed — re-commit to update.</p>}
      {(anchor.isError || anchorBtc.isError) && (
        <p className="mt-1 text-xs text-danger">
          {((anchor.error ?? anchorBtc.error) as Error)?.message ?? 'Anchoring failed.'}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-lg bg-plum px-3 py-1.5 text-xs text-primary disabled:opacity-40"
          disabled={disabled || commit.isPending}
          onClick={() => commit.mutate()}
        >
          {commitment ? 'Re-commit' : 'Commit'}
        </button>
        {commitment && commitment.status !== 'solana' && (
          <button
            type="button"
            className="rounded-lg border border-gold/60 px-3 py-1.5 text-xs text-gold disabled:opacity-40"
            disabled={anchor.isPending || !!stale}
            onClick={() => anchor.mutate()}
          >
            {anchor.isPending ? 'Anchoring…' : 'Anchor to Solana'}
          </button>
        )}
        {commitment && !commitment.bitcoinOts && (
          <button
            type="button"
            className="rounded-lg border border-gold/60 px-3 py-1.5 text-xs text-gold disabled:opacity-40"
            disabled={anchorBtc.isPending || !!stale}
            onClick={() => anchorBtc.mutate()}
          >
            {anchorBtc.isPending ? 'Stamping…' : 'Anchor to Bitcoin'}
          </button>
        )}
        {commitment?.bitcoinOts && commitment.bitcoinStatus !== 'confirmed' && (
          <button
            type="button"
            className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-primary disabled:opacity-40"
            disabled={refreshBtc.isPending}
            onClick={() => refreshBtc.mutate()}
          >
            {refreshBtc.isPending ? 'Checking…' : 'Check Bitcoin'}
          </button>
        )}
        <button
          type="button"
          className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-primary disabled:opacity-40"
          disabled={disabled}
          onClick={() => setShowExport(true)}
        >
          Export
        </button>
      </div>

      {showExport && (
        <ExportModal
          summary={summary}
          evidence={evidence}
          solanaTx={commitment?.solanaTx ?? null}
          solanaCluster={commitment?.solanaCluster ?? null}
          bitcoinOts={commitment?.bitcoinOts ?? null}
          bitcoinStatus={commitment?.bitcoinStatus ?? null}
          onClose={() => setShowExport(false)}
        />
      )}
    </div>
  );
}
