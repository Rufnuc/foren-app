import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  isExportBundle,
  verifyMerkle,
  verifySolana,
  type MerkleVerification,
  type SolanaVerification,
} from '@/lib/verifyBundle';
import { verifyOts } from '@/lib/ots';
import { verifyEvidenceProof } from '@/lib/zkProver';
import type { ExportBundle } from '@/lib/exportBundle';

interface Results {
  caseTitle: string;
  merkle: MerkleVerification;
  solana: SolanaVerification;
  bitcoin: { status: string; message: string };
  zk?: { status: string; message: string };
}

// Independent verification (spec 2.10). Public — no vault unlock required.
export function Verify() {
  const [raw, setRaw] = useState('');
  const [results, setResults] = useState<Results | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onFile = async (file: File) => {
    setRaw(await file.text());
    setError(null);
  };

  const run = async () => {
    setError(null);
    setResults(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      setError('That doesn’t look like a valid JSON bundle.');
      return;
    }
    if (!isExportBundle(parsed)) {
      setError('Not a Foren export bundle (foren-bundle-v1).');
      return;
    }
    setBusy(true);
    try {
      const merkle = await verifyMerkle(parsed);
      const solana = await verifySolana({
        signature: parsed.proof_chain.solana_tx,
        cluster: parsed.proof_chain.solana_cluster,
        rootHash: parsed.proof_chain.root_hash,
        programId: parsed.proof_chain.solana_program,
        recordPda: parsed.proof_chain.solana_record_pda,
      });
      const bitcoin = await verifyBitcoinAnchor(parsed);
      const zk = await verifyZkProof(parsed);
      setResults({ caseTitle: parsed.case.title, merkle, solana, bitcoin, zk });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app-shell px-6 py-8">
      <header className="mb-4 flex items-center gap-3">
        <Link to="/" className="text-gold" aria-label="Back">←</Link>
        <h1 className="text-xl font-semibold text-primary">Independent verification</h1>
      </header>
      <p className="mb-6 text-sm text-secondary">
        Upload a Foren case export. Verification runs entirely in your browser —
        it recomputes the Merkle root from the evidence and checks every proof.
      </p>

      <div className="card flex flex-col gap-3">
        <label className="btn-secondary w-full cursor-pointer text-center">
          Upload bundle file
          <input
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          />
        </label>
        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          rows={4}
          placeholder="…or paste the bundle JSON here"
          className="rounded-xl bg-background px-3 py-3 font-mono text-xs text-primary placeholder:text-secondary/60"
        />
        <button type="button" className="btn-primary w-full" disabled={!raw.trim() || busy} onClick={run}>
          {busy ? 'Verifying…' : 'Verify'}
        </button>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>

      {results && (
        <div className="mt-6 flex flex-col gap-3">
          <div
            className={`card border ${results.merkle.ok ? 'border-success/50' : 'border-danger/50'}`}
          >
            <p className={`text-base font-semibold ${results.merkle.ok ? 'text-success' : 'text-danger'}`}>
              {results.merkle.ok ? '✓ Verification successful' : '✗ Verification failed'}
            </p>
            <p className="mt-1 text-sm text-secondary">Case: {results.caseTitle}</p>
            <p className="text-sm text-secondary">
              {results.merkle.verified}/{results.merkle.total} evidence items verified
            </p>
            <p className="mt-1 break-all font-mono text-[10px] text-secondary">
              root {results.merkle.rootHash}
            </p>
            {results.merkle.failures.length > 0 && (
              <p className="mt-1 text-xs text-danger">
                Tampered/invalid: {results.merkle.failures.length} item(s)
              </p>
            )}
            {results.merkle.note && <p className="mt-1 text-xs text-secondary">{results.merkle.note}</p>}
          </div>

          <CheckRow label="Merkle proof (offline)" ok={results.merkle.ok} detail={results.merkle.ok ? 'Root reproduced from evidence.' : 'Root did not reproduce.'} />
          <CheckRow
            label="Solana commitment"
            ok={results.solana.status === 'verified'}
            pending={
              results.solana.status === 'pending' ||
              results.solana.status === 'skipped' ||
              results.solana.status === 'revoked'
            }
            detail={results.solana.message}
          />
          <CheckRow
            label="Bitcoin anchor (OpenTimestamps)"
            ok={results.bitcoin.status === 'confirmed'}
            pending={results.bitcoin.status === 'pending' || results.bitcoin.status === 'skipped'}
            detail={results.bitcoin.message}
          />
          {results.zk && (
            <CheckRow
              label="Zero-knowledge proof"
              ok={results.zk.status === 'verified'}
              pending={results.zk.status === 'pending'}
              detail={results.zk.message}
            />
          )}
        </div>
      )}
    </div>
  );
}

// Verify the Bitcoin OpenTimestamps proof ENTIRELY IN THE BROWSER — no relay,
// no Foren server. Parses the .ots, binds it to the evidence Merkle root, and
// (when the proof has reached Bitcoin) re-checks the committed digest against
// the real block header. A fresh anchor reads as "pending" until it confirms.
async function verifyBitcoinAnchor(
  bundle: ExportBundle,
): Promise<{ status: string; message: string }> {
  const anchor = bundle.proof_chain.bitcoin_anchor;
  if (!anchor) return { status: 'skipped', message: 'Not Bitcoin-anchored.' };
  return verifyOts(anchor.ots, bundle.proof_chain.root_hash);
}

// Verify the optional zero-knowledge proof ENTIRELY IN THE BROWSER, against the
// public verifying key shipped with the app — no relay, no chain. Confirms the
// proof is a valid Groth16 proof for the evidence_zk circuit; the public signals
// disclose only the slot range, never the exact anchor.
async function verifyZkProof(
  bundle: ExportBundle,
): Promise<{ status: string; message: string } | undefined> {
  const zk = bundle.proof_chain.zk_proof;
  if (!zk) return undefined;
  try {
    const ok = await verifyEvidenceProof(zk.public_signals, zk.proof);
    if (!ok) return { status: 'invalid', message: 'Zero-knowledge proof did NOT verify.' };
    const [min, max] = zk.public_signals; // slot_min, slot_max
    return {
      status: 'verified',
      message: `Valid — proves the evidence was anchored on Solana within slots [${min}, ${max}] without revealing the exact anchor. Verified in your browser.`,
    };
  } catch {
    return {
      status: 'pending',
      message: 'A zero-knowledge proof is present but could not be checked in this browser.',
    };
  }
}

function CheckRow({
  label,
  ok,
  pending,
  detail,
}: {
  label: string;
  ok: boolean;
  pending?: boolean;
  detail: string;
}) {
  const icon = ok ? '✓' : pending ? '⏳' : '✗';
  const color = ok ? 'text-success' : pending ? 'text-secondary' : 'text-danger';
  return (
    <div className="card flex items-start gap-3">
      <span className={`text-lg ${color}`} aria-hidden="true">{icon}</span>
      <div>
        <div className="text-sm text-primary">{label}</div>
        <div className="text-xs text-secondary">{detail}</div>
      </div>
    </div>
  );
}
