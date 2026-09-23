import { getStats } from './gameStore';

// Compact stats strip shown under a game. Reads fresh each render, so it updates
// whenever the game re-renders after finishing. Hidden until the first game.
export function GameStatsBar({
  gameId,
  labels,
}: {
  gameId: string;
  labels?: { won?: string };
}) {
  const s = getStats(gameId);
  if (s.played === 0) return null;
  return (
    <div className="flex gap-4 text-[11px] text-secondary/80">
      <span>Played {s.played}</span>
      <span>
        {labels?.won ?? 'Won'} {s.won}
      </span>
      <span>
        Streak {s.streak}
        {s.bestStreak > 0 ? ` · best ${s.bestStreak}` : ''}
      </span>
    </div>
  );
}
