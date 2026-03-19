import { describe, it, expect } from 'vitest';
import { computeGainReduction, smoothGain } from '../sidechainFollower';

describe('sidechain follower — pure computation', () => {
  describe('computeGainReduction', () => {
    it('returns 0 dB reduction when signal is below threshold', () => {
      expect(computeGainReduction(-30, -20, 4, 0)).toBe(0);
    });

    it('applies compression ratio when signal exceeds threshold', () => {
      // 10 dB over threshold at 4:1 → 7.5 dB reduction
      expect(computeGainReduction(-10, -20, 4, 0)).toBeCloseTo(7.5);
    });

    it('returns full reduction at infinite ratio (limiter)', () => {
      expect(computeGainReduction(-10, -20, Infinity, 0)).toBeCloseTo(10);
    });

    it('applies soft knee when knee > 0', () => {
      const reductionAtThreshold = computeGainReduction(-20, -20, 4, 6);
      expect(reductionAtThreshold).toBeGreaterThan(0);
      expect(reductionAtThreshold).toBeLessThan(computeGainReduction(-17, -20, 4, 0));
    });

    it('returns 0 reduction at ratio 1:1', () => {
      expect(computeGainReduction(-10, -20, 1, 0)).toBe(0);
    });

    it('returns 0 when signal is well below soft knee range', () => {
      expect(computeGainReduction(-30, -20, 4, 6)).toBe(0);
    });

    it('matches hard knee beyond the knee region', () => {
      const hardKnee = computeGainReduction(0, -20, 4, 0);
      const softKnee = computeGainReduction(0, -20, 4, 6);
      expect(softKnee).toBeCloseTo(hardKnee, 1);
    });
  });

  describe('smoothGain', () => {
    it('approaches target gain using attack coefficient (ducking)', () => {
      const result = smoothGain(1.0, 0.5, 0.01, 0.1, 1 / 60);
      expect(result).toBeLessThan(1.0);
      expect(result).toBeGreaterThan(0.5);
    });

    it('approaches target gain using release coefficient (recovering)', () => {
      const result = smoothGain(0.5, 1.0, 0.01, 0.1, 1 / 60);
      expect(result).toBeGreaterThan(0.5);
      expect(result).toBeLessThan(1.0);
    });

    it('reaches target faster with shorter attack time', () => {
      const fast = smoothGain(1.0, 0.5, 0.001, 0.1, 1 / 60);
      const slow = smoothGain(1.0, 0.5, 0.05, 0.1, 1 / 60);
      expect(fast).toBeLessThan(slow);
    });

    it('returns value near target with large dt', () => {
      const result = smoothGain(1.0, 0.5, 0.01, 0.1, 10);
      expect(result).toBeCloseTo(0.5, 2);
    });

    it('returns current gain when dt is 0', () => {
      const result = smoothGain(0.8, 0.5, 0.01, 0.1, 0);
      expect(result).toBeCloseTo(0.8, 5);
    });
  });
});
