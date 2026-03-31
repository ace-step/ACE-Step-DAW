import { describe, it, expect } from 'vitest';
import { distortionTransfer, generateDistortionCurve } from '../distortionCurve';

describe('distortionCurve', () => {
  describe('distortionTransfer', () => {
    describe('zero drive (unity)', () => {
      it('passes through signal unchanged at drive=0 for soft', () => {
        expect(distortionTransfer(0.5, 0, 'soft')).toBeCloseTo(0.5, 4);
        expect(distortionTransfer(-0.5, 0, 'soft')).toBeCloseTo(-0.5, 4);
        expect(distortionTransfer(0, 0, 'soft')).toBe(0);
      });

      it('passes through at drive=0 for overdrive', () => {
        expect(distortionTransfer(0.5, 0, 'overdrive')).toBeCloseTo(0.5, 4);
        expect(distortionTransfer(-0.3, 0, 'overdrive')).toBeCloseTo(-0.3, 4);
      });

      it('passes through at drive=0 for fuzz', () => {
        expect(distortionTransfer(0.5, 0, 'fuzz')).toBeCloseTo(0.5, 4);
      });
    });

    describe('all types output in [-1, 1]', () => {
      const types = ['soft', 'overdrive', 'fuzz'] as const;
      for (const type of types) {
        it(`${type} output stays in [-1, 1] for any input`, () => {
          for (let x = -2; x <= 2; x += 0.1) {
            const y = distortionTransfer(x, 0.8, type);
            expect(y).toBeGreaterThanOrEqual(-1 - 1e-9);
            expect(y).toBeLessThanOrEqual(1 + 1e-9);
          }
        });
      }
    });

    describe('odd symmetry (f(-x) = -f(x))', () => {
      it('soft clip is odd-symmetric', () => {
        for (let x = -1; x <= 1; x += 0.2) {
          const pos = distortionTransfer(x, 0.5, 'soft');
          const neg = distortionTransfer(-x, 0.5, 'soft');
          expect(pos).toBeCloseTo(-neg, 5);
        }
      });

      it('fuzz is approximately odd-symmetric', () => {
        for (let x = -1; x <= 1; x += 0.25) {
          const pos = distortionTransfer(x, 0.5, 'fuzz');
          const neg = distortionTransfer(-x, 0.5, 'fuzz');
          expect(pos).toBeCloseTo(-neg, 4);
        }
      });
    });

    describe('monotonically increasing', () => {
      const types = ['soft', 'overdrive', 'fuzz'] as const;
      for (const type of types) {
        it(`${type} curve is monotonically non-decreasing`, () => {
          let prev = -Infinity;
          for (let x = -1; x <= 1; x += 0.02) {
            const y = distortionTransfer(x, 0.5, type);
            expect(y).toBeGreaterThanOrEqual(prev - 1e-9);
            prev = y;
          }
        });
      }
    });

    describe('fuzz clips hard at high drive', () => {
      it('fuzz clips to ±1 for large inputs', () => {
        expect(distortionTransfer(1, 1, 'fuzz')).toBeCloseTo(1, 3);
        expect(distortionTransfer(-1, 1, 'fuzz')).toBeCloseTo(-1, 3);
      });
    });

    describe('drive effect', () => {
      it('higher drive increases output for soft clip at x=0.3', () => {
        const low = distortionTransfer(0.3, 0.1, 'soft');
        const high = distortionTransfer(0.3, 0.9, 'soft');
        expect(high).toBeGreaterThan(low);
      });
    });
  });

  describe('generateDistortionCurve', () => {
    it('generates correct number of points', () => {
      const pts = generateDistortionCurve(0.5, 'soft', 100);
      expect(pts).toHaveLength(101);
    });

    it('first point starts at x=-1', () => {
      const pts = generateDistortionCurve(0.5, 'soft');
      expect(pts[0].x).toBe(-1);
    });

    it('last point ends at x=1', () => {
      const pts = generateDistortionCurve(0.5, 'soft');
      expect(pts[pts.length - 1].x).toBe(1);
    });

    it('all y values are in [-1, 1]', () => {
      for (const type of ['soft', 'overdrive', 'fuzz'] as const) {
        const pts = generateDistortionCurve(0.7, type);
        for (const p of pts) {
          expect(p.y).toBeGreaterThanOrEqual(-1 - 1e-9);
          expect(p.y).toBeLessThanOrEqual(1 + 1e-9);
        }
      }
    });

    it('at drive=0, curve is approximately linear', () => {
      const pts = generateDistortionCurve(0, 'soft', 10);
      for (const p of pts) {
        expect(p.y).toBeCloseTo(p.x, 4);
      }
    });
  });
});
