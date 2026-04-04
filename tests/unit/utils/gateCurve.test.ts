import { describe, it, expect } from 'vitest';
import { gateTransfer, generateGateCurve } from '../../../src/utils/gateCurve';

describe('gateCurve', () => {
  describe('gateTransfer', () => {
    it('passes signal above threshold unchanged in gate mode', () => {
      expect(gateTransfer(-10, -30, -80, 4, 'gate')).toBe(-10);
      expect(gateTransfer(0, -30, -80, 4, 'gate')).toBe(0);
    });

    it('attenuates signal below close threshold by range in gate mode', () => {
      // closeThresh = -30 - 4 = -34
      expect(gateTransfer(-50, -30, -80, 4, 'gate')).toBe(-50 + (-80));
    });

    it('interpolates linearly in hysteresis zone', () => {
      // threshold = -30, hysteresis = 4, closeThresh = -34
      // at midpoint (-32): t = 0.5, output = -32 + (-80) * (1 - 0.5) = -32 + -40 = -72
      expect(gateTransfer(-32, -30, -80, 4, 'gate')).toBeCloseTo(-72, 5);
    });

    it('passes signal above threshold in expander mode', () => {
      expect(gateTransfer(-10, -30, -80, 4, 'expander')).toBe(-10);
    });

    it('expands signal below threshold in expander mode', () => {
      const result = gateTransfer(-50, -30, -80, 4, 'expander');
      expect(result).toBeLessThan(-50); // expanded = more attenuated
    });
  });

  describe('generateGateCurve', () => {
    it('returns correct number of points', () => {
      const points = generateGateCurve(-30, -80, 4, 'gate', -80, 0, 50);
      expect(points).toHaveLength(51);
    });

    it('x values span minDb to maxDb', () => {
      const points = generateGateCurve(-30, -80, 4, 'gate', -80, 0, 100);
      expect(points[0].x).toBeCloseTo(-80, 5);
      expect(points[100].x).toBeCloseTo(0, 5);
    });

    it('output equals input above threshold', () => {
      const points = generateGateCurve(-30, -80, 4, 'gate', -80, 0, 100);
      const aboveThresh = points.filter(p => p.x >= -30);
      for (const p of aboveThresh) {
        expect(p.y).toBeCloseTo(p.x, 5);
      }
    });
  });
});
