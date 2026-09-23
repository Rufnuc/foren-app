// Wordle logic for the decoy game. Guesses are validated against a curated
// dictionary (see words.ts), the way real Wordle rejects non-words.

import { ALLOWED, ANSWERS } from './words';

export type LetterState = 'correct' | 'present' | 'absent';

export const WORD_LENGTH = 5;
export const MAX_GUESSES = 6;

export { ANSWERS };

export function pickAnswer(): string {
  return ANSWERS[Math.floor(Math.random() * ANSWERS.length)];
}

/** A guess is valid if it's the right length and a known word. */
export function isValidGuess(word: string): boolean {
  return word.length === WORD_LENGTH && ALLOWED.has(word.toLowerCase());
}

/** Two-pass evaluation that handles duplicate letters correctly. */
export function evaluateGuess(guess: string, target: string): LetterState[] {
  const result: LetterState[] = Array(WORD_LENGTH).fill('absent');
  const counts: Record<string, number> = {};
  for (const ch of target) counts[ch] = (counts[ch] ?? 0) + 1;

  // First pass: exact matches.
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (guess[i] === target[i]) {
      result[i] = 'correct';
      counts[guess[i]] -= 1;
    }
  }
  // Second pass: present-but-misplaced, limited by remaining counts.
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (result[i] === 'correct') continue;
    const ch = guess[i];
    if (counts[ch] > 0) {
      result[i] = 'present';
      counts[ch] -= 1;
    }
  }
  return result;
}
