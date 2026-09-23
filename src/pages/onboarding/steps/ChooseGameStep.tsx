import { useState } from 'react';
import type { GameType } from '@/types';
import { DecoyGame } from '@/games/DecoyGame';
import { WizardLayout } from '../WizardLayout';
import type { StepProps } from '../types';

const GAMES: Array<{ id: GameType; name: string; blurb: string; icon: string }> = [
  { id: 'game2048', name: '2048', blurb: 'A puzzle game. Slide tiles, combine numbers.', icon: '🔢' },
  { id: 'sudoku', name: 'Sudoku', blurb: 'A number puzzle. Fill in the grid.', icon: '🧩' },
  { id: 'wordle', name: 'Wordle', blurb: 'A word game. Guess the word in 6 tries.', icon: '🔡' },
  { id: 'minesweeper', name: 'Mines', blurb: 'Clear the field without hitting a mine.', icon: '💣' },
];

// Step 1 (spec 1.3): pick the decoy game, then preview it before continuing.
export function ChooseGameStep({ draft, update, onNext }: StepProps) {
  const [selected, setSelected] = useState<GameType>(draft.game);
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <WizardLayout
        step={1}
        total={6}
        title={`You picked ${GAMES.find((g) => g.id === selected)?.name}`}
        subtitle="This is what someone will see if they look at your phone. Have a quick play."
        onBack={() => setConfirming(false)}
      >
        <div className="flex flex-col items-center gap-6">
          <DecoyGame game={selected} />
          <button
            type="button"
            className="btn-primary w-full max-w-xs"
            onClick={() => {
              update({ game: selected });
              onNext();
            }}
          >
            This looks good
          </button>
        </div>
      </WizardLayout>
    );
  }

  return (
    <WizardLayout step={1} total={6} title="Choose your disguise" subtitle="Pick a game to hide your vault.">
      <div className="flex flex-col gap-3">
        {GAMES.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => {
              setSelected(g.id);
              setConfirming(true);
            }}
            className="card flex items-center gap-4 text-left hover:bg-surface/80"
          >
            <span className="text-3xl" aria-hidden="true">{g.icon}</span>
            <span className="flex-1">
              <span className="block font-semibold text-primary">{g.name}</span>
              <span className="block text-sm text-secondary">{g.blurb}</span>
            </span>
            <span className="text-gold" aria-hidden="true">→</span>
          </button>
        ))}

        <div className="card flex items-center gap-4 opacity-60">
          <span className="text-3xl" aria-hidden="true">✨</span>
          <span className="flex-1 font-semibold text-primary">More games coming soon</span>
        </div>
      </div>
    </WizardLayout>
  );
}
