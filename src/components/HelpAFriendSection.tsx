import { useEffect, useState } from 'react';
import { SectionCard, SettingRow } from './SettingsPrimitiveComponents';
import { Modal } from './Modal';
import {
  getMyReferralLink,
  getReferralStats,
  getActivityScore,
  type ReferralStats,
  type ActivityScore,
} from '@/lib/referral';

function scoreBand(score: number): string {
  if (score >= 75) return 'Very active';
  if (score >= 50) return 'Active';
  if (score >= 25) return 'Getting going';
  return 'Just started';
}

// "Help a friend": share a private invite link and see how many people it has
// helped — without the relay (or anyone) learning who you invited. Also shows
// this device's own anonymous activity score.
export function HelpAFriendSection({ flash }: { flash: (m: string) => void }) {
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [score, setScore] = useState<ActivityScore | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showLink, setShowLink] = useState(false);

  useEffect(() => {
    // Best-effort — the relay may be unreachable; the section still renders.
    getReferralStats().then(setStats).catch(() => {});
    getActivityScore().then(setScore).catch(() => {});
  }, []);

  const share = async () => {
    setBusy(true);
    try {
      const { link } = await getMyReferralLink();
      setLink(link);
      // Native share sheet where available (neutral text — never names the app).
      const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
      if (nav.share) {
        try {
          await nav.share({ text: 'A private, secure app I think could help you.', url: link });
          flash('Shared');
          return;
        } catch {
          /* user cancelled or unsupported — fall through to the copy dialog */
        }
      }
      setShowLink(true);
    } catch {
      flash('Couldn’t create your link — is the relay reachable?');
    } finally {
      setBusy(false);
    }
  };

  const refresh = async () => {
    setBusy(true);
    try {
      setStats(await getReferralStats());
      setScore(await getActivityScore());
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <SectionCard title="Help a friend">
        <SettingRow
          label="Share a private invite"
          sublabel="We can’t see who you invite — only how many it helps"
          onClick={busy ? undefined : share}
        >
          <span className="text-xs text-gold">{busy ? '…' : 'Share'}</span>
        </SettingRow>

        <SettingRow
          label="Friends helped"
          sublabel={
            stats
              ? stats.helped === 0
                ? 'No one’s used your link yet'
                : stats.reused
                  ? 'Your link is being shared on'
                  : 'Thank you for spreading safety'
              : '—'
          }
          onClick={busy ? undefined : refresh}
        >
          <span className="text-sm font-semibold text-primary">{stats ? stats.helped : '—'}</span>
        </SettingRow>

        <SettingRow
          label="Your activity"
          sublabel={
            score
              ? `${scoreBand(score.score)} · more active than ${Math.round(score.percentile * 100)}% of people`
              : 'Private to this device'
          }
        >
          <span className="text-sm font-semibold text-gold">{score ? Math.round(score.score) : '—'}</span>
        </SettingRow>
      </SectionCard>

      {showLink && link && (
        <Modal
          title="Your private invite"
          onClose={() => setShowLink(false)}
          footer={
            <button type="button" className="btn-primary w-full" onClick={() => setShowLink(false)}>
              Done
            </button>
          }
        >
          <div className="space-y-4">
            <p className="text-sm text-secondary">
              Send this link to someone who needs a safe place. The link doesn’t reveal you — we only ever see how many
              people it’s helped, never who.
            </p>
            <div className="rounded-lg bg-background px-4 py-3 text-center">
              <code className="select-all break-all text-xs text-gold">{link}</code>
            </div>
            <button
              type="button"
              className="btn-secondary w-full"
              onClick={() => {
                void navigator.clipboard?.writeText(link).then(() => flash('Link copied'));
              }}
            >
              Copy link
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
