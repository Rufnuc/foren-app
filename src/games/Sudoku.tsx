import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  generatePuzzle,
  findConflicts,
  isSolved,
  peersOf,
  remainingCounts,
  type Puzzle,
  type Difficulty,
} from './sudoku/sudokuLogic';

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

// Playable Sudoku decoy. Tap a cell then a number, or use the keyboard.
// Pointer/single-touch only; the unlock gesture lives in the GameDisguise wrapper.
export function Sudoku() {
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [game, setGame] = useState<Puzzle>(() => generatePuzzle('easy'));
  const [board, setBoard] = useState<number[]>(() => game.puzzle.slice());
  const [notes, setNotes] = useState<Set<number>[]>(() =>
    Array.from({ length: 81 }, () => new Set<number>()),
  );
  const [selected, setSelected] = useState<number | null>(null);
  const [notesMode, setNotesMode] = useState(false);

  const conflicts = useMemo(() => findConflicts(board), [board]);
  const solved = useMemo(() => isSolved(board), [board]);
  const remaining = useMemo(() => remainingCounts(board), [board]);
  const peers = useMemo(() => (selected === null ? new Set<number>() : peersOf(selected)), [selected]);
  const selectedValue = selected === null ? 0 : board[selected];

  const newGame = (d: Difficulty) => {
    const p = generatePuzzle(d);
    setDifficulty(d);
    setGame(p);
    setBoard(p.puzzle.slice());
    setNotes(Array.from({ length: 81 }, () => new Set<number>()));
    setSelected(null);
  };

  const inputNumber = useCallback(
    (val: number) => {
      if (selected === null || game.givens[selected]) return;
      if (notesMode && val !== 0) {
        setNotes((prev) => {
          const next = prev.slice();
          const set = new Set(next[selected]);
          set.has(val) ? set.delete(val) : set.add(val);
          next[selected] = set;
          return next;
        });
        return;
      }
      setBoard((b) => {
        const next = b.slice();
        next[selected] = val;
        return next;
      });
      // Placing a real value clears that cell's pencil marks.
      if (val !== 0) {
        setNotes((prev) => {
          const next = prev.slice();
          next[selected] = new Set();
          return next;
        });
      }
    },
    [selected, game.givens, notesMode],
  );

  const hint = () => {
    if (selected === null || game.givens[selected] || board[selected] === game.solution[selected]) {
      return;
    }
    setBoard((b) => {
      const next = b.slice();
      next[selected] = game.solution[selected];
      return next;
    });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^[1-9]$/.test(e.key)) inputNumber(Number(e.key));
      else if (e.key === 'Backspace' || e.key === '0' || e.key === 'Delete') inputNumber(0);
      else if (e.key === 'n' || e.key === 'N') setNotesMode((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [inputNumber]);

  return (
    <div className="flex flex-col items-center gap-3 select-none">
      <div className="flex w-full max-w-[330px] items-center justify-between">
        <h1 className="text-2xl font-bold tracking-widest text-gold">SUDOKU</h1>
        <div className="flex gap-1">
          {DIFFICULTIES.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => newGame(d)}
              className={`rounded px-2 py-1 text-[11px] font-semibold capitalize ${
                d === difficulty ? 'bg-plum text-primary' : 'bg-surface text-secondary'
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-9 overflow-hidden rounded-md border-2 border-white/40">
        {board.map((v, i) => {
          const row = Math.floor(i / 9);
          const col = i % 9;
          const isGiven = game.givens[i];
          const isSel = selected === i;
          const isPeer = peers.has(i);
          const sameNum = selectedValue !== 0 && v === selectedValue && !isSel;
          const conflict = conflicts.has(i);

          let bg = '#2A2A2A';
          if (isSel) bg = '#5B3A5C';
          else if (sameNum) bg = 'rgba(91,58,92,0.55)';
          else if (isPeer) bg = 'rgba(255,255,255,0.06)';

          let color = isGiven ? '#F5F0E8' : '#E8B96D';
          if (conflict) color = '#D35E5E';

          return (
            <button
              key={i}
              type="button"
              onClick={() => setSelected(i)}
              className="flex h-9 w-9 items-center justify-center text-lg font-semibold"
              style={{
                backgroundColor: bg,
                color,
                fontWeight: isGiven ? 700 : 500,
                borderRight: col % 3 === 2 && col !== 8 ? '2px solid rgba(255,255,255,0.4)' : '1px solid rgba(255,255,255,0.08)',
                borderBottom: row % 3 === 2 && row !== 8 ? '2px solid rgba(255,255,255,0.4)' : '1px solid rgba(255,255,255,0.08)',
              }}
            >
              {v !== 0 ? (
                v
              ) : notes[i].size > 0 ? (
                <span className="grid grid-cols-3 gap-0 text-[8px] leading-[10px] text-secondary">
                  {Array.from({ length: 9 }, (_, d) => (
                    <span key={d} className="h-[10px] w-[10px] text-center">
                      {notes[i].has(d + 1) ? d + 1 : ''}
                    </span>
                  ))}
                </span>
              ) : (
                ''
              )}
            </button>
          );
        })}
      </div>

      {solved ? (
        <div className="flex flex-col items-center gap-2">
          <p className="text-sm font-semibold text-success">Solved! Nicely done.</p>
          <button type="button" onClick={() => newGame(difficulty)} className="btn-primary">
            New game
          </button>
        </div>
      ) : (
        <>
          {/* Number pad with remaining counts */}
          <div className="grid grid-cols-9 gap-1" style={{ width: 330 }}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => {
              const done = remaining[n] <= 0;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => inputNumber(n)}
                  className={`flex h-11 flex-col items-center justify-center rounded ${
                    done ? 'bg-surface/40 text-secondary/40' : 'bg-surface text-primary'
                  }`}
                >
                  <span className="text-lg font-semibold leading-none">{n}</span>
                  <span className="text-[8px] leading-none text-secondary">{Math.max(0, remaining[n])}</span>
                </button>
              );
            })}
          </div>

          {/* Controls */}
          <div className="flex gap-2" style={{ width: 330 }}>
            <ControlButton onClick={() => inputNumber(0)}>Erase</ControlButton>
            <ControlButton onClick={() => setNotesMode((v) => !v)} active={notesMode}>
              Notes {notesMode ? 'On' : 'Off'}
            </ControlButton>
            <ControlButton onClick={hint}>Hint</ControlButton>
            <ControlButton onClick={() => newGame(difficulty)}>New</ControlButton>
          </div>
        </>
      )}
    </div>
  );
}

function ControlButton({
  children,
  onClick,
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded py-2 text-xs font-semibold ${
        active ? 'bg-plum text-primary' : 'bg-surface text-secondary'
      }`}
    >
      {children}
    </button>
  );
}
