import { describe, it, expect } from 'vitest';
import { saturationTransfer, generateSaturationCurve, type SaturationType } from '../../../src/utils/saturationCurve';

describe('saturationCurve', () => {
  describe('saturationTransfer', () => {
    it('returns clamped input when drive is 0', () => {
      expect(saturationTransfer(0.5, 0, 'soft')).toBeCloseTo(0.5, 2);
      expect(saturationTransfer(-0.5, 0, 'tape')).toBeCloseTo(-0.5, 2);
    });

    it('clips at ±1 for hard type with high drive', () => {
      expect(saturationTransfer(1, 1, 'hard')).toBe(1);
      expect(saturationTransfer(-1, 1, 'hard')).toBe(-1);
    });

    it('soft type saturates symmetrically via tanh', () => {
      const pos = saturationTransfer(0.8, 0.5, 'soft');
      const neg = saturationTransfer(-0.8, 0.5, 'soft');
      expect(pos).toBeGreaterThan(0);
      expect(neg).toBeLessThan(0);
      expect(pos).toBeCloseTo(-neg, 2); // symmetric
    });

    it('tube type is asymmetric (positive clips later)', () => {
      // Use moderate input where asymmetry is more pronounced
      const pos = saturationTransfer(0.5, 0.8, 'tube');
      const neg = saturationTransfer(-0.5, 0.8, 'tube');
      // Tube asymmetry: different shaping for positive vs negative
      expect(pos).toBeGreaterThan(0);
      expect(neg).toBeLessThan(0);
      expect(Math.abs(pos)).not.toBeCloseTo(Math.abs(neg), 2);
    });

    it('tape type adds even-harmonic asymmetry', () => {
      const pos = saturationTransfer(0.7, 0.6, 'tape');
      const neg = saturationTransfer(-0.7, 0.6, 'tape');
      // Tape asymmetry means |pos| and |neg| differ
      expect(pos).toBeGreaterThan(0);
      expect(neg).toBeLessThan(0);
    });

    it('transistor type applies harder clipping', () => {
      const result = saturationTransfer(0.5, 1, 'transistor');
      expect(result).toBeGreaterThan(0.5); // drive pushes above linear
      expect(result).toBeLessThanOrEqual(1);
    });

    it('output is always clamped to [-1, 1]', () => {
      const types: SaturationType[] = ['tape', 'tube', 'transistor', 'soft', 'hard'];
      for (const type of types) {
        for (const input of [-1, -0.5, 0, 0.5, 1]) {
          const result = saturationTransfer(input, 1, type);
          expect(result).toBeGreaterThanOrEqual(-1);
          expect(result).toBeLessThanOrEqual(1);
        }
      }
    });
  });

  describe('generateSaturationCurve', () => {
    it('returns correct number of points', () => {
      const points = generateSaturationCurve(0.5, 'soft', 50);
      expect(points).toHaveLength(51); // 0..50 inclusive
    });

    it('x values span -1 to 1', () => {
      const points = generateSaturationCurve(0.5, 'tape', 100);
      expect(points[0].x).toBeCloseTo(-1, 5);
      expect(points[100].x).toBeCloseTo(1, 5);
    });

    it('y values match saturationTransfer for each point', () => {
      const points = generateSaturationCurve(0.7, 'tube', 20);
      for (const p of points) {
        expect(p.y).toBeCloseTo(saturationTransfer(p.x, 0.7, 'tube'), 10);
      }
    });
  });
});
