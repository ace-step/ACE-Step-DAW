import { describe, it, expect } from 'vitest';
import { limiterTransfer, generateLimiterCurve, type LimiterStyle } from '../../../src/utils/limiterCurve';

describe('limiterCurve', () => {
  describe('limiterTransfer', () => {
    it('passes signal well below ceiling unchanged', () => {
      // Well below kneeStart (ceiling - halfKnee)
      expect(limiterTransfer(-30, -0.3, 0, 'transparent')).toBeCloseTo(-30, 5);
      expect(limiterTransfer(-40, -0.3, 0, 'aggressive')).toBeCloseTo(-40, 5);
      expect(limiterTransfer(-20, -0.3, 0, 'warm')).toBeCloseTo(-20, 5);
    });

    it('transparent style never exceeds ceiling', () => {
      for (let db = -10; db <= 0; db += 1) {
        expect(limiterTransfer(db, -0.3, 0, 'transparent')).toBeLessThanOrEqual(-0.3 + 0.001);
      }
    });

    it('aggressive style never exceeds ceiling', () => {
      for (let db = -10; db <= 0; db += 1) {
        expect(limiterTransfer(db, -0.3, 0, 'aggressive')).toBeLessThanOrEqual(-0.3 + 0.001);
      }
    });

    it('warm style approaches but never exceeds ceiling', () => {
      const result = limiterTransfer(0, -0.3, 0, 'warm');
      expect(result).toBeLessThanOrEqual(-0.3 + 0.001);
      expect(result).toBeGreaterThan(-5);
    });

    it('input gain shifts the curve', () => {
      const noGain = limiterTransfer(-20, -0.3, 0, 'transparent');
      const withGain = limiterTransfer(-20, -0.3, 6, 'transparent');
      expect(withGain).toBeGreaterThan(noGain);
    });

    it('warm style begins bending within its 12dB knee region', () => {
      const ceiling = -0.3;
      // Warm has 12dB knee centered on ceiling: kneeStart = ceiling - 6 = -6.3
      const inputInKnee = ceiling - 4; // -4.3, inside knee
      const result = limiterTransfer(inputInKnee, ceiling, 0, 'warm');
      // Should be attenuated below pass-through (limiter reducing signal)
      expect(result).toBeLessThan(inputInKnee);
      // But only slightly — not a full knee's worth of reduction
      expect(result).toBeGreaterThan(inputInKnee - 3);
    });

    it('knee region is continuous at boundaries', () => {
      const ceiling = -0.3;
      // At kneeStart (ceiling - halfKnee), output should equal input (C0 continuous)
      const kneeStart = ceiling - 3; // transparent 6dB knee, halfKnee=3
      expect(limiterTransfer(kneeStart, ceiling, 0, 'transparent')).toBeCloseTo(kneeStart, 5);
      // At kneeEnd (ceiling + halfKnee), output should equal ceiling (C0 continuous)
      const kneeEnd = ceiling + 3;
      expect(limiterTransfer(kneeEnd, ceiling, 0, 'transparent')).toBeCloseTo(ceiling, 5);
    });

    it('all styles produce monotonically non-decreasing output', () => {
      const styles: LimiterStyle[] = ['transparent', 'aggressive', 'warm'];
      for (const style of styles) {
        let prev = -Infinity;
        for (let db = -60; db <= 0; db += 1) {
          const result = limiterTransfer(db, -0.3, 0, style);
          expect(result).toBeGreaterThanOrEqual(prev - 0.001);
          prev = result;
        }
      }
    });
  });

  describe('generateLimiterCurve', () => {
    it('returns correct number of points', () => {
      const points = generateLimiterCurve(-0.3, 0, 'transparent', -60, 0, 50);
      expect(points).toHaveLength(51);
    });

    it('x values span minDb to maxDb', () => {
      const points = generateLimiterCurve(-0.3, 0, 'warm', -60, 0, 100);
      expect(points[0].x).toBeCloseTo(-60, 5);
      expect(points[100].x).toBeCloseTo(0, 5);
    });
  });
});
