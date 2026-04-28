import { describe, expect, it } from 'vitest';
import { computeWaveformPeaks } from '../waveformPeaks';

function mockAudioBuffer(samples: Float32Array): AudioBuffer {
  return {
    numberOfChannels: 1,
    length: samples.length,
    sampleRate: 48000,
    duration: samples.length / 48000,
    getChannelData: (channel: number) => {
      if (channel !== 0) throw new Error('only channel 0');
      return samples;
    },
  } as unknown as AudioBuffer;
}

describe('computeWaveformPeaks', () => {
  it('preserves peaks when the requested peak count exceeds sample count', () => {
    const peaks = computeWaveformPeaks(
      mockAudioBuffer(new Float32Array([0.25, -0.5, 0.75, -1])),
      8,
    );

    expect(peaks.some((value) => value > 0)).toBe(true);
    expect(peaks.some((value) => value < 0)).toBe(true);
  });
});
