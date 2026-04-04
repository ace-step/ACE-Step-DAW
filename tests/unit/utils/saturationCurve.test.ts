import { describe, it, expect } from 'vitest';
import { saturationTransfer, generateSaturationCurve, type SaturationType } from '../../../src/utils/saturationCurve';

describe('saturationTransfer', () => {
  it('returns input unchanged at zero drive', () => {
    expect(saturationTransfer(0.5, 0, 'tape')).toBeCloseTo(0.5, 2);
    expect(saturationTransfer(-0.3, 0, 'tube')).toBeCloseTo(-0.3, 2);
  });

  it('output is always clamped to [-1, 1]', () => {
    const types: SaturationType[] = ['tape', 'tube', 'transistor', 'soft', 'hard'];
    for (const type of types) {
      for (const drive of [0, 0.5, 1]) {
        for (const x of [-1, -0.5, 0, 0.5, 1]) {
          const y = saturationTransfer(x, drive, type);
          expect(y).toBeGreaterThanOrEqual(-1);
          expect(y).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('produces soft clipping at high drive', () => {
    // At high drive, output should saturate (approach ±1 faster than linear)
    const y = saturationTransfer(0.8, 1, 'soft');
    expect(y).toBeGreaterThan(0.8); // Compressed toward 1
    expect(y).toBeLessThanOrEqual(1);
  });

  it('hard clip produces near-flat output at high drive', () => {
    const y1 = saturationTransfer(0.5, 1, 'hard');
    const y2 = saturationTransfer(0.8, 1, 'hard');
    // Both should be clipped near 1
    expect(y1).toBeCloseTo(1, 0);
    expect(y2).toBeCloseTo(1, 0);
  });

  it('is odd-symmetric for soft type', () => {
    const yPos = saturationTransfer(0.5, 0.5, 'soft');
    const yNeg = saturationTransfer(-0.5, 0.5, 'soft');
    expect(yPos).toBeCloseTo(-yNeg, 4);
  });

  it('tube produces asymmetric output', () => {
    const yPos = saturationTransfer(0.7, 0.8, 'tube');
    const yNeg = saturationTransfer(-0.7, 0.8, 'tube');
    // Not perfectly symmetric
    expect(Math.abs(yPos + yNeg)).toBeGreaterThan(0.01);
  });
});

describe('generateSaturationCurve', () => {
  it('generates correct number of points', () => {
    const points = generateSaturationCurve(0.5, 'tape', 100);
    expect(points).toHaveLength(101);
  });

  it('x values span -1 to 1', () => {
    const points = generateSaturationCurve(0.5, 'soft');
    expect(points[0].x).toBeCloseTo(-1, 4);
    expect(points[points.length - 1].x).toBeCloseTo(1, 4);
  });

  it('at zero drive, curve matches unity line', () => {
    const points = generateSaturationCurve(0, 'tape');
    for (const p of points) {
      expect(p.y).toBeCloseTo(p.x, 2);
    }
  });
});
