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

    it('warm style has wider knee than aggressive', () => {
      const warm = generateLimiterCurve(-1, 0, 'warm');
      const aggressive = generateLimiterCurve(-1, 0, 'aggressive');

      // Centered knee: warm = 9dB (halfKnee=4.5, starts at -5.5),
      // aggressive = 3dB (halfKnee=1.5, starts at -2.5).
      // At ceiling - 3dB = -4: aggressive is still passthrough, warm is already reducing.
      const testDb = -4;
      const wPt = warm.find((p) => Math.abs(p.inputDb - testDb) < 0.5);
      const aPt = aggressive.find((p) => Math.abs(p.inputDb - testDb) < 0.5);
      expect(wPt).toBeDefined();
      expect(aPt).toBeDefined();
      // Warm starts reducing earlier (wider knee), so its output is lower here
      expect(wPt!.outputDb).toBeLessThan(aPt!.outputDb);
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
