import { describe, it, expect } from 'vitest';
import { findNearestZeroCrossing, snapTimeToZeroCrossing } from '../zeroCrossing';

describe('zeroCrossing', () => {
  describe('findNearestZeroCrossing', () => {
    it('returns targetIndex for empty or single-sample arrays', () => {
      expect(findNearestZeroCrossing(new Float32Array(0), 0, 10)).toBe(0);
      expect(findNearestZeroCrossing(new Float32Array(1), 0, 10)).toBe(0);
    });

    it('returns targetIndex when sample at target is zero', () => {
      const samples = new Float32Array([0.5, 0, -0.5]);
      expect(findNearestZeroCrossing(samples, 1, 10)).toBe(1);
    });

    it('finds zero crossing at positive-to-negative transition', () => {
      const samples = new Float32Array([0.5, 0.3, 0.1, -0.1, -0.3]);
      // Crossing between index 2 (+0.1) and 3 (-0.1), target is 0
      const result = findNearestZeroCrossing(samples, 0, 10);
      expect(result).toBe(2); // |0.1| <= |-0.1|, so index 2
    });

    it('finds zero crossing at negative-to-positive transition', () => {
      const samples = new Float32Array([-0.3, -0.1, 0.2, 0.5]);
      const result = findNearestZeroCrossing(samples, 0, 10);
      expect(result).toBe(1); // |-0.1| < |0.2|
    });

    it('returns nearest crossing to target', () => {
      const samples = new Float32Array([0.5, -0.5, 0.5, -0.5, 0.5, -0.5]);
      // Multiple crossings: between 0-1, 1-2, 2-3, 3-4, 4-5
      // Target is 3, nearest crossing should be at or near 3
      const result = findNearestZeroCrossing(samples, 3, 10);
      expect(Math.abs(result - 3)).toBeLessThanOrEqual(1);
    });

    it('respects search radius', () => {
      const samples = new Float32Array([0.5, 0.5, 0.5, -0.5, -0.5]);
      // Crossing at index 2-3. Target is 0, radius is 1 (only looks at 0-1)
      const result = findNearestZeroCrossing(samples, 0, 1);
      expect(result).toBe(0); // No crossing found within radius, return target
    });

    it('clamps target to valid range', () => {
      // Both samples have equal magnitude, so either index 0 or 1 is valid
      const samples = new Float32Array([0.5, -0.5]);
      const resultNeg = findNearestZeroCrossing(samples, -5, 10);
      expect(resultNeg).toBeGreaterThanOrEqual(0);
      expect(resultNeg).toBeLessThanOrEqual(1);
      const resultHigh = findNearestZeroCrossing(samples, 100, 10);
      expect(resultHigh).toBeGreaterThanOrEqual(0);
      expect(resultHigh).toBeLessThanOrEqual(1);
    });

    it('picks sample closer to zero at crossing', () => {
      const samples = new Float32Array([0.9, -0.1]);
      // Crossing at 0-1, |−0.1| < |0.9|, so picks index 1
      const result = findNearestZeroCrossing(samples, 0, 10);
      expect(result).toBe(1);
    });
  });

  describe('snapTimeToZeroCrossing', () => {
    it('returns original time for empty samples', () => {
      expect(snapTimeToZeroCrossing(new Float32Array(0), 44100, 1.5)).toBe(1.5);
    });

    it('snaps time to nearest zero crossing', () => {
      // Create samples with a crossing between indices 99 and 100
      const samples = new Float32Array(200);
      for (let i = 0; i < 100; i++) samples[i] = 0.5;
      for (let i = 100; i < 200; i++) samples[i] = -0.5;
      // At 44100 Hz, the sign change lies between samples 99 and 100
      const targetTime = 100 / 44100;
      const snapped = snapTimeToZeroCrossing(samples, 44100, targetTime);
      const oneSample = 1 / 44100;
      // Accept either side of the crossing, since equal magnitudes may tie-break
      // Use slight epsilon for floating point comparison
      expect(Math.abs(snapped - targetTime)).toBeLessThanOrEqual(oneSample + 1e-15);
    });

    it('uses default 5ms search radius', () => {
      // At 44100 Hz, 5ms = ~220 samples
      const samples = new Float32Array(1000).fill(0.5);
      // No crossing in the data, should return original time
      const result = snapTimeToZeroCrossing(samples, 44100, 0.01);
      expect(result).toBeCloseTo(0.01, 4);
    });
  });
});
