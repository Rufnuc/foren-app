import type { GameType } from '@/types';
import { Game2048 } from './Game2048';
import { Sudoku } from './Sudoku';
import { Wordle } from './Wordle';

// Renders the chosen decoy game. Used by the lock screen, the onboarding game
// preview, and the first-unlock step so all three stay in sync.
export function DecoyGame({ game }: { game: GameType }) {
  switch (game) {
    case 'sudoku':
      return <Sudoku />;
    case 'wordle':
      return <Wordle />;
    case 'game2048':
    default:
      return <Game2048 />;
  }
}
