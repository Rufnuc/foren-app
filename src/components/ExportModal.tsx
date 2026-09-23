import { useState } from 'react';
import { Modal } from './Modal';
import type { CaseSummary, EvidenceItem } from '@/types';
import { buildBundle, downloadJson } from '@/lib/exportBundle';
import { track } from '@/usage';

interface ExportModalProps {
  summary: CaseSummary;
  evidence: EvidenceItem[];
  solanaTx?: string | null;
  solanaCluster?: string | null;
  bitcoinOts?: string | null;
  bitcoinStatus?: string | null;
  onClose: () => void;
}

function dayInput(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

// Export the machine-verifiable JSON data bundle (spec 2.9). The human-readable
// legal report (PDF, with jurisdiction/watermark) lives on the Case report page
// — this modal is only the self-verifying evidence bundle a third party can
// recompute offline.
export function ExportModal({
  summary,
  evidence,
  solanaTx,
  solanaCluster,
  bitcoinOts,
  bitcoinStatus,
  onClose,
}: ExportModalProps) {
  const earliest = evidence.length ? Math.min(...evidence.map((e) => e.timestamp)) : Date.now();
  const [from, setFrom] = useState(dayInput(earliest));
  const [to, setTo] = useState(dayInput(Date.now()));
  const [includeProofChain, setIncludeProofChain] = useState(true);
  const [includeAnalysis, setIncludeAnalysis] = useState(true);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const generate = async () => {
    setBusy(true);
    try {
      const fromMs = new Date(from).getTime();
      const toMs = new Date(to).getTime() + 24 * 60 * 60 * 1000 - 1; // inclusive
      const inRange = evidence.filter((e) => e.timestamp >= fromMs && e.timestamp <= toMs);
      const base = `foren-${summary.title.replace(/\W+/g, '-').toLowerCase()}`;
      const bundle = await buildBundle(summary, inRange, {
        includeProofChain,
        includeAnalysis,
        solanaTx,
        solanaCluster,
        bitcoinOts,
        bitcoinStatus,
      });
      downloadJson(`${base}-bundle.json`, bundle);
      track('export_performed'); // anonymous count only — the exported bundle stays on-device
      setDone(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Export data bundle"
      onClose={onClose}
      footer={
        done ? (
          <button type="button" className="btn-primary w-full" onClick={onClose}>
            Done
          </button>
        ) : (
          <>
            <button type="button" className="btn-secondary flex-1" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn-primary flex-1" disabled={busy} onClick={generate}>
              {busy ? 'Generating…' : 'Generate'}
            </button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-xs text-secondary">
          A self-verifying JSON bundle a third party can recompute offline. For the written report,
          use “Case report”.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-secondary">From</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-xl bg-background px-3 py-2 text-sm text-primary" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-secondary">To</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-xl bg-background px-3 py-2 text-sm text-primary" />
          </label>
        </div>

        <label className="flex items-center gap-3 text-sm text-primary">
          <input type="checkbox" checked={includeProofChain} onChange={(e) => setIncludeProofChain(e.target.checked)} className="h-5 w-5 accent-plum" />
          Proof chain (Merkle + blockchain)
        </label>
        <label className="flex items-center gap-3 text-sm text-primary">
          <input type="checkbox" checked={includeAnalysis} onChange={(e) => setIncludeAnalysis(e.target.checked)} className="h-5 w-5 accent-plum" />
          AI analysis (tags, severity)
        </label>

        {done && <p className="text-sm text-success">✓ Data bundle ready — JSON downloaded.</p>}
      </div>
    </Modal>
  );
}
