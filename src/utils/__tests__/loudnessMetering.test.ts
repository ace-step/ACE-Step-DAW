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
    expect(linearToDb(1.0)).toBeCloseTo(0, 10);
  });

  it('converts 0.5 to approximately -6.02 dB', () => {
    expect(linearToDb(0.5)).toBeCloseTo(-6.0206, 3);
  });

  it('returns -Infinity for 0', () => {
    expect(linearToDb(0)).toBe(-Infinity);
  });

  it('returns -Infinity for negative values', () => {
    expect(linearToDb(-0.5)).toBe(-Infinity);
  });

  it('converts 2.0 to approximately +6.02 dB', () => {
    expect(linearToDb(2.0)).toBeCloseTo(6.0206, 3);
  });
});

describe('dbToLinear', () => {
  it('converts 0 dB to 1.0', () => {
    expect(dbToLinear(0)).toBeCloseTo(1.0, 10);
  });

  it('converts -6 dB to approximately 0.501', () => {
    expect(dbToLinear(-6)).toBeCloseTo(0.50119, 3);
  });

  it('converts +6 dB to approximately 1.995', () => {
    expect(dbToLinear(6)).toBeCloseTo(1.99526, 3);
  });

  it('is inverse of linearToDb', () => {
    const original = 0.75;
    expect(dbToLinear(linearToDb(original))).toBeCloseTo(original, 10);
  });
});

describe('computeRMS', () => {
  it('returns 0 for empty array', () => {
    expect(computeRMS(new Float32Array(0))).toBe(0);
  });

  it('returns 0 for silent audio', () => {
    expect(computeRMS(new Float32Array(1024))).toBe(0);
  });

  it('returns correct RMS for DC signal', () => {
    const samples = new Float32Array(100).fill(0.5);
    expect(computeRMS(samples)).toBeCloseTo(0.5, 10);
  });

  it('returns correct RMS for known values', () => {
    // RMS of [1, -1, 1, -1] = sqrt(mean(1,1,1,1)) = 1
    const samples = new Float32Array([1, -1, 1, -1]);
    expect(computeRMS(samples)).toBeCloseTo(1.0, 10);
  });

  it('returns correct RMS for sine wave approximation', () => {
    // RMS of a sine wave is 1/sqrt(2) ≈ 0.7071
    const length = 44100;
    const samples = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      samples[i] = Math.sin((2 * Math.PI * 440 * i) / 44100);
    }
    expect(computeRMS(samples)).toBeCloseTo(1 / Math.sqrt(2), 2);
  });
});

describe('kWeightingCoefficients', () => {
  it('returns exact BS.1770-4 coefficients for 48kHz', () => {
    const coeffs = kWeightingCoefficients(48000);
    expect(coeffs.stage1.b[0]).toBeCloseTo(1.53512485958697, 10);
    expect(coeffs.stage1.a[0]).toBe(1.0);
    expect(coeffs.stage2.b[0]).toBe(1.0);
    expect(coeffs.stage2.b[1]).toBe(-2.0);
    expect(coeffs.stage2.b[2]).toBe(1.0);
    expect(coeffs.stage2.a[0]).toBe(1.0);
  });

  it('computes coefficients for 44100Hz via bilinear transform', () => {
    const coeffs = kWeightingCoefficients(44100);
    // a[0] is always 1.0 (normalized)
    expect(coeffs.stage1.a[0]).toBe(1.0);
    expect(coeffs.stage2.a[0]).toBe(1.0);
    // Coefficients should be finite numbers
    for (const c of [...coeffs.stage1.b, ...coeffs.stage1.a]) {
      expect(Number.isFinite(c)).toBe(true);
    }
    for (const c of [...coeffs.stage2.b, ...coeffs.stage2.a]) {
      expect(Number.isFinite(c)).toBe(true);
    }
  });

  it('returns 3-element arrays for b and a', () => {
    const coeffs = kWeightingCoefficients(96000);
    expect(coeffs.stage1.b.length).toBe(3);
    expect(coeffs.stage1.a.length).toBe(3);
    expect(coeffs.stage2.b.length).toBe(3);
    expect(coeffs.stage2.a.length).toBe(3);
  });
});

describe('applyKWeighting', () => {
  it('returns same length as input', () => {
    const input = new Float32Array(1024);
    const coeffs = kWeightingCoefficients(48000);
    const output = applyKWeighting(input, coeffs);
    expect(output.length).toBe(1024);
  });

  it('outputs silence for silent input', () => {
    const input = new Float32Array(512);
    const coeffs = kWeightingCoefficients(48000);
    const output = applyKWeighting(input, coeffs);
    for (let i = 0; i < output.length; i++) {
      expect(output[i]).toBe(0);
    }
  });
});

describe('computeMomentaryLoudness', () => {
  it('returns -Infinity for empty samples', () => {
    expect(computeMomentaryLoudness(new Float32Array(0), 48000)).toBe(-Infinity);
  });

  it('returns -Infinity for silent audio', () => {
    expect(computeMomentaryLoudness(new Float32Array(4800), 48000)).toBe(-Infinity);
  });

  it('returns a finite LUFS value for a tone', () => {
    const sampleRate = 48000;
    const length = sampleRate; // 1 second
    const samples = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      samples[i] = 0.5 * Math.sin((2 * Math.PI * 1000 * i) / sampleRate);
    }
    const lufs = computeMomentaryLoudness(samples, sampleRate);
    expect(Number.isFinite(lufs)).toBe(true);
    // Should be a negative LUFS value (below full scale)
    expect(lufs).toBeLessThan(0);
  });

  it('louder signal produces higher LUFS', () => {
    const sampleRate = 48000;
    const length = sampleRate;
    const quiet = new Float32Array(length);
    const loud = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      quiet[i] = 0.1 * Math.sin((2 * Math.PI * 1000 * i) / sampleRate);
      loud[i] = 0.9 * Math.sin((2 * Math.PI * 1000 * i) / sampleRate);
    }
    const quietLufs = computeMomentaryLoudness(quiet, sampleRate);
    const loudLufs = computeMomentaryLoudness(loud, sampleRate);
    expect(loudLufs).toBeGreaterThan(quietLufs);
  });
});

describe('freqToX / xToFreq', () => {
  it('maps minFreq to x=0', () => {
    expect(freqToX(20, 1000)).toBeCloseTo(0, 5);
  });

  it('maps maxFreq to x=width', () => {
    expect(freqToX(20000, 1000)).toBeCloseTo(1000, 5);
  });

  it('maps midpoint frequency on log scale', () => {
    // Geometric mean of 20 and 20000 = sqrt(20*20000) = sqrt(400000) ≈ 632.45
    const midFreq = Math.sqrt(20 * 20000);
    expect(freqToX(midFreq, 1000)).toBeCloseTo(500, 3);
  });

  it('xToFreq is inverse of freqToX', () => {
    const freq = 440;
    const x = freqToX(freq, 800);
    expect(xToFreq(x, 800)).toBeCloseTo(freq, 3);
  });

  it('xToFreq maps x=0 to minFreq', () => {
    expect(xToFreq(0, 1000)).toBeCloseTo(20, 5);
  });

  it('xToFreq maps x=width to maxFreq', () => {
    expect(xToFreq(1000, 1000)).toBeCloseTo(20000, 1);
  });

  it('supports custom min/max frequency', () => {
    expect(freqToX(100, 500, 100, 10000)).toBeCloseTo(0, 5);
    expect(freqToX(10000, 500, 100, 10000)).toBeCloseTo(500, 5);
  });
});

describe('dbToY', () => {
  it('maps maxDb (0) to y=0 (top)', () => {
    expect(dbToY(0, 400)).toBeCloseTo(0, 5);
  });

  it('maps minDb (-90) to y=height (bottom)', () => {
    expect(dbToY(-90, 400)).toBeCloseTo(400, 5);
  });

  it('maps -45dB to midpoint', () => {
    expect(dbToY(-45, 400)).toBeCloseTo(200, 3);
  });

  it('clamps values above maxDb', () => {
    expect(dbToY(10, 400)).toBeCloseTo(0, 5);
  });

  it('clamps values below minDb', () => {
    expect(dbToY(-120, 400)).toBeCloseTo(400, 5);
  });

  it('supports custom dB range', () => {
    expect(dbToY(-60, 300, -60, 0)).toBeCloseTo(300, 5);
    expect(dbToY(0, 300, -60, 0)).toBeCloseTo(0, 5);
  });
});
