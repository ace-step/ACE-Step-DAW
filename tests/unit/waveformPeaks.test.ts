import { describe, expect, it } from 'vitest';
import { computeWaveformPeaks, PEAK_STRIDE } from '../../src/utils/waveformPeaks';

function createAudioBufferMock(samples: number[]): AudioBuffer {
  return {
    numberOfChannels: 1,
    getChannelData: () => Float32Array.from(samples),
  } as AudioBuffer;
}

function createStereoAudioBufferMock(left: number[], right: number[]): AudioBuffer {
  const channels = [Float32Array.from(left), Float32Array.from(right)];
  return {
    numberOfChannels: 2,
    getChannelData: (ch: number) => channels[ch],
  } as AudioBuffer;
}

describe('computeWaveformPeaks', () => {
  it('PEAK_STRIDE is 4', () => {
    expect(PEAK_STRIDE).toBe(4);
  });

  it('returns 4 values per peak for mono buffer (Lmax, Lmin, Rmax, Rmin)', () => {
    // 8 samples → 4 peaks, each peak = 2 samples
    const peaks = computeWaveformPeaks(
      createAudioBufferMock([0.1, -0.2, 0.5, -0.7, 0.9, -0.4, 0.3, -0.1]),
      4,
    );

    expect(peaks).toHaveLength(4 * PEAK_STRIDE); // 16
    // Peak 0: samples [0.1, -0.2] → max=0.1, min=-0.2
    expect(peaks[0]).toBeCloseTo(0.1, 5);   // Lmax
    expect(peaks[1]).toBeCloseTo(-0.2, 5);  // Lmin
    expect(peaks[2]).toBeCloseTo(0.1, 5);   // Rmax (same as L for mono)
    expect(peaks[3]).toBeCloseTo(-0.2, 5);  // Rmin
    // Peak 1: samples [0.5, -0.7] → max=0.5, min=-0.7
    expect(peaks[4]).toBeCloseTo(0.5, 5);
    expect(peaks[5]).toBeCloseTo(-0.7, 5);
  });

  it('returns correct min/max for stereo buffer', () => {
    const left =  [0.3, -0.5, 0.8, -0.2];
    const right = [0.1, -0.9, 0.4, -0.6];
    const peaks = computeWaveformPeaks(
      createStereoAudioBufferMock(left, right),
      2,
    );

    expect(peaks).toHaveLength(2 * PEAK_STRIDE); // 8
    // Peak 0: L=[0.3, -0.5], R=[0.1, -0.9]
    expect(peaks[0]).toBeCloseTo(0.3, 5);   // Lmax
    expect(peaks[1]).toBeCloseTo(-0.5, 5);  // Lmin
    expect(peaks[2]).toBeCloseTo(0.1, 5);   // Rmax
    expect(peaks[3]).toBeCloseTo(-0.9, 5);  // Rmin
    // Peak 1: L=[0.8, -0.2], R=[0.4, -0.6]
    expect(peaks[4]).toBeCloseTo(0.8, 5);   // Lmax
    expect(peaks[5]).toBeCloseTo(-0.2, 5);  // Lmin
    expect(peaks[6]).toBeCloseTo(0.4, 5);   // Rmax
    expect(peaks[7]).toBeCloseTo(-0.6, 5);  // Rmin
  });

  it('returns all zeros for a silent buffer', () => {
    const peaks = computeWaveformPeaks(createAudioBufferMock([0, 0, 0, 0]), 4);
    expect(peaks).toHaveLength(4 * PEAK_STRIDE);
    expect(peaks.every((p) => p === 0)).toBe(true);
  });

  it('returns zeros when a single sample is spread across multiple requested peaks', () => {
    const peaks = computeWaveformPeaks(createAudioBufferMock([0.75]), 4);
    expect(peaks).toHaveLength(4 * PEAK_STRIDE);
    expect(peaks.every((p) => p === 0)).toBe(true);
  });
});
