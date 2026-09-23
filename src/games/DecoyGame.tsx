import type { GameType } from '@/types';
import { Game2048 } from './Game2048';
import { Sudoku } from './Sudoku';
import { Wordle } from './Wordle';
import { Minesweeper } from './Minesweeper';

// Renders a single decoy game. Used by the onboarding game preview and the
// first-unlock step. The live lock screen uses GameHub (all games + switcher).
export function DecoyGame({ game }: { game: GameType }) {
  switch (game) {
    case 'sudoku':
      return <Sudoku />;
    case 'wordle':
      return <Wordle />;
    case 'minesweeper':
      return <Minesweeper />;
    case 'game2048':
    default:
      return <Game2048 />;
  }
}
