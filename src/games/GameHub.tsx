import { useState, type ComponentType } from 'react';
import type { GameType } from '@/types';
import { Game2048 } from './Game2048';
import { Sudoku } from './Sudoku';
import { Wordle } from './Wordle';
import { Minesweeper } from './Minesweeper';
import { loadActiveGame, saveActiveGame, getStats } from './gameStore';
import { StatsPanel } from './StatsPanel';

interface Entry {
  id: GameType;
  name: string;
  icon: string;
  desc: string;
  Component: ComponentType;
}

const GAMES: Entry[] = [
  { id: 'game2048', name: '2048', icon: '🔢', desc: 'Slide tiles, combine numbers', Component: Game2048 },
  { id: 'sudoku', name: 'Sudoku', icon: '🧩', desc: 'Fill the grid', Component: Sudoku },
  { id: 'wordle', name: 'Wordle', icon: '🔡', desc: 'Guess the word', Component: Wordle },
  { id: 'minesweeper', name: 'Mines', icon: '💣', desc: 'Clear the field', Component: Minesweeper },
];

function summary(id: string): string {
  const s = getStats(id);
  if (!s.played) return 'Not played yet';
  const parts = [`${s.won}/${s.played} won`];
  if (s.streak > 0) parts.push(`streak ${s.streak}`);
  if (s.bestTime != null) parts.push(`best ${s.bestTime}s`);
  return parts.join(' · ');
}

// The decoy "app": a Puzzles home listing every game with its stats, and per-game
// views with a stats/history panel. Reads as a real puzzle collection someone
// actually uses. The unlock gestures live in the GameDisguise wrapper and work
// on both the home and game views.
export function GameHub({ defaultGame }: { defaultGame: GameType }) {
  const [active, setActive] = useState<GameType>(
    () => (loadActiveGame() as GameType | null) ?? defaultGame,
  );
  const [view, setView] = useState<'home' | 'game'>('home');
  const [statsOpen, setStatsOpen] = useState(false);

  const current = GAMES.find((g) => g.id === active) ?? GAMES[0];
  const Current = current.Component;

  const openGame = (id: GameType) => {
    setActive(id);
    saveActiveGame(id);
    setView('game');
  };

  if (view === 'home') {
    return (
      <div className="flex w-full max-w-app flex-col gap-3 px-1">
        <h1 className="mb-1 text-center text-2xl font-bold tracking-wide text-gold">Puzzles</h1>
        {GAMES.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => openGame(g.id)}
            className="card flex items-center gap-4 text-left transition-colors hover:bg-surface/80"
          >
            <span className="text-3xl" aria-hidden="true">{g.icon}</span>
            <span className="flex-1">
              <span className="block font-semibold text-primary">{g.name}</span>
              <span className="block text-xs text-secondary">{g.desc}</span>
              <span className="mt-0.5 block text-[11px] text-gold/80">{summary(g.id)}</span>
            </span>
            <span className="text-gold" aria-hidden="true">→</span>
          </button>
        ))}
        <div className="card flex items-center gap-4 opacity-60">
          <span className="text-3xl" aria-hidden="true">✨</span>
          <span className="flex-1 font-semibold text-primary">More games coming soon</span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex w-full flex-col items-center pt-1">
      <div className="mb-1 flex w-full max-w-app items-center justify-between px-1">
        <button
          type="button"
          onClick={() => setView('home')}
          aria-label="All games"
          className="rounded-lg p-1.5 text-secondary transition-colors hover:text-primary"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <rect x="3" y="3" width="7" height="7" rx="1.5" />
            <rect x="14" y="3" width="7" height="7" rx="1.5" />
            <rect x="3" y="14" width="7" height="7" rx="1.5" />
            <rect x="14" y="14" width="7" height="7" rx="1.5" />
          </svg>
        </button>
        <span className="text-xs font-semibold uppercase tracking-widest text-secondary">
          {current.name}
        </span>
        <button
          type="button"
          onClick={() => setStatsOpen(true)}
          aria-label="Statistics"
          className="rounded-lg p-1.5 text-secondary transition-colors hover:text-primary"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <rect x="3" y="12" width="4" height="9" rx="1" />
            <rect x="10" y="7" width="4" height="14" rx="1" />
            <rect x="17" y="3" width="4" height="18" rx="1" />
          </svg>
        </button>
      </div>

      <Current key={active} />

      {statsOpen && (
        <StatsPanel gameId={active} gameName={current.name} onClose={() => setStatsOpen(false)} />
      )}
    </div>
  );
}
