import { useState, type ComponentType } from 'react';
import type { GameType } from '@/types';
import { Game2048 } from './Game2048';
import { Sudoku } from './Sudoku';
import { Wordle } from './Wordle';
import { Minesweeper } from './Minesweeper';
import { loadActiveGame, saveActiveGame } from './gameStore';

interface Entry {
  id: GameType;
  name: string;
  icon: string;
  Component: ComponentType;
}

const GAMES: Entry[] = [
  { id: 'game2048', name: '2048', icon: '🔢', Component: Game2048 },
  { id: 'sudoku', name: 'Sudoku', icon: '🧩', Component: Sudoku },
  { id: 'wordle', name: 'Wordle', icon: '🔡', Component: Wordle },
  { id: 'minesweeper', name: 'Mines', icon: '💣', Component: Minesweeper },
];

// The decoy "app": renders the active game with a discreet switcher so all games
// are reachable — making the disguise read as a real puzzle collection someone
// uses, not a single stub. The active game persists across launches. The unlock
// gestures live in the GameDisguise wrapper around this and are unaffected.
export function GameHub({ defaultGame }: { defaultGame: GameType }) {
  const [active, setActive] = useState<GameType>(
    () => (loadActiveGame() as GameType | null) ?? defaultGame,
  );
  const [picking, setPicking] = useState(false);

  const current = GAMES.find((g) => g.id === active) ?? GAMES[0];
  const Current = current.Component;

  const choose = (id: GameType) => {
    setActive(id);
    saveActiveGame(id);
    setPicking(false);
  };

  return (
    <div className="relative flex w-full flex-col items-center pt-1">
      {/* Discreet games button (top-right; the top-left corner is the unlock activator). */}
      <button
        type="button"
        aria-label="Games"
        onClick={() => setPicking(true)}
        className="absolute right-2 top-0 z-10 rounded-lg p-2 text-secondary transition-colors hover:text-primary"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </svg>
      </button>

      <Current key={active} />

      {picking && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 p-6"
          onClick={() => setPicking(false)}
        >
          <div className="card w-full max-w-app" onClick={(e) => e.stopPropagation()}>
            <p className="mb-3 text-center text-sm font-semibold text-primary">Choose a game</p>
            <div className="grid grid-cols-2 gap-3">
              {GAMES.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => choose(g.id)}
                  className={`flex flex-col items-center gap-2 rounded-xl p-4 transition-colors ${
                    g.id === active ? 'bg-plum text-primary' : 'bg-surface text-secondary hover:text-primary'
                  }`}
                >
                  <span className="text-3xl" aria-hidden="true">{g.icon}</span>
                  <span className="text-sm font-semibold">{g.name}</span>
                </button>
              ))}
              <div className="col-span-2 flex items-center justify-center gap-2 rounded-xl bg-surface/50 p-3 text-secondary/70">
                <span aria-hidden="true">✨</span>
                <span className="text-xs">More games coming soon</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
