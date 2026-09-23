import { buildCommitment } from './merkle';
import { analyzeAccount, tagLabel, type TimelinePoint } from './experience';
import {
  getJurisdiction,
  offencesForTags,
  DEFAULT_JURISDICTION,
  type JurisdictionId,
  type Offence,
  type ProtectiveOrder,
  type SupportContact,
} from '@/legal/offences';
import type {
  CaseSummary,
  EvidenceItem,
  ExperienceAccount,
  PromptAnswer,
  SeverityLabel,
  SeverityLevel,
} from '@/types';

// Case report: weaves the survivor's account, the evidence, the pattern
// analysis, and the legal knowledge base into a single human-readable document
// (PDF). Distinct from the self-verifying JSON bundle, which stays the machine
// companion. Everything is produced on-device and framed as general legal
// information, not advice (see the jurisdiction disclaimer).

const SEV_LABELS: SeverityLabel[] = ['low', 'medium', 'high', 'critical'];
const labelFor = (n: SeverityLevel): SeverityLabel => SEV_LABELS[n - 1] ?? 'low';

export interface ReportPatternSection {
  tag: string;
  label: string;
  severity: SeverityLabel;
  severityNumeric: SeverityLevel;
  accountQuotes: Array<{ text: string; source: string }>;
  evidence: EvidenceItem[];
  offences: Offence[];
}

export interface CaseReport {
  jurisdictionId: JurisdictionId;
  jurisdiction: string;
  generatedAt: number;
  case: CaseSummary;
  account: ExperienceAccount | null;
  patterns: ReportPatternSection[];
  offences: Offence[];
  timeline: TimelinePoint[];
  evidence: Array<EvidenceItem & { leafHash: string }>;
  rootHash: string;
  protectiveOrders: ProtectiveOrder[];
  supportContacts: SupportContact[];
  disclaimer: string;
  proof: { solanaTx?: string | null; solanaCluster?: string | null; bitcoinStatus?: string | null };
}

export interface ReportOptions {
  jurisdiction: JurisdictionId;
  /** Include the pattern analysis + legal mapping sections. */
  includeLegal: boolean;
  solanaTx?: string | null;
  solanaCluster?: string | null;
  bitcoinStatus?: string | null;
}

export async function buildReport(
  summary: CaseSummary,
  evidence: EvidenceItem[],
  account: ExperienceAccount | null,
  options: ReportOptions,
): Promise<CaseReport> {
  const jx = getJurisdiction(options.jurisdiction ?? DEFAULT_JURISDICTION);
  const analysis = account ? await analyzeAccount(account, evidence) : null;

  // Every pattern tag present across evidence and the account.
  const tagOrder: string[] = [];
  const seenTag = new Set<string>();
  const pushTag = (t: string) => {
    if (!seenTag.has(t)) {
      seenTag.add(t);
      tagOrder.push(t);
    }
  };
  analysis?.patterns.forEach((p) => pushTag(p.tag));
  evidence.forEach((e) => e.patternTags.forEach(pushTag));

  const patterns: ReportPatternSection[] = options.includeLegal
    ? tagOrder
        .map((tag) => {
          const items = evidence.filter((e) => e.patternTags.includes(tag));
          const accountPattern = analysis?.patterns.find((p) => p.tag === tag);
          const severityNumeric = Math.max(
            accountPattern?.severityNumeric ?? 1,
            ...items.map((e) => e.severityNumeric),
            1,
          ) as SeverityLevel;
          return {
            tag,
            label: tagLabel(tag),
            severity: labelFor(severityNumeric),
            severityNumeric,
            accountQuotes: accountPattern?.quotes ?? [],
            evidence: items,
            offences: jx.tagOffences[tag] ?? [],
          };
        })
        .filter((p) => p.offences.length > 0)
        .sort((a, b) => b.severityNumeric - a.severityNumeric)
    : [];

  const { root, entries } = await buildCommitment(evidence);
  const leafById = new Map(entries.map((e) => [e.id, e.leafHash]));
  const evidenceWithHash = [...evidence]
    .sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id))
    .map((e) => ({ ...e, leafHash: leafById.get(e.id) ?? '' }));

  const timeline =
    analysis?.timeline ??
    [...evidence]
      .sort((a, b) => a.timestamp - b.timestamp)
      .map<TimelinePoint>((e) => ({
        date: e.timestamp,
        kind: 'evidence',
        text: e.content,
        evidenceId: e.id,
        tags: e.patternTags,
        severityNumeric: e.severityNumeric,
      }));

  return {
    jurisdictionId: jx.id,
    jurisdiction: jx.name,
    generatedAt: Date.now(),
    case: summary,
    account,
    patterns,
    offences: options.includeLegal ? offencesForTags(tagOrder, jx.id) : [],
    timeline,
    evidence: evidenceWithHash,
    rootHash: root,
    protectiveOrders: options.includeLegal ? jx.protectiveOrders : [],
    supportContacts: jx.supportContacts,
    disclaimer: jx.disclaimer,
    proof: {
      solanaTx: options.solanaTx ?? null,
      solanaCluster: options.solanaCluster ?? null,
      bitcoinStatus: options.bitcoinStatus ?? null,
    },
  };
}

const fmtDate = (ms: number) =>
  new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtDateTime = (ms: number) =>
  new Date(ms).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function answeredPrompts(answers: PromptAnswer[]): PromptAnswer[] {
  return answers.filter((a) => a.answer.trim() !== '');
}

export interface PdfRenderOptions {
  /** Draw a faint diagonal FOREN watermark behind each page. */
  watermark?: boolean;
}

/** The blockchain-derived provenance string embedded in the PDF metadata. */
export function provenanceString(report: CaseReport): string {
  return (
    `Foren provenance | merkleRoot=${report.rootHash} | ` +
    `solanaTx=${report.proof.solanaTx ?? 'none'} | ` +
    `solanaCluster=${report.proof.solanaCluster ?? 'none'} | ` +
    `bitcoin=${report.proof.bitcoinStatus ?? 'none'} | ` +
    `generated=${new Date(report.generatedAt).toISOString()}`
  );
}

export async function reportToPdf(report: CaseReport, render: PdfRenderOptions = {}): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 48;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const width = pageW - margin * 2;
  let y = margin;

  // Hidden-in-the-depth provenance: the evidence Merkle root (the hash anchored
  // on-chain) plus any blockchain anchor, embedded in the PDF metadata rather
  // than shown on the page. Retrievable from the document properties.
  doc.setProperties({
    title: `Foren Case Report — ${report.case.title}`,
    subject: provenanceString(report),
    author: 'Foren',
    keywords: `foren, evidence, ${report.rootHash}${report.proof.solanaTx ? `, ${report.proof.solanaTx}` : ''}`,
    creator: 'Foren',
  });

  const flow = (gap: number) => {
    if (y > pageH - margin) {
      doc.addPage();
      y = margin;
    }
    y += gap;
  };
  const text = (s: string, size = 10, gap = 14, bold = false, indent = 0) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal').setFontSize(size);
    doc.setTextColor(20, 20, 20);
    for (const seg of doc.splitTextToSize(s, width - indent)) {
      if (y > pageH - margin) {
        doc.addPage();
        y = margin;
      }
      doc.text(seg, margin + indent, y);
      y += gap;
    }
  };
  const heading = (s: string) => {
    flow(10);
    text(s, 13, 18, true);
  };

  text('Case Report', 20, 28, true);
  text(`Case: ${report.case.title}`, 12, 18);
  text(`Reference: ${report.case.id}`, 8, 12);
  text(`Jurisdiction: ${report.jurisdiction}`, 9, 12);
  text(`Generated: ${fmtDateTime(report.generatedAt)}`, 9, 18);

  text(report.disclaimer, 8, 12);
  flow(6);

  if (report.account && (answeredPrompts(report.account.promptAnswers).length || report.account.narrative.trim())) {
    heading('1. The person’s account (their own statement)');
    for (const a of answeredPrompts(report.account.promptAnswers)) {
      text(a.question, 9, 13, true);
      text(a.answer, 10, 14, false, 8);
      flow(4);
    }
    if (report.account.narrative.trim()) {
      text('In their own words', 9, 13, true);
      text(report.account.narrative, 10, 14, false, 8);
    }
  }

  if (report.patterns.length) {
    heading('2. Patterns identified and the law that may apply');
    text(
      'The patterns below were identified by on-device analysis of the account and evidence. ' +
        'The offences listed are what such behaviour may engage under the law of ' +
        `${report.jurisdiction}. Whether any offence is made out is a matter for the police, ` +
        'prosecutors and courts.',
      8,
      12,
    );
    flow(4);
    for (const p of report.patterns) {
      text(`${p.label}  —  ${p.severity.toUpperCase()}`, 11, 16, true);
      if (p.accountQuotes.length) {
        text('From the account:', 9, 12, true, 8);
        for (const q of p.accountQuotes.slice(0, 4)) text(`“${q.text}”`, 9, 12, false, 16);
      }
      if (p.evidence.length) {
        text(`Supporting evidence: ${p.evidence.length} item(s).`, 9, 12, false, 8);
      } else {
        text('No saved evidence yet supports this pattern.', 9, 12, false, 8);
      }
      text('Offences that may be relevant:', 9, 13, true, 8);
      for (const o of p.offences) {
        text(`• ${o.title} — ${o.statute}`, 9, 12, true, 16);
        text(o.summary, 8, 12, false, 24);
      }
      flow(6);
    }
  }

  if (report.timeline.length) {
    heading('3. Chronology');
    for (const t of report.timeline) {
      const src = t.kind === 'evidence' ? 'Evidence' : 'Account';
      text(`${fmtDate(t.date)} — ${src}`, 9, 12, true);
      text(t.text, 9, 13, false, 8);
    }
  }

  if (report.evidence.length) {
    heading('4. Evidence schedule');
    report.evidence.forEach((e, i) => {
      text(`${i + 1}. ${fmtDateTime(e.timestamp)} — ${e.type} [${e.severity}]`, 9, 13, true);
      if (e.content) text(e.content, 9, 13, false, 8);
      if (e.patternTags.length) text(`Tags: ${e.patternTags.map(tagLabel).join(', ')}`, 8, 11, false, 8);
      text(`ID: ${e.id}`, 7, 11, false, 8);
      text(`Integrity hash: ${e.leafHash}`, 7, 13, false, 8);
    });
    flow(4);
    text(`Merkle root of all evidence: ${report.rootHash}`, 8, 12, true);
    if (report.proof.solanaTx) text(`Anchored on Solana: ${report.proof.solanaTx}`, 8, 12);
    if (report.proof.bitcoinStatus) text(`Bitcoin timestamp: ${report.proof.bitcoinStatus}`, 8, 12);
  }

  if (report.protectiveOrders.length) {
    heading('5. Protective options that may be available');
    for (const o of report.protectiveOrders) {
      text(`• ${o.title} — ${o.statute}`, 9, 12, true, 8);
      text(o.summary, 8, 12, false, 16);
    }
  }

  heading('6. Where to get help');
  for (const c of report.supportContacts) text(`• ${c.name}: ${c.detail}`, 9, 13, false, 8);

  flow(8);
  text(report.disclaimer, 8, 11, false);

  if (render.watermark) drawWatermark(doc, pageW, pageH);

  return doc.output('blob');
}

// Faint diagonal FOREN watermark on every page. Drawn last, at low opacity, so
// it reads as a background stamp without obscuring the text.
function drawWatermark(doc: import('jspdf').jsPDF, pageW: number, pageH: number) {
  const d = doc as unknown as {
    getNumberOfPages: () => number;
    setPage: (n: number) => void;
    saveGraphicsState: () => void;
    restoreGraphicsState: () => void;
    setGState: (g: unknown) => void;
    GState: new (opts: { opacity: number }) => unknown;
    setTextColor: (r: number, g: number, b: number) => void;
    setFont: (f: string, s: string) => void;
    setFontSize: (n: number) => void;
    text: (t: string, x: number, y: number, o: { align: string; angle: number }) => void;
  };
  const total = d.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    d.setPage(p);
    d.saveGraphicsState();
    d.setGState(new d.GState({ opacity: 0.06 }));
    d.setTextColor(120, 90, 140);
    d.setFont('helvetica', 'bold');
    d.setFontSize(90);
    d.text('FOREN', pageW / 2, pageH / 2, { align: 'center', angle: 35 });
    d.restoreGraphicsState();
  }
}
