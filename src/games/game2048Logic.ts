// Tile-based 2048 logic. Each tile keeps a stable id and its previous position
// so the view can animate slides, merges, and spawns. Pure (no React).

export type Direction = 'left' | 'right' | 'up' | 'down';

export const SIZE = 4;
export const WIN_VALUE = 2048;

export interface Position {
  row: number;
  col: number;
}

export interface Tile {
  id: number;
  value: number;
  row: number;
  col: number;
  prev?: Position; // where it slid from this move (for slide animation)
  mergedFrom?: [Tile, Tile]; // the two tiles that combined into this one
  isNew?: boolean; // freshly spawned this move (for pop-in animation)
}

let idCounter = 1;
const nextId = () => idCounter++;

type Cell = Tile | null;
type Grid = Cell[][];

function buildGrid(tiles: Tile[]): Grid {
  const grid: Grid = Array.from({ length: SIZE }, () => Array<Cell>(SIZE).fill(null));
  for (const t of tiles) grid[t.row][t.col] = t;
  return grid;
}

function emptyCells(grid: Grid): Position[] {
  const cells: Position[] = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (!grid[r][c]) cells.push({ row: r, col: c });
    }
  }
  return cells;
}

/** Return a copy of the tiles with one new tile added (2 at 90%, else 4). */
export function addRandomTile(tiles: Tile[]): Tile[] {
  const grid = buildGrid(tiles);
  const cells = emptyCells(grid);
  if (cells.length === 0) return tiles;
  const { row, col } = cells[Math.floor(Math.random() * cells.length)];
  const value = Math.random() < 0.9 ? 2 : 4;
  return [...tiles, { id: nextId(), value, row, col, isNew: true }];
}

export function newGame(): Tile[] {
  return addRandomTile(addRandomTile([]));
}

const VECTORS: Record<Direction, { dr: number; dc: number }> = {
  up: { dr: -1, dc: 0 },
  down: { dr: 1, dc: 0 },
  left: { dr: 0, dc: -1 },
  right: { dr: 0, dc: 1 },
};

/** Traversal order so tiles closest to the target edge move first. */
function traversalOrder(dir: Direction): Position[] {
  const rows = [...Array(SIZE).keys()];
  const cols = [...Array(SIZE).keys()];
  if (dir === 'down') rows.reverse();
  if (dir === 'right') cols.reverse();
  const order: Position[] = [];
  for (const row of rows) for (const col of cols) order.push({ row, col });
  return order;
}

const inBounds = (r: number, c: number) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;

export interface MoveResult {
  tiles: Tile[];
  gained: number;
  moved: boolean;
  won: boolean; // a 2048 tile was formed this move
}

/**
 * Apply a move to the tile list. Returns fresh tile objects carrying `prev`
 * (slide origin), `mergedFrom` (merge animation), and `isNew` metadata.
 * A tile can only take part in one merge per move (standard 2048 rule).
 */
export function move(tiles: Tile[], dir: Direction): MoveResult {
  const { dr, dc } = VECTORS[dir];

  // Work on fresh copies so callers' tiles stay untouched. `prev` starts at the
  // current position and is overwritten as tiles slide.
  const grid: Grid = Array.from({ length: SIZE }, () => Array<Cell>(SIZE).fill(null));
  for (const t of tiles) {
    grid[t.row][t.col] = {
      id: t.id,
      value: t.value,
      row: t.row,
      col: t.col,
      prev: { row: t.row, col: t.col },
    };
  }

  const mergedHere: boolean[][] = Array.from({ length: SIZE }, () => Array(SIZE).fill(false));
  let moved = false;
  let gained = 0;
  let won = false;

  const cellAt = (r: number, c: number): Cell => (inBounds(r, c) ? grid[r][c] : null);

  for (const { row, col } of traversalOrder(dir)) {
    const tile = grid[row][col];
    if (!tile) continue;

    // Slide as far as possible.
    let r = row;
    let c = col;
    while (inBounds(r + dr, c + dc) && cellAt(r + dr, c + dc) === null) {
      r += dr;
      c += dc;
    }

    const ahead = cellAt(r + dr, c + dc);
    if (ahead && ahead.value === tile.value && !mergedHere[r + dr][c + dc]) {
      // Merge into the tile ahead.
      const merged: Tile = {
        id: nextId(),
        value: tile.value * 2,
        row: r + dr,
        col: c + dc,
        mergedFrom: [
          { ...tile, row: r + dr, col: c + dc }, // slides into the merge cell
          { ...ahead }, // already at the merge cell
        ],
      };
      grid[tile.row][tile.col] = null;
      grid[r + dr][c + dc] = merged;
      mergedHere[r + dr][c + dc] = true;
      gained += merged.value;
      if (merged.value >= WIN_VALUE) won = true;
      moved = true;
    } else if (r !== row || c !== col) {
      // Plain slide.
      grid[tile.row][tile.col] = null;
      tile.row = r;
      tile.col = c;
      grid[r][c] = tile;
      moved = true;
    }
  }

  const result: Tile[] = [];
  for (const rowCells of grid) for (const t of rowCells) if (t) result.push(t);
  return { tiles: result, gained, moved, won };
}

/** True when the board is full and no adjacent equal tiles remain. */
export function isGameOver(tiles: Tile[]): boolean {
  const grid = buildGrid(tiles);
  if (emptyCells(grid).length > 0) return false;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const v = grid[r][c]!.value;
      if (c + 1 < SIZE && grid[r][c + 1]!.value === v) return false;
      if (r + 1 < SIZE && grid[r + 1][c]!.value === v) return false;
    }
  }
  return true;
}
