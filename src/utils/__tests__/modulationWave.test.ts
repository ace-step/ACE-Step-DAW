import { describe, it, expect } from 'vitest';
import {
  generateLfoWave,
  getLfoValue,
  getLfoRange,
} from '../modulationWave';

describe('modulationWave', () => {
  describe('getLfoValue', () => {
    it('returns 0 at t=0 (sine starts at 0)', () => {
      expect(getLfoValue(0, 1, 1)).toBeCloseTo(0, 5);
    });

    it('returns 1 at quarter period', () => {
      // At t = 1/(4*freq), sine = sin(2π * freq * t) = sin(π/2) = 1
      expect(getLfoValue(0.25, 1, 1)).toBeCloseTo(1, 4);
    });

    it('returns -1 at three-quarter period', () => {
      expect(getLfoValue(0.75, 1, 1)).toBeCloseTo(-1, 4);
    });

    it('depth scales the output', () => {
      expect(getLfoValue(0.25, 1, 0.5)).toBeCloseTo(0.5, 4);
      expect(getLfoValue(0.25, 1, 0)).toBe(0);
    });

    it('output is in [-depth, +depth]', () => {
      for (let t = 0; t <= 2; t += 0.05) {
        const v = getLfoValue(t, 2, 0.7);
        expect(v).toBeGreaterThanOrEqual(-0.7 - 1e-9);
        expect(v).toBeLessThanOrEqual(0.7 + 1e-9);
      }
    });

    it('higher frequency completes more cycles in same time', () => {
      // At t=0.25, freq=2 should be at half cycle (sin = 0)
      expect(getLfoValue(0.25, 2, 1)).toBeCloseTo(0, 4);
    });
  });

  describe('getLfoRange', () => {
    it('returns correct delay range for chorus', () => {
      const range = getLfoRange(0.5, 10, 'chorus');
      expect(range.min).toBeLessThan(range.max);
      expect(range.min).toBeGreaterThanOrEqual(0);
    });

    it('chorus range spans around base delay time', () => {
      const range = getLfoRange(0.5, 10, 'chorus');
      const center = (range.min + range.max) / 2;
      expect(center).toBeCloseTo(10, 0);
    });

    it('higher depth gives wider range', () => {
      const narrow = getLfoRange(0.1, 10, 'flanger');
      const wide = getLfoRange(0.9, 10, 'flanger');
      const narrowWidth = narrow.max - narrow.min;
      const wideWidth = wide.max - wide.min;
      expect(wideWidth).toBeGreaterThan(narrowWidth);
    });
  });

  describe('generateLfoWave', () => {
    it('generates correct number of points', () => {
      const pts = generateLfoWave(1, 0.5, 2, 100);
      expect(pts).toHaveLength(101);
    });

    it('t values span 0 to displayDuration', () => {
      const displayDuration = 2;
      const pts = generateLfoWave(1, 0.5, displayDuration);
      expect(pts[0].t).toBe(0);
      expect(pts[pts.length - 1].t).toBeCloseTo(displayDuration, 4);
    });

    it('values are in [-1, 1] when depth=1', () => {
      const pts = generateLfoWave(3, 1, 1);
      for (const p of pts) {
        expect(p.value).toBeGreaterThanOrEqual(-1 - 1e-9);
        expect(p.value).toBeLessThanOrEqual(1 + 1e-9);
      }
    });

    it('all values are 0 when depth=0', () => {
      const pts = generateLfoWave(1, 0, 2);
      for (const p of pts) {
        expect(p.value).toBeCloseTo(0, 10);
      }
    });
  });
});
