import { describe, expect, it, vi } from 'vitest';
import { downsampleWavBlob } from '../../src/utils/audioDownsample';

// Mock OfflineAudioContext since it's not available in Vitest's jsdom environment
vi.stubGlobal('OfflineAudioContext', class {
  numberOfChannels: number;
  length: number;
  sampleRate: number;
  constructor(channels: number, length: number, rate: number) {
    this.numberOfChannels = channels;
    this.length = length;
    this.sampleRate = rate;
  }
  decodeAudioData(): Promise<never> {
    return Promise.reject(new Error('not implemented in test'));
  }
  createBufferSource() { return { buffer: null, connect: vi.fn(), start: vi.fn() }; }
  startRendering(): Promise<never> {
    return Promise.reject(new Error('not implemented in test'));
  }
});

describe('audioDownsample', () => {
  describe('downsampleWavBlob', () => {
    it('returns the original blob unchanged when it is smaller than 500 KB', async () => {
      // 499 KB blob — below the SKIP_THRESHOLD_BYTES constant
      const smallBlob = new Blob([new Uint8Array(499_000)], { type: 'audio/wav' });

      const result = await downsampleWavBlob(smallBlob);

      expect(result).toBe(smallBlob);
    });

    it('falls back to the original blob when AudioContext decode fails', async () => {
      // A blob large enough to trigger downsampling but whose bytes cannot be decoded
      const largeBlob = new Blob([new Uint8Array(600_000)], { type: 'audio/wav' });

      const result = await downsampleWavBlob(largeBlob);

      // decodeAudioData throws (stubbed), so we expect the original back
      expect(result).toBe(largeBlob);
    });
  });
});
