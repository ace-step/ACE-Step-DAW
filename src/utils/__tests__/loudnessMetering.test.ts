import { describe, it, expect } from 'vitest';
import {
  linearToDb,
  dbToLinear,
  computeRMS,
  kWeightingCoefficients,
  applyKWeighting,
  computeMomentaryLoudness,
  freqToX,
  xToFreq,
  dbToY,
} from '../loudnessMetering';

describe('linearToDb', () => {
  it('converts 1.0 to 0 dB', () => {
    expect(linearToDb(1.0)).toBe(0);
  });

  it('converts 0.5 to approximately -6 dB', () => {
    expect(linearToDb(0.5)).toBeCloseTo(-6.0206, 3);
  });

  it('returns -Infinity for 0', () => {
    expect(linearToDb(0)).toBe(-Infinity);
  });

  it('returns -Infinity for negative values', () => {
    expect(linearToDb(-1)).toBe(-Infinity);
  });
});

describe('dbToLinear', () => {
  it('converts 0 dB to 1.0', () => {
    expect(dbToLinear(0)).toBe(1);
  });

  it('converts -6 dB to approximately 0.5', () => {
    expect(dbToLinear(-6)).toBeCloseTo(0.5012, 3);
  });

  it('converts -20 dB to 0.1', () => {
    expect(dbToLinear(-20)).toBeCloseTo(0.1, 5);
  });

  it('is inverse of linearToDb', () => {
    const original = 0.75;
    expect(dbToLinear(linearToDb(original))).toBeCloseTo(original, 10);
  });
});

describe('computeRMS', () => {
  it('returns 0 for empty array', () => {
    expect(computeRMS(new Float32Array([]))).toBe(0);
  });

  it('returns absolute value for single sample', () => {
    expect(computeRMS(new Float32Array([0.5]))).toBeCloseTo(0.5, 10);
  });

  it('computes correct RMS for uniform signal', () => {
    const samples = new Float32Array([0.5, 0.5, 0.5, 0.5]);
    expect(computeRMS(samples)).toBeCloseTo(0.5, 10);
  });

  it('computes correct RMS for sine-like signal', () => {
    // RMS of a full sine cycle = 1/sqrt(2)
    const N = 1000;
    const samples = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      samples[i] = Math.sin((2 * Math.PI * i) / N);
    }
    expect(computeRMS(samples)).toBeCloseTo(1 / Math.SQRT2, 2);
  });
});

describe('kWeightingCoefficients', () => {
  it('returns exact BS.1770-4 coefficients for 48kHz', () => {
    const coeffs = kWeightingCoefficients(48000);
    expect(coeffs.stage1.b[0]).toBeCloseTo(1.53512485958697, 10);
    expect(coeffs.stage2.b).toEqual([1.0, -2.0, 1.0]);
  });

  it('computes coefficients for other sample rates', () => {
    const coeffs = kWeightingCoefficients(44100);
    expect(coeffs.stage1.a[0]).toBe(1.0);
    expect(coeffs.stage2.a[0]).toBe(1.0);
    // Should be different from 48kHz values
    const coeffs48 = kWeightingCoefficients(48000);
    expect(coeffs.stage1.b[0]).not.toBe(coeffs48.stage1.b[0]);
  });
});

describe('applyKWeighting', () => {
  it('returns same length as input', () => {
    const samples = new Float32Array(100);
    const coeffs = kWeightingCoefficients(48000);
    const result = applyKWeighting(samples, coeffs);
    expect(result.length).toBe(100);
  });

  it('outputs silence for silence input', () => {
    const samples = new Float32Array(100); // all zeros
    const coeffs = kWeightingCoefficients(48000);
    const result = applyKWeighting(samples, coeffs);
    const allZero = result.every((v) => v === 0);
    expect(allZero).toBe(true);
  });
});

describe('computeMomentaryLoudness', () => {
  it('returns -Infinity for empty samples', () => {
    expect(computeMomentaryLoudness(new Float32Array([]), 48000)).toBe(-Infinity);
  });

  it('returns -Infinity for silence', () => {
    const silence = new Float32Array(4800); // 0.1s at 48kHz
    expect(computeMomentaryLoudness(silence, 48000)).toBe(-Infinity);
  });

  it('returns a finite LUFS value for non-silent signal', () => {
    const N = 48000; // 1 second at 48kHz
    const samples = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      samples[i] = 0.5 * Math.sin((2 * Math.PI * 1000 * i) / N);
    }
    const lufs = computeMomentaryLoudness(samples, 48000);
    expect(lufs).toBeGreaterThan(-100);
    expect(lufs).toBeLessThan(0);
    expect(Number.isFinite(lufs)).toBe(true);
  });
});

describe('freqToX', () => {
  it('maps min frequency to 0', () => {
    expect(freqToX(20, 1000)).toBeCloseTo(0, 5);
  });

  it('maps max frequency to width', () => {
    expect(freqToX(20000, 1000)).toBeCloseTo(1000, 5);
  });

  it('maps 1kHz to roughly midpoint on log scale', () => {
    const x = freqToX(1000, 1000);
    // log10(1000) = 3, range = log10(20000) - log10(20) = 4.301 - 1.301 = 3
    // position = (3 - 1.301) / 3 * 1000 ≈ 566
    expect(x).toBeGreaterThan(500);
    expect(x).toBeLessThan(600);
  });
});

describe('xToFreq', () => {
  it('maps 0 to min frequency', () => {
    expect(xToFreq(0, 1000)).toBeCloseTo(20, 5);
  });

  it('maps width to max frequency', () => {
    expect(xToFreq(1000, 1000)).toBeCloseTo(20000, 0);
  });

  it('is inverse of freqToX', () => {
    const freq = 440;
    const x = freqToX(freq, 1000);
    expect(xToFreq(x, 1000)).toBeCloseTo(freq, 5);
  });
});

describe('dbToY', () => {
  it('maps 0 dB to top of range (y=0)', () => {
    expect(dbToY(0, 100)).toBe(0);
  });

  it('maps -90 dB to bottom of range (y=height)', () => {
    expect(dbToY(-90, 100)).toBe(100);
  });

  it('maps -45 dB to midpoint', () => {
    expect(dbToY(-45, 100)).toBeCloseTo(50, 5);
  });

  it('clamps values beyond range', () => {
    expect(dbToY(-200, 100)).toBe(100); // clamped to minDb
    expect(dbToY(10, 100)).toBe(0);     // clamped to maxDb
  });
});
