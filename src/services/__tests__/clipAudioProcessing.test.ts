import { describe, it, expect } from 'vitest';
import {
  reverseAudioBuffer,
  normalizeAudioBuffer,
  applyGainToAudioBuffer,
  extractClipAudioSegment,
} from '../clipAudioProcessing';
import type { Clip } from '../../types/project';

function createMockBuffer(
  channels: Float32Array[],
  sampleRate: number = 48000,
) {
  const length = channels[0]?.length ?? 0;
  return {
    numberOfChannels: channels.length,
    length,
    sampleRate,
    duration: length / sampleRate,
    getChannelData: (ch: number) => channels[ch],
    copyFromChannel: () => {},
    copyToChannel: () => {},
  } as unknown as AudioBuffer;
}

describe('clipAudioProcessing', () => {
  describe('extractClipAudioSegment', () => {
    it('extracts the currently audible source window from isolated audio', () => {
      const source = createMockBuffer([new Float32Array([0.1, 0.2, 0.3, 0.4])], 1);
      const clip = {
        id: 'clip-1',
        startTime: 0,
        duration: 2,
        audioDuration: 4,
        audioOffset: 1,
        isolatedAudioKey: 'isolated-key',
        cumulativeMixKey: null,
      } as Clip;

      const result = extractClipAudioSegment(source, clip);

      expect(result.duration).toBe(2);
      expect(result.getChannelData(0)[0]).toBeCloseTo(0.2);
      expect(result.getChannelData(0)[1]).toBeCloseTo(0.3);
    });

    it('extracts project-time windows for cumulative mix audio', () => {
      const source = createMockBuffer([new Float32Array([0.1, 0.2, 0.3, 0.4])], 1);
      const clip = {
        id: 'clip-1',
        startTime: 1,
        duration: 2,
        audioDuration: 4,
        audioOffset: 0,
        isolatedAudioKey: null,
        cumulativeMixKey: 'cumulative-key',
      } as Clip;

      const result = extractClipAudioSegment(source, clip);

      expect(result.duration).toBe(2);
      expect(result.getChannelData(0)[0]).toBeCloseTo(0.2);
      expect(result.getChannelData(0)[1]).toBeCloseTo(0.3);
    });

    it('includes source trim offset for cumulative mix audio', () => {
      const source = createMockBuffer([new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5])], 1);
      const clip = {
        id: 'clip-1',
        startTime: 1,
        duration: 2,
        audioDuration: 5,
        audioOffset: 1,
        isolatedAudioKey: null,
        cumulativeMixKey: 'cumulative-key',
      } as Clip;

      const result = extractClipAudioSegment(source, clip);

      expect(result.duration).toBe(2);
      expect(result.getChannelData(0)[0]).toBeCloseTo(0.3);
      expect(result.getChannelData(0)[1]).toBeCloseTo(0.4);
    });

    it('uses source span for repitched cumulative mix audio', () => {
      const source = createMockBuffer([new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5])], 1);
      const clip = {
        id: 'clip-1',
        startTime: 1,
        duration: 4,
        audioDuration: 5,
        audioOffset: 0,
        timeStretchRate: 0.5,
        stretchMode: 'repitch',
        isolatedAudioKey: null,
        cumulativeMixKey: 'cumulative-key',
      } as Clip;

      const result = extractClipAudioSegment(source, clip);

      expect(result.duration).toBe(2);
      expect(result.getChannelData(0)[0]).toBeCloseTo(0.2);
      expect(result.getChannelData(0)[1]).toBeCloseTo(0.3);
    });
  });

  describe('reverseAudioBuffer', () => {
    it('reverses a mono audio buffer', () => {
      const source = createMockBuffer([new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5])]);

      const result = reverseAudioBuffer(source);

      const output = result.getChannelData(0);
      expect(output[0]).toBeCloseTo(0.5);
      expect(output[1]).toBeCloseTo(0.4);
      expect(output[2]).toBeCloseTo(0.3);
      expect(output[3]).toBeCloseTo(0.2);
      expect(output[4]).toBeCloseTo(0.1);
    });

    it('reverses a stereo audio buffer', () => {
      const source = createMockBuffer([
        new Float32Array([0.1, 0.2, 0.3]),
        new Float32Array([0.4, 0.5, 0.6]),
      ]);

      const result = reverseAudioBuffer(source);

      expect(result.getChannelData(0)[0]).toBeCloseTo(0.3);
      expect(result.getChannelData(0)[2]).toBeCloseTo(0.1);
      expect(result.getChannelData(1)[0]).toBeCloseTo(0.6);
      expect(result.getChannelData(1)[2]).toBeCloseTo(0.4);
    });

    it('preserves buffer properties', () => {
      const source = createMockBuffer([new Float32Array([0.1, 0.2, 0.3])], 44100);

      const result = reverseAudioBuffer(source);

      expect(result.length).toBe(3);
      expect(result.sampleRate).toBe(44100);
      expect(result.numberOfChannels).toBe(1);
    });

    it('double-reverse returns original samples', () => {
      const input = new Float32Array([0.1, -0.5, 0.9, -0.2]);
      const source = createMockBuffer([input]);

      const reversed = reverseAudioBuffer(source);
      const doubleReversed = reverseAudioBuffer(reversed);

      const output = doubleReversed.getChannelData(0);
      for (let i = 0; i < input.length; i++) {
        expect(output[i]).toBeCloseTo(input[i]);
      }
    });

    it('handles single-sample buffer', () => {
      const source = createMockBuffer([new Float32Array([0.7])]);

      const result = reverseAudioBuffer(source);

      expect(result.getChannelData(0)[0]).toBeCloseTo(0.7);
    });
  });

  describe('normalizeAudioBuffer', () => {
    it('normalizes quiet audio to target peak', () => {
      const source = createMockBuffer([new Float32Array([0.1, 0.2, 0.5, 0.3])]);

      const result = normalizeAudioBuffer(source, 1.0);

      const output = result.getChannelData(0);
      // Peak was 0.5, target is 1.0, gain = 2.0
      expect(output[0]).toBeCloseTo(0.2);
      expect(output[2]).toBeCloseTo(1.0);
    });

    it('returns same buffer for silent audio', () => {
      const source = createMockBuffer([new Float32Array([0, 0, 0])]);

      const result = normalizeAudioBuffer(source);

      expect(result).toBe(source);
    });

    it('returns same buffer when already at target peak', () => {
      const source = createMockBuffer([new Float32Array([0.1, -0.99, 0.3])]);

      const result = normalizeAudioBuffer(source, 0.99);

      expect(result).toBe(source);
    });

    it('handles negative peak values correctly', () => {
      const source = createMockBuffer([new Float32Array([0.1, -0.4, 0.2])]);

      const result = normalizeAudioBuffer(source, 0.8);

      const output = result.getChannelData(0);
      // Peak is 0.4, target is 0.8, gain = 2.0
      expect(output[1]).toBeCloseTo(-0.8);
      expect(output[0]).toBeCloseTo(0.2);
    });

    it('normalizes stereo using cross-channel peak', () => {
      const source = createMockBuffer([
        new Float32Array([0.2, 0.4]),
        new Float32Array([0.8, 0.1]),
      ]);

      const result = normalizeAudioBuffer(source, 0.8);

      // Peak across both channels is 0.8, target is 0.8 — no change
      expect(result).toBe(source);
    });

    it('scales all channels equally based on cross-channel peak', () => {
      const source = createMockBuffer([
        new Float32Array([0.1, 0.2]),
        new Float32Array([0.5, 0.1]),
      ]);

      const result = normalizeAudioBuffer(source, 1.0);

      // Peak is 0.5 (right ch), gain = 2.0
      expect(result.getChannelData(0)[0]).toBeCloseTo(0.2);
      expect(result.getChannelData(1)[0]).toBeCloseTo(1.0);
    });
  });

  describe('applyGainToAudioBuffer', () => {
    it('applies gain multiplier to all samples', () => {
      const source = createMockBuffer([new Float32Array([0.1, 0.2, 0.3, 0.4])]);

      const result = applyGainToAudioBuffer(source, 2.0);

      const output = result.getChannelData(0);
      expect(output[0]).toBeCloseTo(0.2);
      expect(output[1]).toBeCloseTo(0.4);
      expect(output[2]).toBeCloseTo(0.6);
      expect(output[3]).toBeCloseTo(0.8);
    });

    it('returns same buffer when gain is 1.0', () => {
      const source = createMockBuffer([new Float32Array([0.5])]);

      const result = applyGainToAudioBuffer(source, 1.0);

      expect(result).toBe(source);
    });

    it('clamps output to [-1, 1] range', () => {
      const source = createMockBuffer([new Float32Array([0.8, -0.9])]);

      const result = applyGainToAudioBuffer(source, 3.0);

      const output = result.getChannelData(0);
      expect(output[0]).toBe(1);
      expect(output[1]).toBe(-1);
    });

    it('reduces volume with gain < 1', () => {
      const source = createMockBuffer([new Float32Array([0.8, -0.6])]);

      const result = applyGainToAudioBuffer(source, 0.5);

      const output = result.getChannelData(0);
      expect(output[0]).toBeCloseTo(0.4);
      expect(output[1]).toBeCloseTo(-0.3);
    });

    it('handles stereo buffers', () => {
      const source = createMockBuffer([
        new Float32Array([0.3]),
        new Float32Array([0.5]),
      ]);

      const result = applyGainToAudioBuffer(source, 2.0);

      expect(result.getChannelData(0)[0]).toBeCloseTo(0.6);
      expect(result.getChannelData(1)[0]).toBeCloseTo(1.0);
    });

    it('handles zero gain (silence)', () => {
      const source = createMockBuffer([new Float32Array([0.5, -0.3])]);

      const result = applyGainToAudioBuffer(source, 0);

      const output = result.getChannelData(0);
      expect(output[0]).toBeCloseTo(0);
      expect(output[1]).toBeCloseTo(0);
    });
  });
});
