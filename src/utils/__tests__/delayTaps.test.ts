import { describe, it, expect } from 'vitest';
import { generateDelayTaps, tapLevelAtRepeat } from '../delayTaps';

describe('delayTaps', () => {
  describe('tapLevelAtRepeat', () => {
    it('first tap (n=0) is always at full level', () => {
      expect(tapLevelAtRepeat(0, 0.5)).toBe(1);
      expect(tapLevelAtRepeat(0, 0.9)).toBe(1);
      expect(tapLevelAtRepeat(0, 0)).toBe(1);
    });

    it('level decays by feedback factor each repeat', () => {
      // n=1 → feedback^1, n=2 → feedback^2
      expect(tapLevelAtRepeat(1, 0.5)).toBe(0.5);
      expect(tapLevelAtRepeat(2, 0.5)).toBeCloseTo(0.25, 6);
      expect(tapLevelAtRepeat(3, 0.5)).toBeCloseTo(0.125, 6);
    });

    it('at feedback=0, only first tap has level', () => {
      expect(tapLevelAtRepeat(0, 0)).toBe(1);
      expect(tapLevelAtRepeat(1, 0)).toBe(0);
      expect(tapLevelAtRepeat(5, 0)).toBe(0);
    });

    it('at high feedback, level stays high', () => {
      expect(tapLevelAtRepeat(3, 0.9)).toBeCloseTo(0.9 ** 3, 6);
      expect(tapLevelAtRepeat(3, 0.9)).toBeGreaterThan(0.5);
    });

    it('level is always in [0, 1]', () => {
      for (let n = 0; n <= 10; n++) {
        for (let fb = 0; fb <= 1; fb += 0.1) {
          const v = tapLevelAtRepeat(n, fb);
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(1 + 1e-9);
        }
      }
    });

    it('level is monotonically non-increasing with repeat index', () => {
      const fb = 0.7;
      let prev = 1;
      for (let n = 0; n <= 10; n++) {
        const v = tapLevelAtRepeat(n, fb);
        expect(v).toBeLessThanOrEqual(prev + 1e-9);
        prev = v;
      }
    });
  });

  describe('generateDelayTaps', () => {
    it('generates at least one tap for any non-zero time', () => {
      const taps = generateDelayTaps(0.25, 0.5, 2);
      expect(taps.length).toBeGreaterThanOrEqual(1);
    });

    it('first tap is at delayTime', () => {
      const taps = generateDelayTaps(0.25, 0.5, 2);
      expect(taps[0].time).toBeCloseTo(0.25, 4);
    });

    it('taps are evenly spaced by delayTime', () => {
      const taps = generateDelayTaps(0.3, 0.6, 2);
      if (taps.length >= 2) {
        expect(taps[1].time).toBeCloseTo(0.6, 4);
        if (taps.length >= 3) {
          expect(taps[2].time).toBeCloseTo(0.9, 4);
        }
      }
    });

    it('levels decay correctly', () => {
      const taps = generateDelayTaps(0.25, 0.5, 2);
      expect(taps[0].level).toBe(1);
      if (taps.length >= 2) {
        expect(taps[1].level).toBeCloseTo(0.5, 4);
      }
    });

    it('stops generating taps when level drops below threshold', () => {
      // With feedback=0, only one tap
      const taps = generateDelayTaps(0.25, 0, 2);
      expect(taps).toHaveLength(1);
    });

    it('stops when time exceeds displayEnd', () => {
      const taps = generateDelayTaps(0.3, 0.9, 2);
      for (const t of taps) {
        expect(t.time).toBeLessThanOrEqual(2 + 1e-9);
      }
    });

    it('near-infinite feedback (>0.9) is flagged', () => {
      const taps = generateDelayTaps(0.25, 0.95, 2);
      expect(taps.some(t => t.isWarning)).toBe(true);
    });

    it('normal feedback does not trigger warning', () => {
      const taps = generateDelayTaps(0.25, 0.5, 2);
      expect(taps.every(t => !t.isWarning)).toBe(true);
    });
  });
});
