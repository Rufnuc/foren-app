// Shared, localStorage-backed persistence + stats for the decoy games. Every
// access is best-effort (private windows / cleared storage must never crash the
// game). Nothing here is sensitive — it is ordinary puzzle state, kept so the
// app reads as a real game someone actually plays (resumable boards, streaks).

const NS = 'foren_game_';

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(NS + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(NS + key, JSON.stringify(value));
  } catch {
    /* storage unavailable — game still works, just won't resume */
  }
}
function remove(key: string): void {
  try {
    localStorage.removeItem(NS + key);
  } catch {
    /* ignore */
  }
}

// ── Saved board / in-progress state, per game ──────────────────────────────
export function loadGame<T>(gameId: string): T | null {
  return read<T>(`state_${gameId}`);
}
export function saveGame<T>(gameId: string, state: T): void {
  write(`state_${gameId}`, state);
}
export function clearGame(gameId: string): void {
  remove(`state_${gameId}`);
}

// ── Stats / streaks / history, per game ────────────────────────────────────
export interface GameStats {
  played: number;
  won: number;
  streak: number;
  bestStreak: number;
  bestTime?: number; // seconds (timed games), best winning time
}
const EMPTY: GameStats = { played: 0, won: 0, streak: 0, bestStreak: 0 };

export interface HistoryEntry {
  won: boolean;
  at: number; // epoch ms
  seconds?: number;
  guesses?: number; // Wordle: which guess number won (1–6)
}
const HISTORY_MAX = 30;

export function getStats(gameId: string): GameStats {
  return read<GameStats>(`stats_${gameId}`) ?? { ...EMPTY };
}

export function getHistory(gameId: string): HistoryEntry[] {
  return read<HistoryEntry[]>(`hist_${gameId}`) ?? [];
}

/** Record a finished game (updates stats + prepends a history entry). */
export function recordResult(
  gameId: string,
  won: boolean,
  opts?: { seconds?: number; guesses?: number },
): GameStats {
  const s = getStats(gameId);
  const streak = won ? s.streak + 1 : 0;
  const next: GameStats = {
    played: s.played + 1,
    won: s.won + (won ? 1 : 0),
    streak,
    bestStreak: Math.max(s.bestStreak, streak),
    bestTime:
      won && opts?.seconds != null ? Math.min(s.bestTime ?? Infinity, opts.seconds) : s.bestTime,
  };
  write(`stats_${gameId}`, next);

  const entry: HistoryEntry = { won, at: Date.now(), seconds: opts?.seconds, guesses: opts?.guesses };
  write(`hist_${gameId}`, [entry, ...getHistory(gameId)].slice(0, HISTORY_MAX));
  return next;
}

// ── Which game the hub is currently showing ────────────────────────────────
export function loadActiveGame(): string | null {
  return read<string>('active');
}
export function saveActiveGame(gameId: string): void {
  write('active', gameId);
}

// ── Daily seed: same value all day, rolls over at local midnight ───────────
export function daySeed(): number {
  const now = new Date();
  return Math.floor((now.getTime() - now.getTimezoneOffset() * 60000) / 86400000);
}

// Whether today's daily puzzle for a game has been completed.
export function isDailyDone(gameId: string): boolean {
  return read<number>(`daily_${gameId}`) === daySeed();
}
export function markDailyDone(gameId: string): void {
  write(`daily_${gameId}`, daySeed());
}

// A tiny deterministic PRNG (mulberry32) for daily puzzles.
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Light haptic feedback where supported (no-op elsewhere). Never throws.
export function haptic(ms = 12): void {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* ignore */
  }
}
