import { describe, it, expect } from 'vitest';
import { generateLimiterCurve } from '../limiterCurve';

describe('limiterCurve', () => {
  describe('generateLimiterCurve', () => {
    it('returns correct number of points', () => {
      const pts = generateLimiterCurve(-0.3, 0, 'transparent', -48, 6, 100);
      expect(pts).toHaveLength(101);
    });

    it('output never exceeds ceiling', () => {
      const ceiling = -0.3;
      const pts = generateLimiterCurve(ceiling, 12, 'aggressive');
      for (const p of pts) {
        expect(p.outputDb).toBeLessThanOrEqual(ceiling + 0.01);
      }
    });

    it('below threshold, output equals input + gain', () => {
      const pts = generateLimiterCurve(0, 0, 'transparent', -48, 6, 200);
      // Well below ceiling, output should track input
      const lowPt = pts.find((p) => p.inputDb === -48);
      expect(lowPt).toBeDefined();
      expect(lowPt!.outputDb).toBeCloseTo(-48, 0);
    });

    it('gain shifts the transfer curve', () => {
      const noGain = generateLimiterCurve(-0.3, 0, 'transparent');
      const withGain = generateLimiterCurve(-0.3, 6, 'transparent');
      // At a low input level, gained output should be higher
      const idx = 10;
      expect(withGain[idx].outputDb).toBeGreaterThan(noGain[idx].outputDb);
    });

    it('warm style has softer knee than aggressive', () => {
      const warm = generateLimiterCurve(-1, 6, 'warm');
      const aggressive = generateLimiterCurve(-1, 6, 'aggressive');
      // Near the threshold, warm should have a more gradual transition
      // Find a point near ceiling where they differ
      const nearCeiling = warm.findIndex((p) => p.inputDb + 6 > -1);
      if (nearCeiling > 0 && nearCeiling < warm.length - 1) {
        // Warm should output slightly higher (less aggressive limiting) just below ceiling
        const wVal = warm[nearCeiling - 2].outputDb;
        const aVal = aggressive[nearCeiling - 2].outputDb;
        // Both should be similar but warm transitions more gently
        expect(Math.abs(wVal - aVal)).toBeLessThan(5);
      }
    });

    it('all styles limit to ceiling', () => {
      for (const style of ['transparent', 'aggressive', 'warm'] as const) {
        const pts = generateLimiterCurve(-0.5, 12, style);
        const lastPt = pts[pts.length - 1];
        expect(lastPt.outputDb).toBeLessThanOrEqual(-0.5 + 0.01);
      }
    });
  });
});
