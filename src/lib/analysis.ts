import type { SeverityLabel, SeverityLevel } from '@/types';

// On-device evidence analysis (keyword heuristic).
//
// Runs entirely on the device — the evidence text never leaves it. This is a
// transparent, deterministic stand-in for the eventual purpose-trained "TRE-1"
// model. We deliberately do NOT use a small general-purpose zero-shot model
// here: testing (bart-large-mnli, deberta-v3-small via transformers.js) showed
// those score benign and threatening messages almost identically (~0.74–0.86 on
// every category), which would mislabel ordinary messages as critical threats —
// unacceptable for a survivor tool. A keyword heuristic that abstains cleanly on
// benign text is safer than a miscalibrated classifier. See git history for the
// zero-shot experiment.

const LABELS: SeverityLabel[] = ['low', 'medium', 'high', 'critical'];

export interface AnalysisResult {
  severity: SeverityLabel;
  severityNumeric: SeverityLevel;
  patternTags: string[];
}

const RULES: Array<{ tag: string; weight: SeverityLevel; patterns: RegExp[] }> = [
  { tag: 'threat', weight: 4, patterns: [/\bkill\b/i, /\bhurt\b/i, /\bharm\b/i, /\bi know where you\b/i, /\byou.?ll regret\b/i, /\bwatch your back\b/i] },
  { tag: 'stalking', weight: 3, patterns: [/\bfollow(ed|ing)?\b/i, /\bwatching you\b/i, /\boutside your\b/i, /\bsaw you (at|with|leave)\b/i, /\bwhere you (live|work)\b/i] },
  { tag: 'coercion', weight: 3, patterns: [/\bor else\b/i, /\byou have to\b/i, /\bif you don.?t\b/i, /\bdo as i say\b/i, /\bmake you\b/i] },
  { tag: 'location', weight: 2, patterns: [/\baddress\b/i, /\byour home\b/i, /\byour street\b/i, /\bcoming over\b/i] },
  { tag: 'intimidation', weight: 2, patterns: [/\bscared\b/i, /\bafraid\b/i, /\bshut up\b/i, /\bstupid\b/i, /\bworthless\b/i] },
  { tag: 'contact-flood', weight: 1, patterns: [/\bcall me back\b/i, /\banswer me\b/i, /\bwhy.{0,12}ignoring\b/i, /\b\d+ missed calls?\b/i] },
];

function resultFromTags(tags: string[]): AnalysisResult {
  const maxWeight = tags.reduce<SeverityLevel>((m, tag) => {
    const w = RULES.find((r) => r.tag === tag)?.weight ?? 1;
    return (w > m ? w : m) as SeverityLevel;
  }, 1);
  return { severity: LABELS[maxWeight - 1], severityNumeric: maxWeight, patternTags: tags };
}

export async function analyzeText(content: string): Promise<AnalysisResult> {
  if (!content.trim()) return resultFromTags([]);

  // Prefer the trained on-device model when its files are present; otherwise
  // fall back to the transparent keyword heuristic. Both run entirely on-device.
  const { classifyWithModel } = await import('./analysisModel');
  const modelResult = await classifyWithModel(content);
  if (modelResult) return modelResult;

  await new Promise((r) => setTimeout(r, 200)); // keep the spinner-friendly contract
  const tags = RULES.filter((r) => r.patterns.some((p) => p.test(content))).map((r) => r.tag);
  return resultFromTags(tags);
}
