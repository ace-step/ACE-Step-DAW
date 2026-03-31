import { describe, it, expect } from 'vitest';
import { compressorTransfer, generateTransferCurve } from '../compressorCurve';

describe('compressorCurve', () => {
  describe('compressorTransfer', () => {
    it('passes through signal below threshold with no knee', () => {
      // Input -40dB, threshold -20dB, ratio 4:1, no knee
      expect(compressorTransfer(-40, -20, 4, 0)).toBe(-40);
      expect(compressorTransfer(-30, -20, 4, 0)).toBe(-30);
    });

    it('compresses signal above threshold at given ratio', () => {
      // Input -10dB, threshold -20dB, ratio 4:1 → excess = 10dB, compressed excess = 2.5dB
      // Output = -20 + 10/4 = -17.5
      expect(compressorTransfer(-10, -20, 4, 0)).toBe(-17.5);
    });

    it('handles infinite ratio (limiter)', () => {
      // ratio = Infinity → output at threshold
      expect(compressorTransfer(-10, -20, Infinity, 0)).toBe(-20);
      expect(compressorTransfer(0, -20, Infinity, 0)).toBe(-20);
    });

    it('handles ratio of 1 (no compression)', () => {
      expect(compressorTransfer(-10, -20, 1, 0)).toBe(-10);
      expect(compressorTransfer(0, -20, 1, 0)).toBe(0);
    });

    it('applies soft knee smoothly around threshold', () => {
      const threshold = -20;
      const ratio = 4;
      const knee = 12; // 12dB knee

      // At threshold with soft knee, output is below unity (some compression applied)
      const atThreshold = compressorTransfer(threshold, threshold, ratio, knee);
      expect(atThreshold).toBeLessThan(threshold); // some compression happening
      // But more than what full compression at threshold would give (which is just threshold)
      // The soft knee applies partial compression, so output is between full-compress and unity
      expect(atThreshold).toBeGreaterThan(threshold - knee); // not extreme

      // Below knee start (threshold - knee/2), should be unity
      const belowKnee = compressorTransfer(threshold - knee / 2 - 1, threshold, ratio, knee);
      expect(belowKnee).toBe(threshold - knee / 2 - 1);

      // Above knee end (threshold + knee/2), should follow compressed line
      const aboveKnee = compressorTransfer(threshold + knee / 2 + 1, threshold, ratio, knee);
      const excess = knee / 2 + 1;
      const expectedCompressed = threshold + excess / ratio;
      expect(aboveKnee).toBeCloseTo(expectedCompressed, 1);
    });

    it('soft knee curve is monotonically increasing', () => {
      const threshold = -24;
      const ratio = 4;
      const knee = 12;
      let prev = -Infinity;
      for (let db = -60; db <= 0; db += 0.5) {
        const out = compressorTransfer(db, threshold, ratio, knee);
        expect(out).toBeGreaterThanOrEqual(prev);
        prev = out;
      }
    });
  });

  describe('generateTransferCurve', () => {
    it('generates correct number of points', () => {
      const points = generateTransferCurve(-20, 4, 6, -60, 0, 100);
      expect(points).toHaveLength(101); // steps + 1
    });

    it('first point starts at minDb', () => {
      const points = generateTransferCurve(-20, 4, 0, -60, 0);
      expect(points[0].x).toBe(-60);
      expect(points[0].y).toBe(-60); // below threshold = unity
    });

    it('last point is at maxDb', () => {
      const points = generateTransferCurve(-20, 4, 0, -60, 0);
      const last = points[points.length - 1];
      expect(last.x).toBe(0);
      // 0dB input, -20 threshold, 4:1 ratio → -20 + 20/4 = -15
      expect(last.y).toBe(-15);
    });

    it('curve follows unity below threshold', () => {
      const points = generateTransferCurve(-20, 4, 0, -60, 0);
      // All points below -20 should be on the unity line
      for (const p of points) {
        if (p.x <= -20) {
          expect(p.y).toBeCloseTo(p.x, 5);
        }
      }
    });
  });
});
