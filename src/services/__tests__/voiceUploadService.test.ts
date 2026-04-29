import { describe, it, expect, vi } from 'vitest';
import {
  processVoiceAudioFile,
  isVoiceUploadError,
  computeSimplePeaks,
  VOICE_MIN_DURATION_SECONDS,
} from '../voiceUploadService';

function createMockAudioBuffer(duration: number, sampleRate = 44100): AudioBuffer {
  const length = Math.floor(duration * sampleRate);
  const channelData = new Float32Array(length);
  // Fill with a simple sine wave
  for (let i = 0; i < length; i++) {
    channelData[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate);
  }
  return {
    duration,
    length,
    sampleRate,
    numberOfChannels: 1,
    getChannelData: () => channelData,
    copyFromChannel: vi.fn(),
    copyToChannel: vi.fn(),
  } as unknown as AudioBuffer;
}

describe('voiceUploadService', () => {
  describe('processVoiceAudioFile', () => {
    it('rejects unsupported file types', async () => {
      const file = new File(['data'], 'test.txt', { type: 'text/plain' });
      const ctx = {
        decodeAudioData: vi.fn(),
      } as unknown as AudioContext;

      const result = await processVoiceAudioFile(file, ctx);
      expect(isVoiceUploadError(result)).toBe(true);
      if (isVoiceUploadError(result)) {
        expect(result.type).toBe('invalid_type');
      }
    });

    it('rejects files shorter than minimum duration', async () => {
      const audioBuffer = createMockAudioBuffer(3); // 3 seconds
      const file = new File(['audio'], 'short.wav', { type: 'audio/wav' });
      const ctx = {
        decodeAudioData: vi.fn().mockResolvedValue(audioBuffer),
      } as unknown as AudioContext;

      const result = await processVoiceAudioFile(file, ctx);
      expect(isVoiceUploadError(result)).toBe(true);
      if (isVoiceUploadError(result)) {
        expect(result.type).toBe('too_short');
        expect(result.message).toContain(`${VOICE_MIN_DURATION_SECONDS}`);
      }
    });

    it('processes valid audio files successfully', async () => {
      const audioBuffer = createMockAudioBuffer(30); // 30 seconds
      const file = new File(['audio'], 'good-voice.wav', { type: 'audio/wav' });
      const ctx = {
        decodeAudioData: vi.fn().mockResolvedValue(audioBuffer),
      } as unknown as AudioContext;

      const result = await processVoiceAudioFile(file, ctx);
      expect(isVoiceUploadError(result)).toBe(false);
      if (!isVoiceUploadError(result)) {
        expect(result.name).toBe('good-voice');
        expect(result.durationSeconds).toBe(30);
        expect(result.source).toBe('upload');
        expect(result.waveformPeaks).toHaveLength(64);
        expect(result.blob).toBe(file);
      }
    });

    it('returns decode error when audio cannot be decoded', async () => {
      const file = new File(['bad'], 'corrupt.wav', { type: 'audio/wav' });
      const ctx = {
        decodeAudioData: vi.fn().mockRejectedValue(new Error('decode fail')),
      } as unknown as AudioContext;

      const result = await processVoiceAudioFile(file, ctx);
      expect(isVoiceUploadError(result)).toBe(true);
      if (isVoiceUploadError(result)) {
        expect(result.type).toBe('decode_error');
      }
    });

    it('accepts files with valid extensions but no MIME type', async () => {
      const audioBuffer = createMockAudioBuffer(10);
      const file = new File(['audio'], 'voice.mp3', { type: '' });
      const ctx = {
        decodeAudioData: vi.fn().mockResolvedValue(audioBuffer),
      } as unknown as AudioContext;

      const result = await processVoiceAudioFile(file, ctx);
      expect(isVoiceUploadError(result)).toBe(false);
    });
  });

  describe('computeSimplePeaks', () => {
    it('computes correct number of peaks', () => {
      const audioBuffer = createMockAudioBuffer(1); // 1 second
      const peaks = computeSimplePeaks(audioBuffer, 32);
      expect(peaks).toHaveLength(32);
    });

    it('returns values between 0 and 1', () => {
      const audioBuffer = createMockAudioBuffer(1);
      const peaks = computeSimplePeaks(audioBuffer, 16);
      for (const p of peaks) {
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(1);
      }
    });

    it('returns zeros for empty buffer', () => {
      const audioBuffer = {
        duration: 0,
        length: 0,
        sampleRate: 44100,
        numberOfChannels: 1,
        getChannelData: () => new Float32Array(0),
      } as unknown as AudioBuffer;
      const peaks = computeSimplePeaks(audioBuffer, 8);
      expect(peaks).toHaveLength(8);
      expect(peaks.every((p) => p === 0)).toBe(true);
    });
  });

  describe('isVoiceUploadError', () => {
    it('returns true for error objects', () => {
      expect(isVoiceUploadError({ type: 'invalid_type', message: 'bad' })).toBe(true);
    });

    it('returns false for success results', () => {
      expect(
        isVoiceUploadError({
          blob: new Blob(),
          name: 'test',
          durationSeconds: 10,
          waveformPeaks: [],
          source: 'upload',
        }),
      ).toBe(false);
    });
  });
});
