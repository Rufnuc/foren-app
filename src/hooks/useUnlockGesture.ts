import { useEffect, type RefObject } from 'react';

// Detects the discreet "reveal the keypad" gesture on the decoy game.
//
// Primary (mobile, per spec Part 2.1): a two-finger upward swipe. Least
// obvious, easy under stress, and doesn't collide with single-finger play.
//
// The visible corner activator (double-tap / long-press) is handled separately
// in the component so it also works on pointer-only devices.
const TWO_FINGER_UP_THRESHOLD = 70; // px upward

export function useTwoFingerSwipeUp(
  ref: RefObject<HTMLElement>,
  onTrigger: () => void,
): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let startMidY: number | null = null;

    const midY = (t: TouchList) => (t[0].clientY + t[1].clientY) / 2;

    const onStart = (e: TouchEvent) => {
      startMidY = e.touches.length === 2 ? midY(e.touches) : null;
    };

    const onMove = (e: TouchEvent) => {
      if (startMidY === null || e.touches.length !== 2) return;
      if (startMidY - midY(e.touches) > TWO_FINGER_UP_THRESHOLD) {
        startMidY = null;
        onTrigger();
      }
    };

    const onEnd = () => {
      startMidY = null;
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: true });
    el.addEventListener('touchend', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
    };
  }, [ref, onTrigger]);
}
