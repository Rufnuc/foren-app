import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CONFIGS,
  emptyBoard,
  placeMines,
  revealCell,
  toggleFlag,
  isWon,
  remainingMines,
  revealMines,
  type Board,
  type Difficulty,
} from './minesweeper/minesweeperLogic';
import { loadGame, saveGame, clearGame, recordResult, haptic } from './gameStore';
import { GameStatsBar } from './GameStatsBar';

const GAME_ID = 'minesweeper';
const DIFFS: Difficulty[] = ['easy', 'medium', 'hard'];
const NUM_COLOR = ['', '#7FB0E8', '#6BAF7B', '#E8955E', '#C88AE0', '#E8B96D', '#63C6C6', '#D35E5E', '#A89F91'];

type Status = 'playing' | 'won' | 'lost';
interface Saved {
  difficulty: Difficulty;
  board: Board;
  status: Status;
  seconds: number;
  started: boolean;
}

export function Minesweeper() {
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [board, setBoard] = useState<Board>(() => emptyBoard(CONFIGS.easy));
  const [status, setStatus] = useState<Status>('playing');
  const [seconds, setSeconds] = useState(0);
  const [started, setStarted] = useState(false);
  const [flagMode, setFlagMode] = useState(false);
  const pressTimer = useRef<number | null>(null);

  const cfg = CONFIGS[difficulty];

  // Restore a saved game once on mount.
  useEffect(() => {
    const s = loadGame<Saved>(GAME_ID);
    if (s?.board?.length) {
      setDifficulty(s.difficulty);
      setBoard(s.board);
      setStatus(s.status);
      setSeconds(s.seconds);
      setStarted(s.started);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist on change.
  useEffect(() => {
    saveGame<Saved>(GAME_ID, { difficulty, board, status, seconds, started });
  }, [difficulty, board, status, seconds, started]);

  // Timer while playing.
  useEffect(() => {
    if (status !== 'playing' || !started) return;
    const id = window.setInterval(() => setSeconds((s) => Math.min(999, s + 1)), 1000);
    return () => window.clearInterval(id);
  }, [status, started]);

  const newGame = (d: Difficulty = difficulty) => {
    setDifficulty(d);
    setBoard(emptyBoard(CONFIGS[d]));
    setStatus('playing');
    setSeconds(0);
    setStarted(false);
    clearGame(GAME_ID);
  };

  const finish = (result: 'won' | 'lost', next: Board) => {
    setBoard(result === 'lost' ? revealMines(next) : next);
    setStatus(result);
    haptic(result === 'won' ? 30 : 60);
    recordResult(GAME_ID, result === 'won');
  };

  const onReveal = (i: number) => {
    if (status !== 'playing') return;
    if (flagMode) {
      setBoard((b) => toggleFlag(b, i));
      haptic(8);
      return;
    }
    if (board[i].revealed || board[i].flagged) return;
    // First reveal seeds the mines (guaranteed safe).
    let live = board;
    if (!started) {
      live = placeMines(board, cfg, i);
      setStarted(true);
    }
    const { board: next, exploded } = revealCell(live, cfg, i);
    haptic(8);
    if (exploded) return finish('lost', next);
    if (isWon(next)) return finish('won', next);
    setBoard(next);
  };

  const onFlag = (i: number) => {
    if (status !== 'playing' || board[i].revealed) return;
    setBoard((b) => toggleFlag(b, i));
    haptic(8);
  };

  // Reveal is a plain click (reliable across touch/mouse). Long-press flags —
  // when it fires we suppress the click that follows so it doesn't also reveal.
  const longPressed = useRef(false);
  const startPress = (i: number) => {
    longPressed.current = false;
    pressTimer.current = window.setTimeout(() => {
      longPressed.current = true;
      onFlag(i);
      pressTimer.current = null;
    }, 350);
  };
  const endPress = () => {
    if (pressTimer.current !== null) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };
  const onCellClick = (i: number) => {
    if (longPressed.current) {
      longPressed.current = false;
      return;
    }
    onReveal(i);
  };

  const mines = useMemo(() => remainingMines(board, cfg), [board, cfg]);
  const cell = Math.min(34, Math.floor(330 / cfg.cols));

  return (
    <div className="flex flex-col items-center gap-3 select-none">
      <div className="flex w-full max-w-[340px] items-center justify-between">
        <h1 className="text-2xl font-bold tracking-widest text-gold">MINES</h1>
        <div className="flex gap-1">
          {DIFFS.map((d) => (
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

      <div className="flex w-full max-w-[340px] items-center justify-between text-sm text-primary">
        <span className="tabular-nums">💣 {mines}</span>
        <button
          type="button"
          onClick={() => setFlagMode((v) => !v)}
          className={`rounded px-3 py-1 text-xs font-semibold ${flagMode ? 'bg-plum text-primary' : 'bg-surface text-secondary'}`}
        >
          {flagMode ? '🚩 Flagging' : '🚩 Flag'}
        </button>
        <span className="tabular-nums">⏱ {seconds}</span>
      </div>

      <div
        className="grid overflow-hidden rounded-md border-2 border-white/30 touch-none"
        style={{ gridTemplateColumns: `repeat(${cfg.cols}, ${cell}px)` }}
      >
        {board.map((c, i) => {
          const base = c.revealed ? '#232323' : '#3a3a3a';
          return (
            <button
              key={i}
              type="button"
              onClick={() => onCellClick(i)}
              onContextMenu={(e) => {
                e.preventDefault();
                onFlag(i);
              }}
              onPointerDown={() => startPress(i)}
              onPointerUp={endPress}
              onPointerLeave={endPress}
              className="flex items-center justify-center font-bold"
              style={{
                width: cell,
                height: cell,
                fontSize: cell * 0.5,
                backgroundColor: base,
                color: c.revealed && !c.mine ? NUM_COLOR[c.adj] : '#F5F0E8',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              {c.revealed
                ? c.mine
                  ? '💣'
                  : c.adj > 0
                    ? c.adj
                    : ''
                : c.flagged
                  ? '🚩'
                  : ''}
            </button>
          );
        })}
      </div>

      {status !== 'playing' ? (
        <div className="flex flex-col items-center gap-2">
          <p className={`text-sm font-semibold ${status === 'won' ? 'text-success' : 'text-danger'}`}>
            {status === 'won' ? `Cleared in ${seconds}s!` : 'Boom.'}
          </p>
          <button type="button" onClick={() => newGame()} className="btn-primary">
            New game
          </button>
        </div>
      ) : (
        <div className="flex w-full max-w-[340px] items-center justify-between">
          <p className="text-xs text-secondary">Tap to reveal · long-press to flag.</p>
          <button type="button" onClick={() => newGame()} className="text-xs font-semibold text-gold">
            New game
          </button>
        </div>
      )}

      <GameStatsBar gameId={GAME_ID} labels={{ won: 'Cleared' }} />
    </div>
  );
}
