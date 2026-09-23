import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { SafetyExit, LoadingSpinner, SeverityBadge } from '@/components';
import { useCase, useEvidence, useAccount, useSaveAccount } from '@/data/queries';
import { GUIDED_PROMPTS, analyzeAccount, tagLabel, type AccountAnalysis } from '@/lib/experience';
import type { PromptAnswer, SeverityLabel } from '@/types';

type View = 'write' | 'insights';

const SEV_TEXT: Record<SeverityLabel, string> = {
  low: 'text-severity-low',
  medium: 'text-severity-medium',
  high: 'text-severity-high',
  critical: 'text-severity-critical',
};
const SEV_LABELS: SeverityLabel[] = ['low', 'medium', 'high', 'critical'];

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

// "Your experience" (spec: assistive account analysis). The survivor tells their
// story in their own words — guided prompts plus a free-form account — and the
// app, entirely on-device, shows which abuse patterns it describes, links them
// to evidence already saved, flags patterns with no evidence yet, and lays out a
// timeline. It is assistive organisation of the person's own statement, never
// machine-made evidence.
export function Experience() {
  const { caseId } = useParams();
  const { data: summary } = useCase(caseId);
  const { data: evidence } = useEvidence(caseId);
  const { data: account, isLoading } = useAccount(caseId);
  const saveAccount = useSaveAccount(caseId ?? '');

  const [view, setView] = useState<View>('write');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [narrative, setNarrative] = useState('');
  const [analysis, setAnalysis] = useState<AccountAnalysis | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Hydrate the editor from the stored account (once it loads).
  useEffect(() => {
    if (!account) return;
    const map: Record<string, string> = {};
    for (const a of account.promptAnswers) map[a.promptId] = a.answer;
    setAnswers(map);
    setNarrative(account.narrative);
    setSavedAt(account.updatedAt);
  }, [account]);

  // Live, on-device analysis as the account changes.
  useEffect(() => {
    let cancelled = false;
    const draft = {
      promptAnswers: GUIDED_PROMPTS.map((p) => ({ promptId: p.id, question: p.question, answer: answers[p.id] ?? '' })),
      narrative,
    };
    const hasContent = narrative.trim() !== '' || draft.promptAnswers.some((a) => a.answer.trim() !== '');
    if (!hasContent) {
      setAnalysis(null);
      return;
    }
    void analyzeAccount(draft, evidence ?? []).then((res) => {
      if (!cancelled) setAnalysis(res);
    });
    return () => {
      cancelled = true;
    };
  }, [answers, narrative, evidence]);

  const handleSave = () => {
    const promptAnswers: PromptAnswer[] = GUIDED_PROMPTS.map((p) => ({
      promptId: p.id,
      question: p.question,
      answer: (answers[p.id] ?? '').trim(),
    }));
    saveAccount.mutate(
      { promptAnswers, narrative: narrative.trim() },
      { onSuccess: (a) => setSavedAt(a.updatedAt) },
    );
  };

  const patternCount = analysis?.patterns.length ?? 0;

  return (
    <div className="app-shell px-4 py-4">
      <header className="mb-4 flex items-center gap-3">
        <Link to={`/vault/case/${caseId}`} className="text-gold" aria-label="Back to case">←</Link>
        <h1 className="truncate text-lg font-semibold text-primary">Your experience</h1>
      </header>

      <div className="mb-4 flex gap-2 text-sm">
        <button
          type="button"
          onClick={() => setView('write')}
          className={`flex-1 rounded-md px-3 py-2 font-medium ${view === 'write' ? 'bg-plum text-primary' : 'bg-background text-secondary'}`}
        >
          Write
        </button>
        <button
          type="button"
          onClick={() => setView('insights')}
          className={`flex-1 rounded-md px-3 py-2 font-medium ${view === 'insights' ? 'bg-plum text-primary' : 'bg-background text-secondary'}`}
        >
          Insights{patternCount > 0 ? ` (${patternCount})` : ''}
        </button>
      </div>

      {isLoading ? (
        <LoadingSpinner label="Decrypting…" className="justify-center py-12" />
      ) : view === 'write' ? (
        <WriteView
          summary={summary?.title}
          answers={answers}
          narrative={narrative}
          onAnswer={(id, val) => setAnswers((prev) => ({ ...prev, [id]: val }))}
          onNarrative={setNarrative}
          onSave={handleSave}
          saving={saveAccount.isPending}
          savedAt={savedAt}
        />
      ) : (
        <InsightsView analysis={analysis} evidenceCount={(evidence ?? []).length} />
      )}

      <SafetyExit />
    </div>
  );
}

interface WriteViewProps {
  summary?: string;
  answers: Record<string, string>;
  narrative: string;
  onAnswer: (id: string, val: string) => void;
  onNarrative: (val: string) => void;
  onSave: () => void;
  saving: boolean;
  savedAt: number | null;
}

function WriteView({ summary, answers, narrative, onAnswer, onNarrative, onSave, saving, savedAt }: WriteViewProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="card text-sm text-secondary">
        Tell what {summary ? `“${summary}”` : 'this'} is really like, in your own words. The meaning of a
        message often is not visible in the message alone — your account is what explains the pattern.
        Everything here stays on your device.
      </div>

      {GUIDED_PROMPTS.map((p) => (
        <label key={p.id} className="flex flex-col gap-1">
          <span className="text-sm font-medium text-primary">{p.question}</span>
          {p.hint && <span className="text-xs text-secondary">{p.hint}</span>}
          <textarea
            value={answers[p.id] ?? ''}
            onChange={(e) => onAnswer(p.id, e.target.value)}
            rows={3}
            placeholder="Only what you want to. You can leave any of these blank."
            className="rounded-xl bg-background px-3 py-3 text-primary placeholder:text-secondary/60"
          />
        </label>
      ))}

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-primary">Anything else, in your own words</span>
        <textarea
          value={narrative}
          onChange={(e) => onNarrative(e.target.value)}
          rows={6}
          placeholder="Write freely. Dates you remember help build the timeline."
          className="rounded-xl bg-background px-3 py-3 text-primary placeholder:text-secondary/60"
        />
      </label>

      <div className="flex items-center gap-3">
        <button type="button" className="btn-primary flex-1" onClick={onSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        {savedAt && !saving && (
          <span className="text-xs text-secondary">Saved {new Date(savedAt).toLocaleString()}</span>
        )}
      </div>
    </div>
  );
}

function InsightsView({ analysis, evidenceCount }: { analysis: AccountAnalysis | null; evidenceCount: number }) {
  if (!analysis || analysis.patterns.length === 0) {
    return (
      <div className="card text-center text-sm text-secondary">
        Write about your experience on the Write tab, and patterns it describes will appear here.
      </div>
    );
  }

  const { patterns, gaps, timeline } = analysis;

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h2 className="text-xs uppercase tracking-wide text-secondary">What your account describes</h2>
        {patterns.map((p) => (
          <div key={p.tag} className="card">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="font-semibold text-primary">{tagLabel(p.tag)}</span>
              <SeverityBadge severity={p.severity} />
            </div>
            <div className="mb-2 flex flex-col gap-1">
              {p.quotes.slice(0, 3).map((q, i) => (
                <blockquote key={i} className="border-l-2 border-plum pl-2 text-sm text-secondary">
                  “{q.text}”
                </blockquote>
              ))}
            </div>
            {p.hasEvidence ? (
              <span className="text-xs text-severity-low">
                ✓ Backed by {p.linkedEvidenceIds.length} evidence item{p.linkedEvidenceIds.length > 1 ? 's' : ''}
              </span>
            ) : (
              <span className="inline-flex items-center rounded-md bg-plum/30 px-2 py-0.5 text-xs text-secondary">
                No evidence yet
              </span>
            )}
          </div>
        ))}
      </section>

      {gaps.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-xs uppercase tracking-wide text-secondary">Gaps to strengthen</h2>
          <div className="card flex flex-col gap-2 text-sm">
            <p className="text-secondary">
              You describe these, but no saved evidence backs them yet. Adding evidence here would make the
              case stronger.
            </p>
            <div className="flex flex-wrap gap-2">
              {gaps.map((g) => (
                <span key={g.tag} className="inline-flex items-center gap-1 rounded-md bg-background px-2 py-1 text-primary">
                  <span className={SEV_TEXT[g.severity]} aria-hidden="true">●</span>
                  {tagLabel(g.tag)}
                </span>
              ))}
            </div>
          </div>
        </section>
      )}

      {timeline.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-xs uppercase tracking-wide text-secondary">Timeline</h2>
          <div className="card flex flex-col gap-3">
            {timeline.map((t, i) => {
              const sev = SEV_LABELS[t.severityNumeric - 1] ?? 'low';
              return (
                <div key={i} className="flex gap-3 text-sm">
                  <span className={`mt-1 ${SEV_TEXT[sev]}`} aria-hidden="true">●</span>
                  <div className="min-w-0">
                    <div className="text-xs text-secondary">
                      {formatDate(t.date)} · {t.kind === 'evidence' ? 'Evidence' : 'Your account'}
                    </div>
                    <div className="truncate text-primary">{t.text}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <p className="text-xs text-secondary/70">
        This is assistive analysis of your own words, produced on your device. It is not legal advice and is
        not evidence itself — it helps you see patterns and decide what to collect. Add, ignore, or correct
        anything. {evidenceCount === 0 && 'Add evidence to this case to see what your account already backs up.'}
      </p>
    </div>
  );
}
