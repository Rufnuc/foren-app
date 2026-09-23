// Sudoku generation + validation for the decoy game. 0 = empty cell.
//
// Puzzles are dug from a full solution one cell at a time, keeping a removal
// only if the puzzle still has exactly ONE solution. That guarantees every
// generated puzzle is solvable and has a unique answer (a real Sudoku), which
// the old "remove N random cells" approach did not.

export type Grid = number[]; // length 81, row-major
export type Difficulty = 'easy' | 'medium' | 'hard';

const HOLES: Record<Difficulty, number> = {
  easy: 40,
  medium: 48,
  hard: 54,
};

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function canPlace(g: Grid, idx: number, val: number): boolean {
  const row = Math.floor(idx / 9);
  const col = idx % 9;
  for (let i = 0; i < 9; i++) {
    if (g[row * 9 + i] === val) return false; // row
    if (g[i * 9 + col] === val) return false; // col
  }
  const br = Math.floor(row / 3) * 3;
  const bc = Math.floor(col / 3) * 3;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      if (g[(br + r) * 9 + (bc + c)] === val) return false; // box
    }
  }
  return true;
}

/** Fill a grid completely via randomized backtracking. */
function fillSolution(g: Grid): boolean {
  const idx = g.indexOf(0);
  if (idx === -1) return true;
  for (const val of shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9])) {
    if (canPlace(g, idx, val)) {
      g[idx] = val;
      if (fillSolution(g)) return true;
      g[idx] = 0;
    }
  }
  return false;
}

/** Count solutions, stopping early once `limit` is reached (mutates a copy). */
function countSolutions(g: Grid, limit = 2): number {
  const idx = g.indexOf(0);
  if (idx === -1) return 1;
  let count = 0;
  for (let val = 1; val <= 9; val++) {
    if (canPlace(g, idx, val)) {
      g[idx] = val;
      count += countSolutions(g, limit);
      g[idx] = 0;
      if (count >= limit) break;
    }
  }
  return count;
}

export interface Puzzle {
  puzzle: Grid;
  solution: Grid;
  givens: boolean[];
  difficulty: Difficulty;
}

/**
 * Generate a puzzle with a guaranteed-unique solution for the given difficulty.
 * Digs holes in random order, restoring any removal that would make the puzzle
 * ambiguous. The final hole count may fall a little short of the target when
 * uniqueness blocks further digging; the puzzle is always valid either way.
 */
export function generatePuzzle(difficulty: Difficulty = 'medium'): Puzzle {
  const solution: Grid = Array(81).fill(0);
  fillSolution(solution);

  const puzzle = solution.slice();
  const target = HOLES[difficulty];
  let holes = 0;
  for (const cell of shuffle([...Array(81).keys()])) {
    if (holes >= target) break;
    const saved = puzzle[cell];
    puzzle[cell] = 0;
    if (countSolutions(puzzle.slice(), 2) !== 1) {
      puzzle[cell] = saved; // removal broke uniqueness; keep the clue
    } else {
      holes += 1;
    }
  }

  const givens = puzzle.map((v) => v !== 0);
  return { puzzle, solution, givens, difficulty };
}

/** Indices that conflict with another filled cell in the same row/col/box. */
export function findConflicts(g: Grid): Set<number> {
  const conflicts = new Set<number>();
  const mark = (cells: number[]) => {
    const seen: Record<number, number[]> = {};
    for (const i of cells) {
      const v = g[i];
      if (v === 0) continue;
      (seen[v] ??= []).push(i);
    }
    for (const v in seen) if (seen[v].length > 1) seen[v].forEach((i) => conflicts.add(i));
  };
  for (let r = 0; r < 9; r++) mark([...Array(9).keys()].map((c) => r * 9 + c));
  for (let c = 0; c < 9; c++) mark([...Array(9).keys()].map((r) => r * 9 + c));
  for (let b = 0; b < 9; b++) {
    const br = Math.floor(b / 3) * 3;
    const bc = (b % 3) * 3;
    const cells: number[] = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) cells.push((br + r) * 9 + (bc + c));
    mark(cells);
  }
  return conflicts;
}

export function isSolved(g: Grid): boolean {
  return !g.includes(0) && findConflicts(g).size === 0;
}

/** Peers of a cell: same row, column, or box (excluding itself). */
export function peersOf(idx: number): Set<number> {
  const peers = new Set<number>();
  const row = Math.floor(idx / 9);
  const col = idx % 9;
  for (let i = 0; i < 9; i++) {
    peers.add(row * 9 + i);
    peers.add(i * 9 + col);
  }
  const br = Math.floor(row / 3) * 3;
  const bc = Math.floor(col / 3) * 3;
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) peers.add((br + r) * 9 + (bc + c));
  peers.delete(idx);
  return peers;
}

/** Count how many of each digit 1-9 are still left to place (9 each total). */
export function remainingCounts(g: Grid): Record<number, number> {
  const counts: Record<number, number> = { 1: 9, 2: 9, 3: 9, 4: 9, 5: 9, 6: 9, 7: 9, 8: 9, 9: 9 };
  for (const v of g) if (v !== 0) counts[v] -= 1;
  return counts;
}
