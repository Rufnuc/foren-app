// Minesweeper logic. Board is a flat array (row-major). Mines are placed on the
// first reveal, avoiding the clicked cell and its neighbours, so the first click
// is always safe — the standard, fair behaviour.

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface MineConfig {
  rows: number;
  cols: number;
  mines: number;
}

export const CONFIGS: Record<Difficulty, MineConfig> = {
  easy: { rows: 9, cols: 9, mines: 10 },
  medium: { rows: 12, cols: 12, mines: 24 },
  hard: { rows: 14, cols: 14, mines: 40 },
};

export interface Cell {
  mine: boolean;
  revealed: boolean;
  flagged: boolean;
  adj: number; // adjacent mine count
}
export type Board = Cell[];

const neighbours = (i: number, rows: number, cols: number): number[] => {
  const r = Math.floor(i / cols);
  const c = i % cols;
  const out: number[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) out.push(nr * cols + nc);
    }
  }
  return out;
};

export function emptyBoard(cfg: MineConfig): Board {
  return Array.from({ length: cfg.rows * cfg.cols }, () => ({
    mine: false,
    revealed: false,
    flagged: false,
    adj: 0,
  }));
}

/** Place mines avoiding `safe` and its neighbours, then compute adjacency. */
export function placeMines(board: Board, cfg: MineConfig, safe: number): Board {
  const b = board.map((c) => ({ ...c }));
  const forbidden = new Set<number>([safe, ...neighbours(safe, cfg.rows, cfg.cols)]);
  const candidates: number[] = [];
  for (let i = 0; i < b.length; i++) if (!forbidden.has(i)) candidates.push(i);
  // Fisher–Yates partial shuffle to pick `mines` cells.
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  for (const i of candidates.slice(0, cfg.mines)) b[i].mine = true;
  for (let i = 0; i < b.length; i++) {
    if (b[i].mine) continue;
    b[i].adj = neighbours(i, cfg.rows, cfg.cols).filter((n) => b[n].mine).length;
  }
  return b;
}

/** Reveal a cell, flood-filling through zero-adjacency cells. */
export function revealCell(
  board: Board,
  cfg: MineConfig,
  start: number,
): { board: Board; exploded: boolean } {
  const b = board.map((c) => ({ ...c }));
  if (b[start].flagged || b[start].revealed) return { board: b, exploded: false };
  if (b[start].mine) {
    b[start].revealed = true;
    return { board: b, exploded: true };
  }
  const stack = [start];
  while (stack.length) {
    const i = stack.pop()!;
    if (b[i].revealed || b[i].flagged) continue;
    b[i].revealed = true;
    if (b[i].adj === 0) {
      for (const n of neighbours(i, cfg.rows, cfg.cols)) {
        if (!b[n].revealed && !b[n].mine) stack.push(n);
      }
    }
  }
  return { board: b, exploded: false };
}

export function toggleFlag(board: Board, i: number): Board {
  const b = board.map((c) => ({ ...c }));
  if (!b[i].revealed) b[i].flagged = !b[i].flagged;
  return b;
}

/** Won when every non-mine cell is revealed. */
export function isWon(board: Board): boolean {
  return board.every((c) => c.mine || c.revealed);
}

export function remainingMines(board: Board, cfg: MineConfig): number {
  return cfg.mines - board.filter((c) => c.flagged).length;
}

/** Reveal all mines (on loss). */
export function revealMines(board: Board): Board {
  return board.map((c) => (c.mine ? { ...c, revealed: true } : c));
}
