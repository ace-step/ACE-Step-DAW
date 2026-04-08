import { describe, it, expect } from 'vitest';
import {
  computeAudioMetrics,
  computeLufs,
  computePeakDb,
  computeRmsDb,
  computeDynamicRange,
  formatLufs,
  formatDbLevel,
  formatDbRange,
} from '../audioMetrics';
import type { AudioMetrics } from '../../types/clipInspector';

// ─── Test Helpers ──────────────────────────────────────────────────────────

/** Create a mono AudioBuffer-like object from Float32Array samples. */
function makeMockBuffer(samples: Float32Array, sampleRate = 44100): {
  getChannelData: (ch: number) => Float32Array;
  numberOfChannels: number;
  sampleRate: number;
  length: number;
  duration: number;
} {
  return {
    getChannelData: (ch: number) => {
      if (ch !== 0) throw new Error(`Channel ${ch} out of range`);
      return samples;
    },
    numberOfChannels: 1,
    sampleRate,
    length: samples.length,
    duration: samples.length / sampleRate,
  };
}

/** Create a stereo buffer. */
function makeStereoBuffer(left: Float32Array, right: Float32Array, sampleRate = 44100) {
  const channels = [left, right];
  return {
    getChannelData: (ch: number) => channels[ch],
    numberOfChannels: 2,
    sampleRate,
    length: left.length,
    duration: left.length / sampleRate,
  };
}

/** Generate a sine wave buffer at given amplitude and frequency. */
function sineBuffer(amplitude: number, frequency: number, durationSec: number, sampleRate = 44100): Float32Array {
  const length = Math.floor(durationSec * sampleRate);
  const samples = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    samples[i] = amplitude * Math.sin(2 * Math.PI * frequency * i / sampleRate);
  }
  return samples;
}

// ─── computePeakDb ─────────────────────────────────────────────────────────

describe('computePeakDb', () => {
  it('returns 0 dB for full-scale signal', () => {
    const samples = new Float32Array([0, 0.5, 1.0, -1.0, 0.3]);
    const buffer = makeMockBuffer(samples);
    expect(computePeakDb(buffer)).toBeCloseTo(0, 1);
  });

  it('returns -6 dB for half-amplitude signal', () => {
    const samples = new Float32Array([0, 0.5, -0.5, 0.25]);
    const buffer = makeMockBuffer(samples);
    // 20 * log10(0.5) ≈ -6.02
    expect(computePeakDb(buffer)).toBeCloseTo(-6.02, 1);
  });

  it('returns -Infinity for silent buffer', () => {
    const samples = new Float32Array([0, 0, 0, 0]);
    const buffer = makeMockBuffer(samples);
    expect(computePeakDb(buffer)).toBe(-Infinity);
  });

  it('picks the loudest channel in stereo', () => {
    const left = new Float32Array([0.25, -0.25]);
    const right = new Float32Array([0.5, -0.5]);
    const buffer = makeStereoBuffer(left, right);
    expect(computePeakDb(buffer)).toBeCloseTo(-6.02, 1);
  });
});

// ─── computeRmsDb ──────────────────────────────────────────────────────────

describe('computeRmsDb', () => {
  it('returns correct RMS for full-scale sine wave', () => {
    // RMS of sine = amplitude / sqrt(2) ≈ 0.707 → -3.01 dBFS
    const samples = sineBuffer(1.0, 440, 1.0);
    const buffer = makeMockBuffer(samples);
    expect(computeRmsDb(buffer)).toBeCloseTo(-3.01, 0);
  });

  it('returns -Infinity for silent buffer', () => {
    const samples = new Float32Array(1000);
    const buffer = makeMockBuffer(samples);
    expect(computeRmsDb(buffer)).toBe(-Infinity);
  });

  it('averages channels for stereo', () => {
    const left = sineBuffer(1.0, 440, 0.5);
    const right = sineBuffer(1.0, 440, 0.5);
    const buffer = makeStereoBuffer(left, right);
    expect(computeRmsDb(buffer)).toBeCloseTo(-3.01, 0);
  });
});

// ─── computeLufs ───────────────────────────────────────────────────────────

describe('computeLufs', () => {
  it('returns a finite value for a non-silent signal', () => {
    const samples = sineBuffer(0.5, 1000, 2.0);
    const buffer = makeMockBuffer(samples);
    const lufs = computeLufs(buffer);
    expect(Number.isFinite(lufs)).toBe(true);
    expect(lufs).toBeLessThan(0);
  });

  it('returns -Infinity for silent buffer', () => {
    const samples = new Float32Array(44100);
    const buffer = makeMockBuffer(samples);
    expect(computeLufs(buffer)).toBe(-Infinity);
  });

  it('louder signal has higher LUFS', () => {
    const quiet = sineBuffer(0.1, 1000, 2.0);
    const loud = sineBuffer(0.5, 1000, 2.0);
    const quietBuf = makeMockBuffer(quiet);
    const loudBuf = makeMockBuffer(loud);
    expect(computeLufs(loudBuf)).toBeGreaterThan(computeLufs(quietBuf));
  });
});

// ─── computeDynamicRange ───────────────────────────────────────────────────

describe('computeDynamicRange', () => {
  it('returns 0 for constant-amplitude signal', () => {
    // DC offset at 0.5
    const samples = new Float32Array(44100).fill(0.5);
    const buffer = makeMockBuffer(samples);
    expect(computeDynamicRange(buffer)).toBeCloseTo(0, 0);
  });

  it('returns positive value for signal with varying amplitude', () => {
    // First half quiet, second half loud
    const samples = new Float32Array(44100);
    for (let i = 0; i < 22050; i++) samples[i] = 0.1 * Math.sin(2 * Math.PI * 440 * i / 44100);
    for (let i = 22050; i < 44100; i++) samples[i] = 0.8 * Math.sin(2 * Math.PI * 440 * i / 44100);
    const buffer = makeMockBuffer(samples);
    const dr = computeDynamicRange(buffer);
    expect(dr).toBeGreaterThan(5);
  });
});

// ─── computeAudioMetrics ───────────────────────────────────────────────────

describe('computeAudioMetrics', () => {
  it('returns all metric fields for a valid buffer', () => {
    const samples = sineBuffer(0.5, 440, 1.0);
    const buffer = makeMockBuffer(samples);
    const metrics = computeAudioMetrics(buffer);
    expect(metrics).toHaveProperty('lufs');
    expect(metrics).toHaveProperty('peakDb');
    expect(metrics).toHaveProperty('rmsDb');
    expect(metrics).toHaveProperty('dynamicRangeDb');
    expect(metrics).toHaveProperty('durationSeconds');
    expect(metrics).toHaveProperty('sampleRate');
    expect(metrics).toHaveProperty('channelCount');
  });

  it('reports correct sampleRate and channelCount', () => {
    const samples = sineBuffer(0.5, 440, 0.5, 48000);
    const buffer = makeMockBuffer(samples, 48000);
    const metrics = computeAudioMetrics(buffer);
    expect(metrics.sampleRate).toBe(48000);
    expect(metrics.channelCount).toBe(1);
  });

  it('reports correct duration', () => {
    const samples = sineBuffer(0.5, 440, 2.0);
    const buffer = makeMockBuffer(samples);
    const metrics = computeAudioMetrics(buffer);
    expect(metrics.durationSeconds).toBeCloseTo(2.0, 1);
  });
});

// ─── Format helpers ────────────────────────────────────────────────────────

describe('formatLufs', () => {
  it('formats finite LUFS with unit', () => {
    expect(formatLufs(-14.2)).toBe('-14.2 LUFS');
  });

  it('formats -Infinity as silent', () => {
    expect(formatLufs(-Infinity)).toBe('Silent');
  });
});

describe('formatDbLevel', () => {
  it('formats positive dB with sign', () => {
    expect(formatDbLevel(3.5)).toBe('+3.5 dB');
  });

  it('formats negative dB', () => {
    expect(formatDbLevel(-6.0)).toBe('-6.0 dB');
  });

  it('formats -Infinity as silent', () => {
    expect(formatDbLevel(-Infinity)).toBe('-∞ dB');
  });

  it('formats zero as 0.0 dB', () => {
    expect(formatDbLevel(0)).toBe('0.0 dB');
  });
});

describe('formatDbRange', () => {
  it('formats range without sign prefix', () => {
    expect(formatDbRange(8.5)).toBe('8.5 dB');
  });

  it('formats zero range', () => {
    expect(formatDbRange(0)).toBe('0.0 dB');
  });

  it('formats -Infinity as 0 dB', () => {
    expect(formatDbRange(-Infinity)).toBe('0 dB');
  });
});
