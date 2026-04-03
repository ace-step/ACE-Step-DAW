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

      // Find a point above the threshold, inside the knee region
      // threshold = ceiling = -1, so boosted > -1 means inputDb + 6 > -1
      const aboveThreshold = warm.findIndex((p) => p.inputDb + 6 > -1);
      expect(aboveThreshold).toBeGreaterThan(0);
      expect(aboveThreshold).toBeLessThan(warm.length);

      // Check a point slightly above threshold (inside warm's 4dB knee)
      // Warm has wider knee (4dB) so it starts limiting more gently than aggressive (0.5dB knee)
      const kneeIdx = Math.min(aboveThreshold + 2, warm.length - 2);
      const wVal = warm[kneeIdx].outputDb;
      const aVal = aggressive[kneeIdx].outputDb;
      // Warm should output higher — its wider knee means less gain reduction at this point
      expect(wVal).toBeGreaterThanOrEqual(aVal);
    });

    it('all styles limit to ceiling', () => {
      for (const style of ['transparent', 'aggressive', 'warm'] as const) {
        const pts = generateLimiterCurve(-0.5, 12, style);
        const lastPt = pts[pts.length - 1];
        expect(lastPt.outputDb).toBeLessThanOrEqual(-0.5 + 0.01);
      }
    });

    it('output never exceeds input + gain (no expansion)', () => {
      for (const style of ['transparent', 'aggressive', 'warm'] as const) {
        const gain = 6;
        const pts = generateLimiterCurve(-0.3, gain, style);
        for (const p of pts) {
          expect(p.outputDb).toBeLessThanOrEqual(p.inputDb + gain + 0.01);
        }
      }
    });
  });
});
