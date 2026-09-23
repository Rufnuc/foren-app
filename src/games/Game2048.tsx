import { useCallback, useEffect, useRef, useState } from 'react';
import {
  newGame,
  move,
  addRandomTile,
  isGameOver,
  SIZE,
  type Tile,
  type Direction,
} from './game2048Logic';

// Board geometry (px). Board width = SIZE*CELL + (SIZE+1)*GAP.
const CELL = 70;
const GAP = 10;
const STRIDE = CELL + GAP;
const BOARD = SIZE * CELL + (SIZE + 1) * GAP;

const TILE_COLORS: Record<number, { bg: string; fg: string }> = {
  2: { bg: '#5B3A5C', fg: '#F5F0E8' },
  4: { bg: '#6E4A6F', fg: '#F5F0E8' },
  8: { bg: '#9A6A4F', fg: '#F5F0E8' },
  16: { bg: '#B97B45', fg: '#F5F0E8' },
  32: { bg: '#CC8A3E', fg: '#1A1A1A' },
  64: { bg: '#E8955E', fg: '#1A1A1A' },
  128: { bg: '#E8B96D', fg: '#1A1A1A' },
  256: { bg: '#EDC477', fg: '#1A1A1A' },
  512: { bg: '#F0CE85', fg: '#1A1A1A' },
  1024: { bg: '#F2D894', fg: '#1A1A1A' },
  2048: { bg: '#6BAF7B', fg: '#1A1A1A' },
};
const tileColor = (v: number) => TILE_COLORS[v] ?? { bg: '#57A06A', fg: '#1A1A1A' };
const fontSize = (v: number) => (v < 100 ? 30 : v < 1000 ? 26 : 20);

const SWIPE_THRESHOLD = 24;
const BEST_KEY = 'foren_2048_best';

export function Game2048() {
  const [tiles, setTiles] = useState<Tile[]>(() => newGame());
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(() => Number(localStorage.getItem(BEST_KEY) ?? 0));
  const [over, setOver] = useState(false);
  const [won, setWon] = useState(false);
  const [keepGoing, setKeepGoing] = useState(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (score > best) {
      setBest(score);
      localStorage.setItem(BEST_KEY, String(score));
    }
  }, [score, best]);

  const applyMove = useCallback(
    (dir: Direction) => {
      if (over) return;
      setTiles((prev) => {
        const result = move(prev, dir);
        if (!result.moved) return prev;
        if (result.gained) setScore((s) => s + result.gained);
        if (result.won && !keepGoing) setWon(true);
        const withSpawn = addRandomTile(result.tiles);
        if (isGameOver(withSpawn)) setOver(true);
        return withSpawn;
      });
    },
    [over, keepGoing],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const map: Record<string, Direction> = {
        ArrowLeft: 'left',
        ArrowRight: 'right',
        ArrowUp: 'up',
        ArrowDown: 'down',
      };
      const dir = map[e.key];
      if (dir) {
        e.preventDefault();
        applyMove(dir);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [applyMove]);

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) {
      touchStart.current = null; // multi-touch belongs to the unlock gesture
      return;
    }
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start || e.changedTouches.length !== 1) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_THRESHOLD) return;
    if (Math.abs(dx) > Math.abs(dy)) applyMove(dx > 0 ? 'right' : 'left');
    else applyMove(dy > 0 ? 'down' : 'up');
  };

  const restart = () => {
    setTiles(newGame());
    setScore(0);
    setOver(false);
    setWon(false);
    setKeepGoing(false);
  };

  // Flatten tiles for rendering: merge sources slide in underneath the result.
  const rendered: Array<{ tile: Tile; z: number; anim: 'none' | 'new' | 'merge' }> = [];
  for (const t of tiles) {
    if (t.mergedFrom) {
      rendered.push({ tile: t.mergedFrom[0], z: 1, anim: 'none' });
      rendered.push({ tile: t.mergedFrom[1], z: 1, anim: 'none' });
      rendered.push({ tile: t, z: 2, anim: 'merge' });
    } else {
      rendered.push({ tile: t, z: 1, anim: t.isNew ? 'new' : 'none' });
    }
  }

  return (
    <div className="flex flex-col items-center gap-4 select-none">
      <style>{`
        @keyframes tile2048-new { 0% { transform: scale(0); } 60% { transform: scale(0); } 100% { transform: scale(1); } }
        @keyframes tile2048-merge { 0% { transform: scale(1); } 40% { transform: scale(1.18); } 100% { transform: scale(1); } }
      `}</style>

      <div className="flex items-center justify-between px-1" style={{ width: BOARD }}>
        <h1 className="text-3xl font-bold tracking-tight text-gold">2048</h1>
        <div className="flex gap-2">
          <Stat label="Score" value={score} />
          <Stat label="Best" value={best} />
        </div>
      </div>

      <div
        className="relative rounded-xl bg-[#2a2a2a] touch-none"
        style={{ width: BOARD, height: BOARD, padding: GAP }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* Static background cells */}
        <div
          className="absolute grid"
          style={{
            inset: GAP,
            gridTemplateColumns: `repeat(${SIZE}, ${CELL}px)`,
            gridTemplateRows: `repeat(${SIZE}, ${CELL}px)`,
            gap: GAP,
          }}
        >
          {Array.from({ length: SIZE * SIZE }).map((_, i) => (
            <div key={i} className="rounded-md bg-[#3a3a3a]" />
          ))}
        </div>

        {/* Tile layer */}
        <div className="absolute" style={{ inset: GAP }}>
          {rendered.map(({ tile, z, anim }) => {
            const { bg, fg } = tileColor(tile.value);
            return (
              <div
                key={tile.id}
                className="absolute flex items-center justify-center rounded-md font-bold"
                style={{
                  width: CELL,
                  height: CELL,
                  left: 0,
                  top: 0,
                  backgroundColor: bg,
                  color: fg,
                  fontSize: fontSize(tile.value),
                  zIndex: z,
                  transform: `translate(${tile.col * STRIDE}px, ${tile.row * STRIDE}px)`,
                  transition: 'transform 110ms ease-in-out',
                  animation:
                    anim === 'new'
                      ? 'tile2048-new 180ms ease'
                      : anim === 'merge'
                        ? 'tile2048-merge 160ms ease'
                        : undefined,
                }}
              >
                {tile.value}
              </div>
            );
          })}
        </div>

        {over && (
          <Overlay>
            <p className="text-xl font-semibold text-primary">Game over</p>
            <button type="button" onClick={restart} className="btn-primary">
              New game
            </button>
          </Overlay>
        )}

        {won && !over && (
          <Overlay>
            <p className="text-xl font-semibold text-gold">You win!</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => { setWon(false); setKeepGoing(true); }} className="btn-primary">
                Keep going
              </button>
              <button type="button" onClick={restart} className="rounded-lg border border-white/15 px-4 py-2 text-sm text-primary">
                New game
              </button>
            </div>
          </Overlay>
        )}
      </div>

      <div className="flex items-center justify-between px-1" style={{ width: BOARD }}>
        <p className="text-xs text-secondary">Swipe or use arrow keys.</p>
        <button type="button" onClick={restart} className="text-xs font-semibold text-gold">
          New game
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-[64px] rounded-lg bg-surface px-3 py-1.5 text-center">
      <div className="text-[10px] uppercase tracking-wide text-secondary">{label}</div>
      <div className="text-lg font-semibold leading-tight text-primary">{value}</div>
    </div>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-xl bg-black/70">
      {children}
    </div>
  );
}
