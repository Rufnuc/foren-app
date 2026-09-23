import { GameDisguise } from '@/components';

// The app's resting state when a vault exists but is locked: just the decoy
// game. Everything (gesture, keypad, unlock) lives inside GameDisguise.
export function LockScreen() {
  return <GameDisguise />;
}
