import { describe, it, expect } from 'vitest';
import {
  computeMomentaryLoudness,
  computeRMS,
  kWeightingCoefficients,
  applyKWeighting,
  dbToLinear,
  linearToDb,
} from '../../src/utils/loudnessMetering';

describe('loudnessMetering', () => {
  describe('linearToDb / dbToLinear', () => {
    it('converts 1.0 to 0 dB', () => {
      expect(linearToDb(1)).toBeCloseTo(0, 5);
    });

    it('converts 0.5 to roughly -6 dB', () => {
      expect(linearToDb(0.5)).toBeCloseTo(-6.02, 1);
    });

    it('converts 0 to -Infinity', () => {
      expect(linearToDb(0)).toBe(-Infinity);
    });

    it('round-trips correctly', () => {
      expect(dbToLinear(linearToDb(0.3))).toBeCloseTo(0.3, 5);
    });

    it('dbToLinear of 0 is 1', () => {
      expect(dbToLinear(0)).toBeCloseTo(1, 5);
    });

    it('dbToLinear of -6 is ~0.5', () => {
      expect(dbToLinear(-6)).toBeCloseTo(0.5012, 2);
    });
  });

  describe('computeRMS', () => {
    it('returns 0 for silence', () => {
      const samples = new Float32Array(1024);
      expect(computeRMS(samples)).toBe(0);
    });

    it('returns correct RMS for a DC signal', () => {
      const samples = new Float32Array(1024).fill(0.5);
      expect(computeRMS(samples)).toBeCloseTo(0.5, 5);
    });

    it('returns correct RMS for a sine wave', () => {
      const N = 4800; // 100ms at 48kHz
      const samples = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        samples[i] = Math.sin((2 * Math.PI * 1000 * i) / 48000);
      }
      // RMS of a sine wave = 1/sqrt(2) ≈ 0.7071
      expect(computeRMS(samples)).toBeCloseTo(1 / Math.sqrt(2), 2);
    });

    it('returns 0 for empty array', () => {
      expect(computeRMS(new Float32Array(0))).toBe(0);
    });
  });

  describe('kWeightingCoefficients', () => {
    it('returns stage1 and stage2 coefficients', () => {
      const coeffs = kWeightingCoefficients(48000);
      expect(coeffs.stage1).not.toBeUndefined();
      expect(coeffs.stage2).not.toBeUndefined();
      expect(coeffs.stage1.b).toHaveLength(3);
      expect(coeffs.stage1.a).toHaveLength(3);
      expect(coeffs.stage2.b).toHaveLength(3);
      expect(coeffs.stage2.a).toHaveLength(3);
    });

    it('returns coefficients for 44100 sample rate', () => {
      const coeffs = kWeightingCoefficients(44100);
      expect(coeffs.stage1.b[0]).toBeGreaterThan(0);
    });
  });

  describe('applyKWeighting', () => {
    it('returns same length array', () => {
      const input = new Float32Array(1024);
      const coeffs = kWeightingCoefficients(48000);
      const result = applyKWeighting(input, coeffs);
      expect(result.length).toBe(1024);
    });

    it('returns silence for silence input', () => {
      const input = new Float32Array(1024);
      const coeffs = kWeightingCoefficients(48000);
      const result = applyKWeighting(input, coeffs);
      for (let i = 0; i < result.length; i++) {
        expect(result[i]).toBe(0);
      }
    });

    it('modifies the signal (not passthrough)', () => {
      const N = 4800;
      const input = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        input[i] = Math.sin((2 * Math.PI * 100 * i) / 48000); // 100Hz sine
      }
      const coeffs = kWeightingCoefficients(48000);
      const result = applyKWeighting(input, coeffs);
      // K-weighting attenuates low frequencies, so output RMS should be lower than input
      const inputRMS = computeRMS(input);
      const outputRMS = computeRMS(result);
      expect(outputRMS).toBeLessThan(inputRMS);
    });
  });

  describe('computeMomentaryLoudness', () => {
    it('returns -Infinity for silence', () => {
      const samples = new Float32Array(19200); // 400ms at 48kHz
      expect(computeMomentaryLoudness(samples, 48000)).toBe(-Infinity);
    });

    it('returns a finite LUFS value for a signal', () => {
      const N = 19200; // 400ms at 48kHz
      const samples = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        samples[i] = 0.5 * Math.sin((2 * Math.PI * 1000 * i) / 48000);
      }
      const lufs = computeMomentaryLoudness(samples, 48000);
      expect(lufs).toBeGreaterThan(-100);
      expect(lufs).toBeLessThan(0);
      expect(Number.isFinite(lufs)).toBe(true);
    });

    it('louder signal produces higher LUFS', () => {
      const N = 19200;
      const quiet = new Float32Array(N);
      const loud = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        quiet[i] = 0.1 * Math.sin((2 * Math.PI * 1000 * i) / 48000);
        loud[i] = 0.9 * Math.sin((2 * Math.PI * 1000 * i) / 48000);
      }
      const quietLufs = computeMomentaryLoudness(quiet, 48000);
      const loudLufs = computeMomentaryLoudness(loud, 48000);
      expect(loudLufs).toBeGreaterThan(quietLufs);
    });

    it('full-scale 1kHz sine is approximately -3 LUFS', () => {
      // A full-scale 1kHz sine wave should be around -3.01 LUFS
      // K-weighting at 1kHz is approximately unity gain
      const N = 19200;
      const samples = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        samples[i] = Math.sin((2 * Math.PI * 1000 * i) / 48000);
      }
      const lufs = computeMomentaryLoudness(samples, 48000);
      // Should be close to -3.01 LUFS (RMS of sine = -3.01 dB, K-weight at 1kHz ≈ 0)
      expect(lufs).toBeGreaterThan(-5);
      expect(lufs).toBeLessThan(-1);
    });
  });
});
