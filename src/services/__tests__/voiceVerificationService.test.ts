import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getRandomPhrase,
  getAllPhrases,
  submitVerification,
  detectAudioFormat,
  VoiceRecorder,
} from '../voiceVerificationService';

describe('voiceVerificationService', () => {
  describe('getRandomPhrase', () => {
    it('returns a phrase with id, text, and language', () => {
      const phrase = getRandomPhrase();
      expect(phrase).toHaveProperty('id');
      expect(phrase).toHaveProperty('text');
      expect(phrase).toHaveProperty('language');
      expect(phrase.text.length).toBeGreaterThan(10);
    });

    it('filters by language when specified', () => {
      const phrase = getRandomPhrase('zh');
      expect(phrase.language).toBe('zh');
      expect(phrase.id).toMatch(/^zh-/);
    });

    it('falls back to all phrases for unknown language', () => {
      const phrase = getRandomPhrase('xx');
      expect(phrase).toHaveProperty('id');
      expect(phrase).toHaveProperty('text');
    });
  });

  describe('getAllPhrases', () => {
    it('returns a non-empty readonly array', () => {
      const phrases = getAllPhrases();
      expect(phrases.length).toBeGreaterThan(0);
    });

    it('includes both English and Chinese phrases', () => {
      const phrases = getAllPhrases();
      const languages = new Set(phrases.map((p) => p.language));
      expect(languages.has('en')).toBe(true);
      expect(languages.has('zh')).toBe(true);
    });

    it('all phrases have unique IDs', () => {
      const phrases = getAllPhrases();
      const ids = phrases.map((p) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe('submitVerification', () => {
    const mockFetch = vi.fn();

    beforeEach(() => {
      vi.stubGlobal('fetch', mockFetch);
      // Clear localStorage to use default /api base
      localStorage.removeItem('ace-step-daw-backend-url');
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('sends POST request with base64-encoded audio', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { verified: true, confidence: 0.95, message: 'Voice matched' },
        }),
      });

      const spokenBlob = new Blob(['spoken-audio-data'], { type: 'audio/webm' });
      const singingBlob = new Blob(['singing-audio-data'], { type: 'audio/webm' });

      const result = await submitVerification('en-1', spokenBlob, singingBlob);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('/api/v1/voice_verify');
      expect(options.method).toBe('POST');
      expect(options.headers['Content-Type']).toBe('application/json');

      const body = JSON.parse(options.body);
      expect(body.phrase_id).toBe('en-1');
      expect(body.spoken_audio).toBeTruthy();
      expect(body.singing_audio).toBeTruthy();
      expect(body.audio_format).toBe('webm');
    });

    it('returns verification result on success', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { verified: true, confidence: 0.92, message: 'Match confirmed' },
        }),
      });

      const result = await submitVerification(
        'en-1',
        new Blob(['spoken'], { type: 'audio/webm' }),
        new Blob(['singing'], { type: 'audio/webm' }),
      );

      expect(result.verified).toBe(true);
      expect(result.confidence).toBe(0.92);
      expect(result.message).toBe('Match confirmed');
    });

    it('returns rejection result when voices do not match', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { verified: false, confidence: 0.3, message: 'Voices do not match' },
        }),
      });

      const result = await submitVerification(
        'en-1',
        new Blob(['spoken'], { type: 'audio/webm' }),
        new Blob(['singing'], { type: 'audio/webm' }),
      );

      expect(result.verified).toBe(false);
      expect(result.confidence).toBe(0.3);
    });

    it('throws on HTTP error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      });

      await expect(
        submitVerification(
          'en-1',
          new Blob(['spoken'], { type: 'audio/webm' }),
          new Blob(['singing'], { type: 'audio/webm' }),
        ),
      ).rejects.toThrow('Voice verification failed: 500');
    });

    it('handles direct response format (no envelope)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ verified: true, confidence: 0.88, message: 'OK' }),
      });

      const result = await submitVerification(
        'en-1',
        new Blob(['spoken'], { type: 'audio/webm' }),
        new Blob(['singing'], { type: 'audio/webm' }),
      );

      expect(result.verified).toBe(true);
      expect(result.confidence).toBe(0.88);
    });

    it('calls /v1/voice_verify endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { verified: true, confidence: 0.9, message: 'OK' },
        }),
      });

      await submitVerification(
        'en-1',
        new Blob(['spoken'], { type: 'audio/webm' }),
        new Blob(['singing'], { type: 'audio/webm' }),
      );

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('/v1/voice_verify');
    });
  });

  describe('detectAudioFormat', () => {
    it('returns wav for audio/wav', () => {
      expect(detectAudioFormat('audio/wav')).toBe('wav');
    });

    it('returns wav for audio/x-wav', () => {
      expect(detectAudioFormat('audio/x-wav')).toBe('wav');
    });

    it('returns webm for audio/webm', () => {
      expect(detectAudioFormat('audio/webm')).toBe('webm');
    });

    it('returns webm for audio/webm;codecs=opus', () => {
      expect(detectAudioFormat('audio/webm;codecs=opus')).toBe('webm');
    });

    it('returns webm for empty string', () => {
      expect(detectAudioFormat('')).toBe('webm');
    });
  });

  describe('VoiceRecorder', () => {
    it('reports not recording initially', () => {
      const recorder = new VoiceRecorder();
      expect(recorder.isRecording).toBe(false);
      expect(recorder.duration).toBe(0);
    });

    it('isSupported checks for MediaRecorder and getUserMedia', () => {
      // In test environment, MediaRecorder may not be available
      const result = VoiceRecorder.isSupported();
      expect(typeof result).toBe('boolean');
    });

    it('dispose is safe to call when not recording', () => {
      const recorder = new VoiceRecorder();
      expect(() => recorder.dispose()).not.toThrow();
    });
  });
});
