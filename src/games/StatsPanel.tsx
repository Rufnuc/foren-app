import { getStats, getHistory } from './gameStore';

function ago(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// Full-screen stats + history for one game. This is where "history" lives:
// aggregate stats, a Wordle-style guess distribution, and a list of recent games.
export function StatsPanel({
  gameId,
  gameName,
  onClose,
}: {
  gameId: string;
  gameName: string;
  onClose: () => void;
}) {
  const stats = getStats(gameId);
  const history = getHistory(gameId);
  const winPct = stats.played ? Math.round((stats.won / stats.played) * 100) : 0;
  const dist = [1, 2, 3, 4, 5, 6].map((g) => history.filter((h) => h.won && h.guesses === g).length);
  const hasGuesses = dist.some((n) => n > 0);
  const maxDist = Math.max(1, ...dist);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-5"
      onClick={onClose}
    >
      <div
        className="card max-h-[86vh] w-full max-w-app overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-primary">{gameName} · Statistics</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-2xl leading-none text-secondary hover:text-primary"
          >
            ×
          </button>
        </div>

        {stats.played === 0 ? (
          <p className="py-10 text-center text-sm text-secondary">No games yet — play one!</p>
        ) : (
          <>
            <div className="grid grid-cols-4 gap-2 text-center">
              <Tile label="Played" value={stats.played} />
              <Tile label="Win %" value={winPct} />
              <Tile label="Streak" value={stats.streak} />
              <Tile label="Best" value={stats.bestStreak} />
            </div>
            {stats.bestTime != null && (
              <p className="mt-2 text-center text-xs text-secondary">
                Best time: <span className="font-semibold text-gold">{stats.bestTime}s</span>
              </p>
            )}

            {hasGuesses && (
              <div className="mt-5">
                <p className="mb-2 text-xs uppercase tracking-wide text-secondary">
                  Guess distribution
                </p>
                <div className="flex flex-col gap-1">
                  {dist.map((count, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-3 text-xs text-secondary">{i + 1}</span>
                      <div
                        className="flex h-5 items-center justify-end rounded bg-plum"
                        style={{ width: `${Math.max(9, (count / maxDist) * 100)}%` }}
                      >
                        <span className="px-1.5 text-[10px] font-semibold text-primary">{count}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-5">
              <p className="mb-2 text-xs uppercase tracking-wide text-secondary">Recent games</p>
              <div className="flex flex-col gap-1">
                {history.slice(0, 12).map((h, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-lg bg-surface px-3 py-1.5 text-sm"
                  >
                    <span className={h.won ? 'font-semibold text-success' : 'font-semibold text-danger'}>
                      {h.won ? '✓ Won' : '✗ Lost'}
                    </span>
                    <span className="text-xs text-secondary">
                      {h.seconds != null ? `${h.seconds}s · ` : ''}
                      {h.guesses ? `${h.guesses}/6 · ` : ''}
                      {ago(h.at)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-surface py-2">
      <div className="text-xl font-bold text-primary">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-secondary">{label}</div>
    </div>
  );
}
