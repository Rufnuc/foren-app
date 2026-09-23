import type { EvidenceItem, PromptAnswer, SeverityLabel, SeverityLevel } from '@/types';
import { classifyWithModel } from './analysisModel';

// Experience analysis: turn a survivor's own account (guided answers + free-form
// narrative) into a structured, evidence-linked picture — WITHOUT sending
// anything off the device. Meaning usually isn't visible in a single piece of
// evidence ("where are you?" looks neutral); the account is what explains the
// pattern. We segment the account, classify each segment, then aggregate:
//   • patterns  — abuse patterns the account describes, with the person's own words
//   • linked evidence — saved items that already carry that pattern
//   • gaps      — patterns described but not yet backed by any evidence
//   • timeline  — dated account mentions interleaved with evidence, in order
//
// IMPORTANT: an account is a different text type from an abusive message. The
// evidence classifier (lib/analysis.ts) is tuned for the abuser's words ("I saw
// YOU", "where YOU live"); an account is the survivor narrating ("he saw ME",
// "he knows where I live"). So the account gets its own narrative-tuned
// classifier here, which also recognises the wider patterns the guided prompts
// elicit (financial control, isolation, surveillance, using children). Shared
// tags link to evidence; narrative-only tags surface as gaps until the trained
// model covers them for evidence too. All of this is assistive analysis derived
// from the person's own statement — labelled as such in the UI, never presented
// as machine-made evidence.

/** A guided question shown during account entry. */
export interface GuidedPrompt {
  id: string;
  question: string;
  hint?: string;
}

// Non-leading, trauma-informed prompts, each aimed at a family of patterns the
// classifier can pick up. Order is gentle → specific. IDs are stable (persisted).
export const GUIDED_PROMPTS: GuidedPrompt[] = [
  {
    id: 'relationship',
    question: 'Who is this about, and what is or was your relationship to them?',
    hint: 'You don’t have to name them — partner, ex, a family member, whatever fits.',
  },
  {
    id: 'daily-life',
    question: 'What does a typical day or week with them look like?',
  },
  {
    id: 'limits',
    question: 'Are there things you feel you can’t do, or have to do, because of them?',
    hint: 'Seeing friends or family, going out, what you wear, who you talk to, your phone.',
  },
  {
    id: 'contact',
    question: 'How do they contact you, or keep track of where you are?',
  },
  {
    id: 'safety',
    question: 'Has anything made you feel unsafe or afraid? What happened?',
  },
  {
    id: 'money-work',
    question: 'How do money or work come into it?',
  },
  {
    id: 'others',
    question: 'Are children, pets, or other people ever used to pressure you?',
  },
];

/** Human-readable labels for the pattern tags this analyser emits. */
export const NARRATIVE_TAG_LABELS: Record<string, string> = {
  // keyword-classifier tags
  threat: 'Threats',
  stalking: 'Stalking',
  surveillance: 'Surveillance / monitoring',
  coercion: 'Coercive control',
  isolation: 'Isolation',
  financial: 'Financial control',
  intimidation: 'Intimidation',
  'contact-flood': 'Repeated contact',
  location: 'Knows your movements',
  'child-related': 'Using children',
  // trained-model taxonomy tags (used when the model is present)
  'physical-violence': 'Physical violence',
  sexual: 'Sexual abuse',
  'coercive-control': 'Coercive control',
  harassment: 'Harassment',
  'financial-abuse': 'Financial control',
  'contact-breach': 'Contact breach',
  manipulation: 'Manipulation',
  degradation: 'Degradation',
};

export function tagLabel(tag: string): string {
  return NARRATIVE_TAG_LABELS[tag] ?? tag;
}

interface NarrativeRule {
  tag: string;
  weight: SeverityLevel;
  patterns: RegExp[];
}

// Narrative-tuned rules: written for how a survivor describes their experience
// (first/third person), not how an abuser phrases a message. Deliberately
// requires abusive framing rather than mere topic mentions (e.g. "the kids"
// alone must not trip child-related), to keep benign answers clean.
const NARRATIVE_RULES: NarrativeRule[] = [
  {
    tag: 'threat', weight: 4,
    patterns: [
      /\bkill\b/i, /\bhurt\b/i, /\bharm\b/i, /\bbeat(s|en|ing)?\b/i, /\bhit(s|ting)?\b/i,
      /\bstrangl/i, /\bchok(e|ed|ing)\b/i, /\b(weapon|knife|gun)\b/i,
      /\bthreat(en(ed|s|ing)?)?\b/i, /\bor i.?ll\b/i, /\byou.?ll regret\b/i, /\bwatch your back\b/i,
    ],
  },
  {
    tag: 'child-related', weight: 3,
    patterns: [
      /\b(take|took|taking) (the|our|my) (kids|children|kid|child)\b/i,
      /\buse(s|d)? (the|our) (kids|children)\b/i, /\bthrough the (kids|children)\b/i,
      /\bnever (see|seeing) (them|the (kids|children))\b/i,
      /\bwon.?t let me see (them|the (kids|children))\b/i, /\bcustody (battle|threat|fight)\b/i,
    ],
  },
  {
    tag: 'stalking', weight: 3,
    patterns: [
      /\bfollow(s|ed|ing)?\b/i, /\bwaiting outside\b/i, /\boutside (my|the) (work|house|home|school)\b/i,
      /\bshow(s|ed)? up\b/i, /\bturn(s|ed)? up\b/i, /\beverywhere i go\b/i,
      /\bwatching me\b/i, /\bsaw me\b/i, /\bstalk/i,
    ],
  },
  {
    tag: 'surveillance', weight: 3,
    patterns: [
      /\bcheck(s|ed|ing)?\s+my\s+phone\b/i, /\bgo(es|ne)?\s+through\s+my\s+phone\b/i,
      /\bread(s|ing)?\s+my\s+(messages|texts|emails)\b/i, /\btrack(s|ed|ing)?\s+(me|my)\b/i,
      /\bgps\b/i, /\bmonitor(s|ed|ing)?\b/i, /\bcamera(s)?\b/i, /\bspy(ware|ing)?\b/i,
      /\bknows? where i (am|go)\b/i, /\bchecking up on me\b/i,
    ],
  },
  {
    tag: 'coercion', weight: 3,
    patterns: [
      /\bwon.?t (let|allow) me\b/i, /\bnot allowed\b/i, /\b(has|have) to ask\b/i,
      /\bask(s)? (for )?permission\b/i, /\bcontrol(s|led|ling)?\b/i, /\bmakes? me\b/i,
      /\bdecides?\b/i, /\bdo as (i|he|she) says?\b/i, /\bor else\b/i, /\bif i don.?t\b/i,
      /\bi have to\b/i,
    ],
  },
  {
    tag: 'isolation', weight: 2,
    patterns: [
      /\bcut me off\b/i, /\bstopp?ed me (from )?seeing\b/i, /\bwon.?t let me see\b/i,
      /\bkeep(s)? me (away )?from\b/i, /\bisolat(e|ed|ing)\b/i, /\baway from my (family|friends)\b/i,
      /\bcan.?t see my (friends|family)\b/i,
    ],
  },
  {
    tag: 'financial', weight: 2,
    patterns: [
      /\bcontrols? (the|my|our) money\b/i, /\btakes? my (money|wages|pay|card)\b/i,
      /\bwon.?t give me (any )?money\b/i, /\bno access to (the )?(money|account|bank|card)\b/i,
      /\ballowance\b/i, /\bcancel(led|s)? my card\b/i, /\bwon.?t let me work\b/i,
    ],
  },
  {
    tag: 'intimidation', weight: 2,
    patterns: [
      /\bscared\b/i, /\bafraid\b/i, /\bfrightened\b/i, /\bterrified\b/i, /\bwalk on eggshells\b/i,
      /\bshut up\b/i, /\bworthless\b/i, /\bstupid\b/i, /\bput(s)? me down\b/i, /\bhumiliat/i,
      /\bintimidat/i,
    ],
  },
  {
    tag: 'contact-flood', weight: 2,
    patterns: [
      /\bkeep(s)? (calling|texting|messaging|ringing)\b/i, /\bover and over\b/i, /\bconstantly\b/i,
      /\bwon.?t stop (calling|texting|messaging)\b/i, /\bhundreds of (calls|messages|texts)\b/i,
      /\bblow(s)? up my phone\b/i, /\b\d+ missed calls?\b/i, /\bnon.?stop\b/i,
    ],
  },
  {
    tag: 'location', weight: 2,
    patterns: [
      /\bknows? where i (live|work)\b/i, /\bmy address\b/i, /\bwhere i live\b/i, /\bwhere i work\b/i,
    ],
  },
];

// Each pattern's intrinsic severity, so a low-severity tag that merely shares a
// sentence with a serious one doesn't inherit the serious tag's level.
const TAG_WEIGHT: Record<string, SeverityLevel> = Object.fromEntries(
  NARRATIVE_RULES.map((r) => [r.tag, r.weight]),
) as Record<string, SeverityLevel>;

function classifyNarrative(text: string): { tags: string[]; severityNumeric: SeverityLevel } {
  const tags = NARRATIVE_RULES.filter((r) => r.patterns.some((p) => p.test(text))).map((r) => r.tag);
  const severityNumeric = tags.reduce<SeverityLevel>((max, tag) => {
    const w = NARRATIVE_RULES.find((r) => r.tag === tag)?.weight ?? 1;
    return (w > max ? w : max) as SeverityLevel;
  }, 1);
  return { tags, severityNumeric };
}

export interface AccountSegment {
  text: string;
  /** Where it came from — a prompt question, or the free-form narrative. */
  source: string;
  tags: string[];
  severityNumeric: SeverityLevel;
}

export interface PatternFinding {
  tag: string;
  severityNumeric: SeverityLevel;
  severity: SeverityLabel;
  /** The person's own words that evidence this pattern. */
  quotes: Array<{ text: string; source: string }>;
  /** IDs of saved evidence items already carrying this pattern. */
  linkedEvidenceIds: string[];
  hasEvidence: boolean;
}

export interface TimelinePoint {
  /** Epoch ms. Account mentions without a parseable date are omitted. */
  date: number;
  /** The raw date phrase, for account mentions. */
  dateText?: string;
  kind: 'account' | 'evidence';
  text: string;
  source?: string;
  evidenceId?: string;
  tags: string[];
  severityNumeric: SeverityLevel;
}

export interface AccountAnalysis {
  /** All patterns found in the account, most severe first. */
  patterns: PatternFinding[];
  /** Patterns described but not yet supported by evidence (a subset of patterns). */
  gaps: PatternFinding[];
  /** Dated account mentions + evidence, chronological. */
  timeline: TimelinePoint[];
  /** Per-segment classification, for transparency. */
  segments: AccountSegment[];
}

const SEV_LABELS: SeverityLabel[] = ['low', 'medium', 'high', 'critical'];
function labelFor(n: SeverityLevel): SeverityLabel {
  return SEV_LABELS[n - 1] ?? 'low';
}

// Split into sentence-like segments. Avoids lookbehind (older WKWebView) and
// handles the Arabic question mark (؟). Newlines always break.
function splitSentences(text: string): string[] {
  return text
    .replace(/([.!?؟])\s+/g, '$1\n')
    .split(/\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1);
}

interface AccountInput {
  promptAnswers: PromptAnswer[];
  narrative: string;
}

function collectSegments(account: AccountInput): Array<{ text: string; source: string }> {
  const segs: Array<{ text: string; source: string }> = [];
  for (const a of account.promptAnswers) {
    if (!a.answer.trim()) continue;
    for (const s of splitSentences(a.answer)) segs.push({ text: s, source: a.question });
  }
  for (const s of splitSentences(account.narrative || '')) {
    segs.push({ text: s, source: 'Your account' });
  }
  return segs;
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

// Best-effort explicit-date extraction. Deliberately conservative: only anchors
// the timeline on clearly-dated mentions, never guesses from relative phrases
// ("last week") that we can't resolve reliably.
export function parseApproxDate(text: string): { ms: number; phrase: string } | null {
  const t = text.toLowerCase();
  let m = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m) return { ms: Date.UTC(+m[1], +m[2] - 1, +m[3]), phrase: m[0] };

  // "12 March 2024", "3rd of April"
  m = t.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(?:\s+(\d{4}))?/);
  if (m) {
    const year = m[3] ? +m[3] : new Date().getFullYear();
    return { ms: Date.UTC(year, MONTHS[m[2]], +m[1]), phrase: m[0].trim() };
  }

  // "March 2024"
  m = t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{4})\b/);
  if (m) return { ms: Date.UTC(+m[2], MONTHS[m[1]], 1), phrase: m[0].trim() };

  // "12/03/2024", "12-03-24" (day-first / UK order)
  m = t.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/);
  if (m) {
    let year = +m[3];
    if (year < 100) year += 2000;
    return { ms: Date.UTC(year, +m[2] - 1, +m[1]), phrase: m[0] };
  }
  return null;
}

function buildTimeline(segments: AccountSegment[], evidence: EvidenceItem[]): TimelinePoint[] {
  const points: TimelinePoint[] = [];
  for (const seg of segments) {
    const d = parseApproxDate(seg.text);
    if (d) {
      points.push({
        date: d.ms, dateText: d.phrase, kind: 'account', text: seg.text,
        source: seg.source, tags: seg.tags, severityNumeric: seg.severityNumeric,
      });
    }
  }
  for (const ev of evidence) {
    points.push({
      date: ev.timestamp, kind: 'evidence', text: ev.content, evidenceId: ev.id,
      tags: ev.patternTags, severityNumeric: ev.severityNumeric,
    });
  }
  return points.sort((a, b) => a.date - b.date);
}

/**
 * Analyse an experience account against the case's existing evidence. Pure and
 * on-device; safe to re-run whenever the account or evidence changes. Async to
 * keep a stable contract for a future swap to the trained on-device model.
 */
export async function analyzeAccount(
  account: AccountInput,
  evidence: EvidenceItem[],
): Promise<AccountAnalysis> {
  // Prefer the trained on-device model; fall back to the narrative keyword
  // classifier when no model is present. (The model is trained on message text;
  // narrative-style training data will sharpen it — until then the keyword rules
  // are the safety net.) Sequential so the first call warms the model before the
  // rest run, avoiding a cold-start race where early segments slip to fallback.
  const segments: AccountSegment[] = [];
  for (const r of collectSegments(account)) {
    const model = await classifyWithModel(r.text);
    const res = model
      ? { tags: model.patternTags, severityNumeric: model.severityNumeric }
      : classifyNarrative(r.text);
    segments.push({ text: r.text, source: r.source, tags: res.tags, severityNumeric: res.severityNumeric });
  }

  const byTag = new Map<string, { sev: SeverityLevel; quotes: Array<{ text: string; source: string }> }>();
  for (const seg of segments) {
    for (const tag of seg.tags) {
      const entry = byTag.get(tag) ?? { sev: 1 as SeverityLevel, quotes: [] };
      if (seg.severityNumeric > entry.sev) entry.sev = seg.severityNumeric;
      entry.quotes.push({ text: seg.text, source: seg.source });
      byTag.set(tag, entry);
    }
  }

  const patterns: PatternFinding[] = [...byTag.entries()]
    .map(([tag, v]) => {
      const severityNumeric = TAG_WEIGHT[tag] ?? v.sev;
      const linkedEvidenceIds = evidence.filter((e) => e.patternTags.includes(tag)).map((e) => e.id);
      return {
        tag,
        severityNumeric,
        severity: labelFor(severityNumeric),
        quotes: v.quotes,
        linkedEvidenceIds,
        hasEvidence: linkedEvidenceIds.length > 0,
      };
    })
    .sort((a, b) => b.severityNumeric - a.severityNumeric || b.quotes.length - a.quotes.length);

  const gaps = patterns.filter((p) => !p.hasEvidence);
  const timeline = buildTimeline(segments, evidence);
  return { patterns, gaps, timeline, segments };
}
