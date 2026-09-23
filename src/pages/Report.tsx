import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { SafetyExit, LoadingSpinner, SeverityBadge } from '@/components';
import { useCase, useEvidence, useAccount, useCommitment, useRefreshBitcoin } from '@/data/queries';
import { buildReport, reportToPdf, type CaseReport } from '@/lib/report';
import { buildBundle, downloadBlob, downloadJson } from '@/lib/exportBundle';
import { buildEvidenceZkProof } from '@/lib/zkProver';
import { track } from '@/usage';
import { JURISDICTION_LIST, DEFAULT_JURISDICTION, type JurisdictionId } from '@/legal/offences';

// Case report (spec: legally-framed report generation). Assembles the account,
// evidence and pattern analysis with the legal knowledge base for the chosen
// jurisdiction, previews it on-screen, and exports a PDF. An optional watermark
// and a blockchain-derived provenance hash (embedded in the PDF metadata) are
// controlled here.
export function Report() {
  const { caseId } = useParams();
  const { data: summary, isLoading } = useCase(caseId);
  const { data: evidence } = useEvidence(caseId);
  const { data: account } = useAccount(caseId);
  const { data: commitment } = useCommitment(caseId);
  const refreshBtc = useRefreshBitcoin(caseId ?? '');

  // Auto-upgrade a pending Bitcoin (OpenTimestamps) proof once when the report is
  // opened — confirmation lands hours after stamping, so this is the automatic
  // replacement for the old manual "Check Bitcoin" button.
  const btcChecked = useRef(false);
  useEffect(() => {
    if (!btcChecked.current && commitment?.bitcoinOts && commitment.bitcoinStatus !== 'confirmed') {
      btcChecked.current = true;
      refreshBtc.mutate();
    }
  }, [commitment, refreshBtc]);

  const [jurisdiction, setJurisdiction] = useState<JurisdictionId>(DEFAULT_JURISDICTION);
  const [watermark, setWatermark] = useState(false);
  const [report, setReport] = useState<CaseReport | null>(null);
  const [building, setBuilding] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [includeZk, setIncludeZk] = useState(false);
  const [privateExport, setPrivateExport] = useState(false);
  const [zkStatus, setZkStatus] = useState<string | null>(null);
  // Chronology + evidence are kept out of the report body by default and opened
  // from the gear beside the title — so the report reads as the account + legal
  // summary, with the raw detail tucked away until you choose to show it.
  const [showDetails, setShowDetails] = useState(false);

  // A ZK proof needs the case anchored on Solana (we prove the anchor slot is in
  // a disclosed range). Available only once the root has a slot.
  const canZk = !!commitment?.root && typeof commitment?.solanaSlot === 'number';

  useEffect(() => {
    if (!summary || evidence === undefined) return;
    let cancelled = false;
    setBuilding(true);
    void buildReport(summary, evidence, account ?? null, {
      jurisdiction,
      includeLegal: true,
      solanaTx: commitment?.solanaTx,
      solanaCluster: commitment?.solanaCluster,
      bitcoinStatus: commitment?.bitcoinStatus,
    }).then((r) => {
      if (!cancelled) {
        setReport(r);
        setBuilding(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [summary, evidence, account, commitment, jurisdiction]);

  const download = async () => {
    if (!report) return;
    setDownloading(true);
    try {
      const base = `foren-${report.case.title.replace(/\W+/g, '-').toLowerCase()}`;
      downloadBlob(`${base}-report.pdf`, await reportToPdf(report, { watermark }));
    } finally {
      setDownloading(false);
    }
  };

  // The machine-verifiable JSON companion (evidence + proof chain), moved here
  // now that the case screen no longer shows a commitment panel.
  const downloadDataBundle = async () => {
    if (!summary || !evidence) return;
    setDownloading(true);
    try {
      const base = `foren-${summary.title.replace(/\W+/g, '-').toLowerCase()}`;

      // Optionally generate the zero-knowledge proof on-device (private witness
      // never leaves the browser). Best-effort: if it fails, the bundle still
      // exports without it.
      let zkProof = undefined;
      if (includeZk && canZk) {
        setZkStatus('Generating zero-knowledge proof on your device…');
        try {
          zkProof = await buildEvidenceZkProof(commitment!.root, commitment!.solanaSlot!);
        } catch {
          setZkStatus('Could not generate the proof — exporting without it.');
        }
      }

      const bundle = await buildBundle(summary, evidence, {
        includeProofChain: true,
        includeAnalysis: true,
        solanaTx: commitment?.solanaTx,
        solanaCluster: commitment?.solanaCluster,
        solanaProgram: commitment?.solanaProgram,
        solanaRecordPda: commitment?.solanaRecordPda,
        bitcoinOts: commitment?.bitcoinOts,
        bitcoinStatus: commitment?.bitcoinStatus,
        zkProof,
        privateExport,
      });
      const suffix = privateExport ? '-private' : '';
      downloadJson(`${base}-bundle${suffix}.json`, bundle);
      track('export_performed'); // anonymous count only — the exported bundle stays on-device
      setZkStatus(null);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="app-shell px-4 py-4">
      <header className="mb-4 flex items-center gap-3">
        <Link to={`/vault/case/${caseId}`} className="text-gold" aria-label="Back to case">←</Link>
        <h1 className="flex-1 truncate text-lg font-semibold text-primary">Case report</h1>
        {report && (
          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            aria-label={showDetails ? 'Hide chronology and evidence' : 'Show chronology and evidence'}
            aria-pressed={showDetails}
            title="Chronology & evidence"
            className={`shrink-0 rounded-lg p-1.5 transition-colors ${showDetails ? 'bg-gold/15 text-gold' : 'text-secondary hover:text-primary'}`}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        )}
      </header>

      {isLoading ? (
        <LoadingSpinner label="Decrypting…" className="justify-center py-12" />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="card flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-sm text-secondary">Jurisdiction</span>
              <select
                value={jurisdiction}
                onChange={(e) => setJurisdiction(e.target.value as JurisdictionId)}
                className="rounded-xl bg-background px-3 py-2 text-primary"
              >
                {JURISDICTION_LIST.map((j) => (
                  <option key={j.id} value={j.id}>{j.name}</option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-3 text-sm text-primary">
              <input
                type="checkbox"
                checked={watermark}
                onChange={(e) => setWatermark(e.target.checked)}
                className="h-5 w-5 accent-plum"
              />
              Foren watermark on the PDF
            </label>

            <label
              className={`flex items-start gap-3 text-sm ${canZk ? 'text-primary' : 'text-secondary/50'}`}
            >
              <input
                type="checkbox"
                checked={includeZk && canZk}
                disabled={!canZk}
                onChange={(e) => setIncludeZk(e.target.checked)}
                className="mt-0.5 h-5 w-5 accent-plum"
              />
              <span>
                Include a zero-knowledge proof
                <span className="block text-xs text-secondary/80">
                  {canZk
                    ? 'Proves this evidence was anchored on Solana within a time window — generated on your device, without revealing the exact anchor.'
                    : 'Available once the case is anchored on Solana.'}
                </span>
              </span>
            </label>

            <label className="flex items-start gap-3 text-sm text-primary">
              <input
                type="checkbox"
                checked={privateExport}
                onChange={(e) => setPrivateExport(e.target.checked)}
                className="mt-0.5 h-5 w-5 accent-plum"
              />
              <span>
                Private export
                <span className="block text-xs text-secondary/80">
                  Leaves out the exact Solana anchor, so the precise anchoring time can’t be read from the
                  file. The Bitcoin timestamp
                  {canZk ? ' and any zero-knowledge proof' : ''} still prove the evidence existed.
                </span>
              </span>
            </label>

            <button type="button" className="btn-primary w-full" onClick={download} disabled={!report || downloading}>
              {downloading ? 'Preparing PDF…' : 'Download PDF'}
            </button>
            <button type="button" className="btn-secondary w-full" onClick={downloadDataBundle} disabled={!report || downloading}>
              {downloading && zkStatus ? 'Generating proof…' : 'Download data bundle (JSON)'}
            </button>
            {zkStatus && <p className="text-xs text-secondary">{zkStatus}</p>}
            <p className="text-xs text-secondary/70">
              The PDF embeds a provenance hash (the evidence Merkle root and any blockchain anchor) in its
              document properties — not shown on the page.
            </p>
          </div>

          {building && !report ? (
            <LoadingSpinner label="Building report…" className="justify-center py-12" />
          ) : report ? (
            <ReportView report={report} watermark={watermark} showDetails={showDetails} />
          ) : null}
        </div>
      )}

      <SafetyExit />
    </div>
  );
}

function ReportView({
  report,
  watermark,
  showDetails,
}: {
  report: CaseReport;
  watermark: boolean;
  showDetails: boolean;
}) {
  const answered = report.account?.promptAnswers.filter((a) => a.answer.trim()) ?? [];
  const hasAccount = !!report.account && (answered.length > 0 || !!report.account.narrative.trim());

  return (
    <div className="relative overflow-hidden rounded-2xl">
      {watermark && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center select-none">
          <span className="rotate-[-35deg] text-[80px] font-bold text-plum/10">FOREN</span>
        </div>
      )}

      <div className="relative flex flex-col gap-5">
        {hasAccount && (
          <section className="flex flex-col gap-2">
            <h2 className="text-xs uppercase tracking-wide text-secondary">The account</h2>
            <div className="card flex flex-col gap-3 text-sm">
              {answered.map((a) => (
                <div key={a.promptId}>
                  <div className="font-medium text-primary">{a.question}</div>
                  <div className="text-secondary">{a.answer}</div>
                </div>
              ))}
              {report.account?.narrative.trim() && (
                <div>
                  <div className="font-medium text-primary">In their own words</div>
                  <div className="text-secondary">{report.account.narrative}</div>
                </div>
              )}
            </div>
          </section>
        )}

        {report.patterns.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="text-xs uppercase tracking-wide text-secondary">Patterns and the law</h2>
            {report.patterns.map((p) => (
              <div key={p.tag} className="card flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-primary">{p.label}</span>
                  <SeverityBadge severity={p.severity} />
                </div>
                {p.accountQuotes.slice(0, 3).map((q, i) => (
                  <blockquote key={i} className="border-l-2 border-plum pl-2 text-sm text-secondary">“{q.text}”</blockquote>
                ))}
                <div className="text-xs text-secondary">
                  {p.evidence.length
                    ? `Supporting evidence: ${p.evidence.length} item${p.evidence.length > 1 ? 's' : ''}.`
                    : 'No saved evidence yet supports this pattern.'}
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-primary">Offences that may be relevant</span>
                  {p.offences.map((o) => (
                    <div key={o.statute + o.title} className="text-xs text-secondary">
                      <span className="text-primary">{o.title}</span> — {o.statute}
                      <div className="text-secondary/80">{o.summary}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>
        )}

        {showDetails && report.timeline.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="text-xs uppercase tracking-wide text-secondary">Chronology</h2>
            <div className="card flex flex-col gap-2 text-sm">
              {report.timeline.map((t, i) => (
                <div key={i}>
                  <div className="text-xs text-secondary">
                    {new Date(t.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} ·{' '}
                    {t.kind === 'evidence' ? 'Evidence' : 'Account'}
                  </div>
                  <div className="text-primary">{t.text}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {showDetails && report.evidence.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="text-xs uppercase tracking-wide text-secondary">Evidence</h2>
            <div className="card flex flex-col gap-3 text-sm">
              {report.evidence.map((e, i) => (
                <div key={e.id}>
                  <div className="text-xs text-secondary">
                    {i + 1}. {new Date(e.timestamp).toLocaleString('en-GB')} · {e.type} · {e.severity}
                  </div>
                  <div className="text-primary">{e.content}</div>
                  <div className="break-all font-mono text-[10px] text-secondary/70">{e.leafHash}</div>
                </div>
              ))}
              <div className="break-all font-mono text-[10px] text-secondary">Merkle root: {report.rootHash}</div>
            </div>
          </section>
        )}

        <p className="text-xs text-secondary/70">
          The downloaded PDF also includes the legal disclaimer, protective options, support contacts,
          and an embedded provenance hash.
        </p>
      </div>
    </div>
  );
}
