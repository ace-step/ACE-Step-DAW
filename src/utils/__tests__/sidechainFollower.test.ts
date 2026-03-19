import { describe, it, expect } from 'vitest';
import { computeGainReduction, smoothGain } from '../../engine/sidechainFollower';

describe('sidechain compression pure functions', () => {
  describe('computeGainReduction', () => {
    it('returns 0 when source level is below threshold (hard knee)', () => {
      const gr = computeGainReduction(-40, -24, 4, 0);
      expect(gr).toBe(0);
    });

    it('applies gain reduction when source level exceeds threshold (hard knee)', () => {
      // Source at -12 dB, threshold at -24 dB → 12 dB over threshold
      // ratio 4:1 → gain reduction = 12 * (1 - 1/4) = 9 dB
      const gr = computeGainReduction(-12, -24, 4, 0);
      expect(gr).toBeCloseTo(9, 5);
    });

    it('returns 0 when ratio is 1 (no compression)', () => {
      const gr = computeGainReduction(-12, -24, 1, 0);
      expect(gr).toBe(0);
    });

    it('handles extreme ratio (limiter)', () => {
      // ratio 20:1 → near-total reduction above threshold
      const gr = computeGainReduction(-12, -24, 20, 0);
      const expected = 12 * (1 - 1 / 20); // 11.4 dB
      expect(gr).toBeCloseTo(expected, 5);
    });

    it('returns 0 at exactly threshold boundary', () => {
      const gr = computeGainReduction(-24, -24, 4, 0);
      expect(gr).toBe(0);
    });

    it('applies soft knee transition', () => {
      // With knee = 12dB, signal at threshold should be in knee region
      const grAtThreshold = computeGainReduction(-24, -24, 4, 12);
      expect(grAtThreshold).toBeGreaterThan(0);

      // Well above knee, should equal hard knee
      const grHigh = computeGainReduction(0, -24, 4, 12);
      const grHardKnee = computeGainReduction(0, -24, 4, 0);
      expect(grHigh).toBeCloseTo(grHardKnee, 5);
    });

    it('soft knee below knee range returns 0', () => {
      // Signal well below knee region
      const gr = computeGainReduction(-40, -24, 4, 12);
      expect(gr).toBe(0);
    });
  });

  describe('smoothGain', () => {
    it('attack: gain decreases toward target', () => {
      const result = smoothGain(1, 0.5, 0.01, 0.2, 1 / 60);
      expect(result).toBeLessThan(1);
      expect(result).toBeGreaterThan(0.5);
    });

    it('release: gain increases toward target', () => {
      const result = smoothGain(0.5, 1, 0.01, 0.2, 1 / 60);
      expect(result).toBeGreaterThan(0.5);
      expect(result).toBeLessThan(1);
    });

    it('converges to target over many frames', () => {
      let gain = 1;
      for (let i = 0; i < 120; i++) {
        gain = smoothGain(gain, 0.3, 0.01, 0.2, 1 / 60);
      }
      expect(gain).toBeCloseTo(0.3, 1);
    });

    it('returns target when already at target', () => {
      const result = smoothGain(0.5, 0.5, 0.01, 0.2, 1 / 60);
      expect(result).toBe(0.5);
    });
  });
});
