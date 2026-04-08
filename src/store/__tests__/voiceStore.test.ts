import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock idb-keyval before importing voiceStore
const mockGet = vi.fn();
const mockSet = vi.fn();
const mockDel = vi.fn();
const mockKeys = vi.fn(() => Promise.resolve([]));

vi.mock('idb-keyval', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  set: (...args: unknown[]) => mockSet(...args),
  del: (...args: unknown[]) => mockDel(...args),
  keys: () => mockKeys(),
}));

import { useVoiceStore, MIN_VOICE_SAMPLE_DURATION, ACCEPTED_VOICE_MIME_TYPES, ACCEPTED_VOICE_EXTENSIONS } from '../voiceStore';
import type { VoiceProfile } from '../../types/voice';
import { DEFAULT_AUDIO_INFLUENCE, DEFAULT_STYLE_INFLUENCE } from '../../types/voice';

function makeProfile(overrides: Partial<VoiceProfile> = {}): VoiceProfile {
  return {
    id: `voice-${Math.random().toString(36).slice(2)}`,
    name: 'Test Voice',
    audioKey: 'voice-audio:test-id',
    duration: 45,
    defaultAudioInfluence: DEFAULT_AUDIO_INFLUENCE,
    defaultStyleInfluence: DEFAULT_STYLE_INFLUENCE,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe('voiceStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockSet.mockResolvedValue(undefined);
    mockDel.mockResolvedValue(undefined);
    mockGet.mockResolvedValue(undefined);
    mockKeys.mockResolvedValue([]);
    useVoiceStore.setState(useVoiceStore.getInitialState(), true);
  });

  describe('initial state', () => {
    it('starts with empty profiles', () => {
      expect(useVoiceStore.getState().profiles).toEqual([]);
    });

    it('starts with no recording in progress', () => {
      expect(useVoiceStore.getState().recordingProfileId).toBeNull();
    });

    it('starts with no processing', () => {
      expect(useVoiceStore.getState().isProcessing).toBe(false);
    });

    it('starts with no error', () => {
      expect(useVoiceStore.getState().error).toBeNull();
    });
  });

  describe('CRUD operations', () => {
    it('adds a voice profile', () => {
      const profile = makeProfile({ id: 'v1', name: 'Singer A' });
      useVoiceStore.getState().addProfile(profile);

      const profiles = useVoiceStore.getState().profiles;
      expect(profiles).toHaveLength(1);
      expect(profiles[0].name).toBe('Singer A');
    });

    it('removes a voice profile and deletes audio', async () => {
      const profile = makeProfile({ id: 'v1' });
      useVoiceStore.getState().addProfile(profile);
      await useVoiceStore.getState().removeProfile('v1');

      expect(useVoiceStore.getState().profiles).toHaveLength(0);
      expect(mockDel).toHaveBeenCalledWith('voice-audio:v1');
    });

    it('updates a voice profile', () => {
      const profile = makeProfile({ id: 'v1', name: 'Old Name' });
      useVoiceStore.getState().addProfile(profile);
      useVoiceStore.getState().updateProfile('v1', { name: 'New Name' });

      expect(useVoiceStore.getState().profiles[0].name).toBe('New Name');
    });

    it('sets updatedAt when updating', () => {
      const profile = makeProfile({ id: 'v1', updatedAt: 1000 });
      useVoiceStore.getState().addProfile(profile);
      useVoiceStore.getState().updateProfile('v1', { name: 'Updated' });

      expect(useVoiceStore.getState().profiles[0].updatedAt).toBeGreaterThan(1000);
    });

    it('retrieves a profile by ID', () => {
      const profile = makeProfile({ id: 'v1', name: 'Found' });
      useVoiceStore.getState().addProfile(profile);

      expect(useVoiceStore.getState().getProfile('v1')?.name).toBe('Found');
      expect(useVoiceStore.getState().getProfile('nonexistent')).toBeUndefined();
    });
  });

  describe('saveVoiceFromBlob', () => {
    it('saves a valid voice sample', async () => {
      const blob = new Blob(['audio data'], { type: 'audio/wav' });
      const result = await useVoiceStore.getState().saveVoiceFromBlob({
        name: 'My Voice',
        blob,
        duration: 45,
      });

      expect(result).not.toBeNull();
      expect(result!.name).toBe('My Voice');
      expect(result!.duration).toBe(45);
      expect(result!.defaultAudioInfluence).toBe(DEFAULT_AUDIO_INFLUENCE);
      expect(result!.defaultStyleInfluence).toBe(DEFAULT_STYLE_INFLUENCE);
      expect(useVoiceStore.getState().profiles).toHaveLength(1);
      expect(useVoiceStore.getState().isProcessing).toBe(false);
      expect(mockSet).toHaveBeenCalledTimes(1);
    });

    it('rejects samples shorter than minimum duration', async () => {
      const blob = new Blob(['short'], { type: 'audio/wav' });
      const result = await useVoiceStore.getState().saveVoiceFromBlob({
        name: 'Too Short',
        blob,
        duration: 10,
      });

      expect(result).toBeNull();
      expect(useVoiceStore.getState().profiles).toHaveLength(0);
      expect(useVoiceStore.getState().error).toContain(`${MIN_VOICE_SAMPLE_DURATION}`);
    });

    it('trims blank name to "Untitled Voice"', async () => {
      const blob = new Blob(['audio'], { type: 'audio/wav' });
      const result = await useVoiceStore.getState().saveVoiceFromBlob({
        name: '   ',
        blob,
        duration: 60,
      });

      expect(result!.name).toBe('Untitled Voice');
    });

    it('sets error on IndexedDB failure', async () => {
      mockSet.mockRejectedValueOnce(new Error('QuotaExceededError'));
      const blob = new Blob(['audio'], { type: 'audio/wav' });
      const result = await useVoiceStore.getState().saveVoiceFromBlob({
        name: 'Fail',
        blob,
        duration: 45,
      });

      expect(result).toBeNull();
      expect(useVoiceStore.getState().error).toContain('QuotaExceededError');
      expect(useVoiceStore.getState().isProcessing).toBe(false);
    });

    it('sets isProcessing during save', async () => {
      let capturedProcessing = false;
      mockSet.mockImplementation(async () => {
        capturedProcessing = useVoiceStore.getState().isProcessing;
      });

      const blob = new Blob(['audio'], { type: 'audio/wav' });
      await useVoiceStore.getState().saveVoiceFromBlob({
        name: 'Test',
        blob,
        duration: 45,
      });

      expect(capturedProcessing).toBe(true);
      expect(useVoiceStore.getState().isProcessing).toBe(false);
    });
  });

  describe('recording state', () => {
    it('sets and clears recording profile ID', () => {
      useVoiceStore.getState().setRecordingProfileId('v1');
      expect(useVoiceStore.getState().recordingProfileId).toBe('v1');

      useVoiceStore.getState().setRecordingProfileId(null);
      expect(useVoiceStore.getState().recordingProfileId).toBeNull();
    });
  });

  describe('constants', () => {
    it('minimum duration is 30 seconds', () => {
      expect(MIN_VOICE_SAMPLE_DURATION).toBe(30);
    });

    it('accepts WAV, MP3, and FLAC MIME types', () => {
      expect(ACCEPTED_VOICE_MIME_TYPES).toContain('audio/wav');
      expect(ACCEPTED_VOICE_MIME_TYPES).toContain('audio/mpeg');
      expect(ACCEPTED_VOICE_MIME_TYPES).toContain('audio/flac');
    });

    it('accepts .wav, .mp3, .flac extensions', () => {
      expect(ACCEPTED_VOICE_EXTENSIONS).toContain('.wav');
      expect(ACCEPTED_VOICE_EXTENSIONS).toContain('.mp3');
      expect(ACCEPTED_VOICE_EXTENSIONS).toContain('.flac');
    });
  });
});
