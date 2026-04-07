import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useVoiceVerificationStore } from '../voiceVerificationStore';

// Mock the service module
vi.mock('../../services/voiceVerificationService', () => ({
  getRandomPhrase: vi.fn((lang?: string) => ({
    id: lang === 'zh' ? 'zh-1' : 'en-1',
    text: lang === 'zh' ? '今天的天气非常好' : 'The quick brown fox',
    language: lang || 'en',
  })),
  submitVerification: vi.fn(),
  VoiceRecorder: vi.fn().mockImplementation(() => ({
    isRecording: false,
    duration: 0,
    startRecording: vi.fn(),
    stopRecording: vi.fn().mockResolvedValue(new Blob(['audio'], { type: 'audio/webm' })),
    dispose: vi.fn(),
  })),
}));

describe('voiceVerificationStore', () => {
  beforeEach(() => {
    useVoiceVerificationStore.getState().reset();
    // Reset settings to defaults to ensure test isolation
    useVoiceVerificationStore.getState().updateSettings({
      enabled: true,
      micDeviceId: null,
      minRecordingDurationSec: 3,
      maxRetries: 3,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initial state', () => {
    it('starts with modal closed and idle status', () => {
      const state = useVoiceVerificationStore.getState();
      expect(state.modalOpen).toBe(false);
      expect(state.status).toBe('idle');
      expect(state.currentPhrase).toBe(null);
      expect(state.spokenAudioBlob).toBe(null);
      expect(state.singingAudioBlob).toBe(null);
      expect(state.result).toBe(null);
      expect(state.error).toBe(null);
      expect(state.recordingDuration).toBe(0);
      expect(state.retryCount).toBe(0);
    });

    it('has default settings with verification enabled', () => {
      const { settings } = useVoiceVerificationStore.getState();
      expect(settings.enabled).toBe(true);
      expect(settings.micDeviceId).toBe(null);
      expect(settings.minRecordingDurationSec).toBe(3);
      expect(settings.maxRetries).toBe(3);
    });
  });

  describe('openVerification', () => {
    it('opens modal with singing blob and generates a phrase', () => {
      const singingBlob = new Blob(['singing'], { type: 'audio/webm' });
      useVoiceVerificationStore.getState().openVerification(singingBlob);

      const state = useVoiceVerificationStore.getState();
      expect(state.modalOpen).toBe(true);
      expect(state.status).toBe('idle');
      expect(state.singingAudioBlob).toBe(singingBlob);
      expect(state.currentPhrase).toBeTruthy();
      expect(state.currentPhrase!.id).toBe('en-1');
      expect(state.retryCount).toBe(0);
    });

    it('passes language to phrase generator', () => {
      const singingBlob = new Blob(['singing'], { type: 'audio/webm' });
      useVoiceVerificationStore.getState().openVerification(singingBlob, 'zh');

      const state = useVoiceVerificationStore.getState();
      expect(state.currentPhrase!.language).toBe('zh');
    });
  });

  describe('closeVerification', () => {
    it('resets all state', () => {
      const singingBlob = new Blob(['singing'], { type: 'audio/webm' });
      useVoiceVerificationStore.getState().openVerification(singingBlob);
      useVoiceVerificationStore.getState().closeVerification();

      const state = useVoiceVerificationStore.getState();
      expect(state.modalOpen).toBe(false);
      expect(state.status).toBe('idle');
      expect(state.currentPhrase).toBe(null);
      expect(state.singingAudioBlob).toBe(null);
    });
  });

  describe('submitVerification', () => {
    it('sets error when missing audio samples', async () => {
      await useVoiceVerificationStore.getState().submitVerification();

      const state = useVoiceVerificationStore.getState();
      expect(state.status).toBe('error');
      expect(state.error).toContain('Missing audio samples');
    });

    it('sets verified status on successful match', async () => {
      const { submitVerification: mockSubmit } = await import(
        '../../services/voiceVerificationService'
      );
      (mockSubmit as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        verified: true,
        confidence: 0.95,
        message: 'Voice matched',
      });

      const singingBlob = new Blob(['singing'], { type: 'audio/webm' });
      useVoiceVerificationStore.getState().openVerification(singingBlob);
      useVoiceVerificationStore.setState({
        spokenAudioBlob: new Blob(['spoken'], { type: 'audio/webm' }),
      });

      await useVoiceVerificationStore.getState().submitVerification();

      const state = useVoiceVerificationStore.getState();
      expect(state.status).toBe('verified');
      expect(state.result).toEqual({
        verified: true,
        confidence: 0.95,
        message: 'Voice matched',
      });
    });

    it('sets rejected status when voices do not match', async () => {
      const { submitVerification: mockSubmit } = await import(
        '../../services/voiceVerificationService'
      );
      (mockSubmit as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        verified: false,
        confidence: 0.2,
        message: 'No match',
      });

      const singingBlob = new Blob(['singing'], { type: 'audio/webm' });
      useVoiceVerificationStore.getState().openVerification(singingBlob);
      useVoiceVerificationStore.setState({
        spokenAudioBlob: new Blob(['spoken'], { type: 'audio/webm' }),
      });

      await useVoiceVerificationStore.getState().submitVerification();

      const state = useVoiceVerificationStore.getState();
      expect(state.status).toBe('rejected');
      expect(state.result!.verified).toBe(false);
    });

    it('sets error status on API failure', async () => {
      const { submitVerification: mockSubmit } = await import(
        '../../services/voiceVerificationService'
      );
      (mockSubmit as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Network error'),
      );

      const singingBlob = new Blob(['singing'], { type: 'audio/webm' });
      useVoiceVerificationStore.getState().openVerification(singingBlob);
      useVoiceVerificationStore.setState({
        spokenAudioBlob: new Blob(['spoken'], { type: 'audio/webm' }),
      });

      await useVoiceVerificationStore.getState().submitVerification();

      const state = useVoiceVerificationStore.getState();
      expect(state.status).toBe('error');
      expect(state.error).toBe('Network error');
    });
  });

  describe('retry', () => {
    it('increments retry count and generates new phrase', () => {
      const singingBlob = new Blob(['singing'], { type: 'audio/webm' });
      useVoiceVerificationStore.getState().openVerification(singingBlob);
      useVoiceVerificationStore.getState().retry();

      const state = useVoiceVerificationStore.getState();
      expect(state.retryCount).toBe(1);
      expect(state.status).toBe('idle');
      expect(state.spokenAudioBlob).toBe(null);
      expect(state.result).toBe(null);
    });

    it('prevents retry beyond max attempts', () => {
      const singingBlob = new Blob(['singing'], { type: 'audio/webm' });
      useVoiceVerificationStore.getState().openVerification(singingBlob);

      // Exhaust retries
      for (let i = 0; i < 3; i++) {
        useVoiceVerificationStore.getState().retry();
      }

      useVoiceVerificationStore.getState().retry();

      const state = useVoiceVerificationStore.getState();
      expect(state.status).toBe('error');
      expect(state.error).toContain('Maximum retry attempts');
    });
  });

  describe('updateSettings', () => {
    it('partially updates settings', () => {
      useVoiceVerificationStore.getState().updateSettings({
        enabled: false,
        maxRetries: 5,
      });

      const { settings } = useVoiceVerificationStore.getState();
      expect(settings.enabled).toBe(false);
      expect(settings.maxRetries).toBe(5);
      // Other settings unchanged
      expect(settings.minRecordingDurationSec).toBe(3);
    });

    it('updates mic device ID', () => {
      useVoiceVerificationStore.getState().updateSettings({
        micDeviceId: 'device-123',
      });

      const { settings } = useVoiceVerificationStore.getState();
      expect(settings.micDeviceId).toBe('device-123');
    });
  });

  describe('isVerificationRequired', () => {
    it('returns true when verification is enabled', () => {
      expect(useVoiceVerificationStore.getState().isVerificationRequired()).toBe(true);
    });

    it('returns false when verification is disabled', () => {
      useVoiceVerificationStore.getState().updateSettings({ enabled: false });
      expect(useVoiceVerificationStore.getState().isVerificationRequired()).toBe(false);
    });
  });

  describe('reset', () => {
    it('resets transient state but preserves settings', () => {
      useVoiceVerificationStore.getState().updateSettings({ maxRetries: 10 });
      const singingBlob = new Blob(['singing'], { type: 'audio/webm' });
      useVoiceVerificationStore.getState().openVerification(singingBlob);

      useVoiceVerificationStore.getState().reset();

      const state = useVoiceVerificationStore.getState();
      expect(state.modalOpen).toBe(false);
      expect(state.status).toBe('idle');
      // Settings preserved
      expect(state.settings.maxRetries).toBe(10);
    });
  });
});
