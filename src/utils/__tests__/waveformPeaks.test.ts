import { describe, expect, it } from 'vitest';
import { computeWaveformPeaks, PEAK_STRIDE } from '../waveformPeaks';

function mockAudioBuffer(channels: Float32Array[]): AudioBuffer {
  return {
    numberOfChannels: channels.length,
    length: channels[0].length,
    sampleRate: 44100,
    duration: channels[0].length / 44100,
    getChannelData: (channel: number) => channels[channel] ?? channels[0],
  } as AudioBuffer;
}

describe('waveformPeaks', () => {
  describe('PEAK_STRIDE', () => {
    it('is 4 (Lmax, Lmin, Rmax, Rmin)', () => {
      expect(PEAK_STRIDE).toBe(4);
    });
  });

  describe('computeWaveformPeaks', () => {
    it('returns correct length: numPeaks * 4', () => {
      const buffer = mockAudioBuffer([new Float32Array(100)]);
      const peaks = computeWaveformPeaks(buffer, 10);

      expect(peaks.length).toBe(40);
    });

    it('returns zeros for silent mono audio', () => {
      const buffer = mockAudioBuffer([new Float32Array(100)]);
      const peaks = computeWaveformPeaks(buffer, 5);

      expect(peaks.every((value) => value === 0)).toBe(true);
    });

    it('detects positive peaks in mono audio', () => {
      const data = new Float32Array(100);
      data[5] = 0.8;
      const peaks = computeWaveformPeaks(mockAudioBuffer([data]), 5);

      expect(peaks[0]).toBeCloseTo(0.8);
      expect(peaks[1]).toBe(0);
      expect(peaks[2]).toBeCloseTo(0.8);
      expect(peaks[3]).toBe(0);
    });

    it('detects negative peaks', () => {
      const data = new Float32Array(100);
      data[5] = -0.6;
      const peaks = computeWaveformPeaks(mockAudioBuffer([data]), 5);

      expect(peaks[0]).toBe(0);
      expect(peaks[1]).toBeCloseTo(-0.6);
    });

    it('handles stereo with different L/R data', () => {
      const left = new Float32Array(100);
      const right = new Float32Array(100);
      left[0] = 0.5;
      right[0] = 0.9;
      const peaks = computeWaveformPeaks(mockAudioBuffer([left, right]), 5);

      expect(peaks[0]).toBeCloseTo(0.5);
      expect(peaks[2]).toBeCloseTo(0.9);
    });

    it('respects startSample parameter', () => {
      const data = new Float32Array(100);
      data[0] = 1.0;
      data[50] = 0.7;
      const peaks = computeWaveformPeaks(mockAudioBuffer([data]), 5, 50);

      expect(peaks[0]).toBeCloseTo(0.7);
    });

    it('respects endSample parameter', () => {
      const data = new Float32Array(100);
      data[10] = 0.3;
      data[90] = 1.0;
      const peaks = computeWaveformPeaks(mockAudioBuffer([data]), 5, 0, 50);
      const lastIdx = (5 - 1) * PEAK_STRIDE;

      expect(peaks[lastIdx]).toBe(0);
    });

    it('preserves peaks when the requested peak count exceeds sample count', () => {
      const peaks = computeWaveformPeaks(
        mockAudioBuffer([new Float32Array([0.25, -0.5, 0.75, -1])]),
        8,
      );

      expect(peaks.some((value) => value > 0)).toBe(true);
      expect(peaks.some((value) => value < 0)).toBe(true);
    });

    it('returns zeros when the region is empty', () => {
      const peaks = computeWaveformPeaks(mockAudioBuffer([new Float32Array(2)]), 100, 2, 2);

      expect(peaks.length).toBe(400);
      expect(peaks.every((value) => value === 0)).toBe(true);
    });

    it('correctly processes a full waveform', () => {
      const length = 200;
      const data = new Float32Array(length);
      for (let i = 0; i < length; i += 1) {
        data[i] = Math.sin((2 * Math.PI * i) / 100);
      }

      const peaks = computeWaveformPeaks(mockAudioBuffer([data]), 4);

      expect(peaks[0]).toBeGreaterThan(0.9);
      expect(peaks[1 * PEAK_STRIDE + 1]).toBeLessThan(-0.9);
    });
  });
});
