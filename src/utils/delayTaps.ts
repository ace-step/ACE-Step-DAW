/**
 * delayTaps.ts — Pure math for delay tap timeline visualization.
 *
 * Models repeating delay echoes decaying by feedback amount each repeat.
 */

export interface DelayTap {
  time: number;    // Time in seconds (position on timeline)
  level: number;   // Amplitude 0–1
  repeat: number;  // Repeat index (0 = first tap)
  isWarning: boolean; // True when feedback is dangerously high
}

/** Level of tap at repeat index n given feedback factor */
export function tapLevelAtRepeat(n: number, feedback: number): number {
  return Math.pow(feedback, n);
}

/** Minimum audible level (below this we stop generating taps) */
const MIN_LEVEL = 0.03;

/**
 * Generate delay tap events for visualization.
 * @param delayTime  Delay time in seconds (time between taps)
 * @param feedback   Feedback amount 0–0.95
 * @param displayEnd Maximum time to show (seconds)
 */
export function generateDelayTaps(
  delayTime: number,
  feedback: number,
  displayEnd: number,
): DelayTap[] {
  const taps: DelayTap[] = [];
  const isHighFeedback = feedback > 0.9;
  let n = 0;

  while (true) {
    const time = delayTime * (n + 1);
    if (time > displayEnd) break;

    const level = tapLevelAtRepeat(n, feedback);
    if (level < MIN_LEVEL && n > 0) break;

    taps.push({
      time,
      level,
      repeat: n,
      isWarning: isHighFeedback,
    });

    n++;
    // Safety: no more than 32 taps
    if (n >= 32) break;
  }

  return taps;
}
