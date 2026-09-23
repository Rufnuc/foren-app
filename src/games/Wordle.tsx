import { useCallback, useEffect, useRef, useState } from 'react';
import {
  pickAnswer,
  dailyAnswer,
  evaluateGuess,
  isValidGuess,
  WORD_LENGTH,
  MAX_GUESSES,
  type LetterState,
} from './wordle/wordleLogic';
import {
  loadGame,
  saveGame,
  clearGame,
  recordResult,
  haptic,
  daySeed,
  isDailyDone,
  markDailyDone,
} from './gameStore';
import { GameStatsBar } from './GameStatsBar';

const GAME_ID = 'wordle';
type Mode = 'daily' | 'free';
interface Saved {
  mode: Mode;
  seed: number;
  target: string;
  guesses: string[];
  current: string;
  done: null | 'won' | 'lost';
}

const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];

const STATE_STYLE: Record<LetterState, { bg: string; fg: string }> = {
  correct: { bg: '#6BAF7B', fg: '#1A1A1A' },
  present: { bg: '#E8B96D', fg: '#1A1A1A' },
  absent: { bg: '#2A2A2A', fg: '#A89F91' },
};

// Playable Wordle decoy. Single-finger / pointer interactions only; the
// two-finger unlock gesture is handled by the GameDisguise wrapper.
export function Wordle() {
  // Restore a valid saved game: a free game, or today's daily (not a stale one).
  const [saved] = useState(() => {
    const s = loadGame<Saved>(GAME_ID);
    if (s && (s.mode === 'free' || (s.mode === 'daily' && s.seed === daySeed()))) return s;
    return null;
  });
  const [mode, setMode] = useState<Mode>(() => saved?.mode ?? (isDailyDone(GAME_ID) ? 'free' : 'daily'));
  const [seed, setSeed] = useState(() => saved?.seed ?? (mode === 'daily' ? daySeed() : 0));
  const [target, setTarget] = useState(() =>
    saved?.target ?? (mode === 'daily' ? dailyAnswer(daySeed()) : pickAnswer()),
  );
  const [guesses, setGuesses] = useState<string[]>(() => saved?.guesses ?? []);
  const [current, setCurrent] = useState(() => saved?.current ?? '');
  const [done, setDone] = useState<null | 'won' | 'lost'>(() => saved?.done ?? null);
  const [toast, setToast] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const toastTimer = useRef<number>();

  // Resume across launches.
  useEffect(() => {
    saveGame<Saved>(GAME_ID, { mode, seed, target, guesses, current, done });
  }, [mode, seed, target, guesses, current, done]);

  const flashToast = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 1400);
  }, []);

  const startMode = (m: Mode) => {
    clearGame(GAME_ID);
    setMode(m);
    const sd = m === 'daily' ? daySeed() : 0;
    setSeed(sd);
    setTarget(m === 'daily' ? dailyAnswer(sd) : pickAnswer());
    setGuesses([]);
    setCurrent('');
    setDone(null);
    setToast(null);
  };

  // "New game": daily can't be replayed, so it moves to a fresh practice word.
  const reset = () => startMode('free');

  const submit = useCallback(() => {
    if (current.length !== WORD_LENGTH) {
      flashToast('Not enough letters');
      setShake(true);
      haptic(15);
      return;
    }
    if (!isValidGuess(current)) {
      flashToast('Not in word list');
      setShake(true);
      haptic(15);
      return;
    }
    const next = [...guesses, current];
    setGuesses(next);
    if (current === target) {
      setDone('won');
      flashToast('Splendid!');
      recordResult(GAME_ID, true, { guesses: next.length });
      if (mode === 'daily') markDailyDone(GAME_ID);
      haptic(30);
    } else if (next.length >= MAX_GUESSES) {
      setDone('lost');
      flashToast(target.toUpperCase());
      recordResult(GAME_ID, false);
      if (mode === 'daily') markDailyDone(GAME_ID);
      haptic(50);
    }
    setCurrent('');
  }, [current, guesses, target, mode, flashToast]);

  const press = useCallback(
    (key: string) => {
      if (done) return;
      if (key === 'enter') submit();
      else if (key === 'del') setCurrent((c) => c.slice(0, -1));
      else if (/^[a-z]$/.test(key) && current.length < WORD_LENGTH) setCurrent((c) => c + key);
    },
    [done, submit, current.length],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') press('enter');
      else if (e.key === 'Backspace') press('del');
      else if (/^[a-zA-Z]$/.test(e.key)) press(e.key.toLowerCase());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [press]);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  // Best-known state per letter for keyboard coloring.
  const keyState: Record<string, LetterState> = {};
  const rank: Record<LetterState, number> = { absent: 0, present: 1, correct: 2 };
  for (const g of guesses) {
    const states = evaluateGuess(g, target);
    g.split('').forEach((ch, i) => {
      if (!keyState[ch] || rank[states[i]] > rank[keyState[ch]]) keyState[ch] = states[i];
    });
  }

  const activeRow = guesses.length;

  return (
    <div className="relative flex flex-col items-center gap-4 select-none">
      <style>{`
        @keyframes wordle-flip { 0% { transform: rotateX(0); } 50% { transform: rotateX(-90deg); } 100% { transform: rotateX(0); } }
        @keyframes wordle-shake { 0%,100% { transform: translateX(0); } 20% { transform: translateX(-6px); } 40% { transform: translateX(6px); } 60% { transform: translateX(-4px); } 80% { transform: translateX(4px); } }
      `}</style>

      <h1 className="text-2xl font-bold tracking-widest text-gold">WORDLE</h1>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => startMode('daily')}
          className={`rounded px-3 py-1 text-xs font-semibold ${mode === 'daily' ? 'bg-plum text-primary' : 'bg-surface text-secondary'}`}
        >
          Daily{isDailyDone(GAME_ID) ? ' ✓' : ''}
        </button>
        <button
          type="button"
          onClick={() => startMode('free')}
          className={`rounded px-3 py-1 text-xs font-semibold ${mode === 'free' ? 'bg-plum text-primary' : 'bg-surface text-secondary'}`}
        >
          Practice
        </button>
      </div>

      {toast && (
        <div className="absolute top-10 z-20 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-background shadow-lg">
          {toast}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        {Array.from({ length: MAX_GUESSES }).map((_, r) => {
          const guess = guesses[r];
          const states = guess ? evaluateGuess(guess, target) : null;
          const letters = guess ?? (r === activeRow ? current : '');
          const isReveal = r === activeRow - 1; // most recently submitted row
          const isActive = r === activeRow;
          return (
            <div
              key={r}
              className="flex gap-1.5"
              style={
                isActive && shake
                  ? { animation: 'wordle-shake 400ms ease' }
                  : undefined
              }
              onAnimationEnd={() => isActive && setShake(false)}
            >
              {Array.from({ length: WORD_LENGTH }).map((_, c) => {
                const ch = letters[c] ?? '';
                const st = states?.[c];
                const style = st ? STATE_STYLE[st] : { bg: 'transparent', fg: '#F5F0E8' };
                const filledEmpty = !st && ch; // typed but not yet submitted
                return (
                  <div
                    key={c}
                    className="flex h-12 w-12 items-center justify-center rounded border text-xl font-bold uppercase"
                    style={{
                      backgroundColor: style.bg,
                      color: style.fg,
                      borderColor: filledEmpty ? '#5B3A5C' : 'rgba(255,255,255,0.15)',
                      animation: isReveal ? `wordle-flip 500ms ease ${c * 120}ms both` : undefined,
                    }}
                  >
                    {ch}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {done && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-sm text-primary">
            {done === 'won'
              ? mode === 'daily'
                ? 'Nice — today’s puzzle done!'
                : 'Nice!'
              : `The word was ${target.toUpperCase()}`}
          </p>
          <button type="button" onClick={reset} className="btn-primary">
            {mode === 'daily' ? 'Practice word' : 'New game'}
          </button>
        </div>
      )}

      <div className="flex w-full max-w-sm flex-col gap-1.5">
        {ROWS.map((row, i) => (
          <div key={i} className="flex justify-center gap-1">
            {i === 2 && (
              <button
                type="button"
                onClick={() => press('enter')}
                className="rounded bg-surface px-2 py-3 text-xs font-semibold text-primary"
              >
                ENTER
              </button>
            )}
            {row.split('').map((ch) => {
              const st = keyState[ch];
              const style = st ? STATE_STYLE[st] : { bg: '#2A2A2A', fg: '#F5F0E8' };
              return (
                <button
                  key={ch}
                  type="button"
                  onClick={() => press(ch)}
                  className="h-12 w-8 rounded text-sm font-semibold uppercase"
                  style={{ backgroundColor: style.bg, color: style.fg }}
                >
                  {ch}
                </button>
              );
            })}
            {i === 2 && (
              <button
                type="button"
                onClick={() => press('del')}
                className="rounded bg-surface px-2 py-3 text-xs font-semibold text-primary"
              >
                DEL
              </button>
            )}
          </div>
        ))}
      </div>

      <GameStatsBar gameId={GAME_ID} />
    </div>
  );
}
