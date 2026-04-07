import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useVoiceVerificationStore } from '../voiceVerificationStore';

vi.mock('../../services/aceStepApi', () => ({
  getVerificationPhrase: vi.fn(),
  verifyVoiceIdentity: vi.fn(),
}));

import {
  getVerificationPhrase,
  verifyVoiceIdentity,
} from '../../services/aceStepApi';

function resetStore() {
  useVoiceVerificationStore.setState({
    profiles: [],
    currentPhrase: null,
    verificationStatus: 'idle',
    verificationError: null,
    recordedPhrase: null,
    referenceAudio: null,
    selfHostedSkipEnabled: false,
  });
}

describe('voiceVerificationStore', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('has no profiles', () => {
      expect(useVoiceVerificationStore.getState().profiles).toEqual([]);
    });

    it('has idle verification status', () => {
      expect(useVoiceVerificationStore.getState().verificationStatus).toBe('idle');
    });

    it('has no current phrase', () => {
      expect(useVoiceVerificationStore.getState().currentPhrase).toBeNull();
    });
  });

  describe('fetchVerificationPhrase', () => {
    it('fetches a phrase from the backend', async () => {
      vi.mocked(getVerificationPhrase).mockResolvedValue({
        phrase_id: 'phrase-1',
        text: 'The quick brown fox jumps over the lazy dog',
        language: 'en',
      });

      await useVoiceVerificationStore.getState().fetchVerificationPhrase('en');

      const phrase = useVoiceVerificationStore.getState().currentPhrase;
      expect(phrase).not.toBeNull();
      expect(phrase!.phraseId).toBe('phrase-1');
      expect(phrase!.text).toBe('The quick brown fox jumps over the lazy dog');
    });

    it('sets error on failure', async () => {
      vi.mocked(getVerificationPhrase).mockRejectedValue(new Error('Network error'));

      await useVoiceVerificationStore.getState().fetchVerificationPhrase('en');

      expect(useVoiceVerificationStore.getState().verificationError).toBe('Network error');
    });
  });

  describe('setReferenceAudio', () => {
    it('stores a reference audio blob', () => {
      const blob = new Blob(['audio data'], { type: 'audio/wav' });
      useVoiceVerificationStore.getState().setReferenceAudio(blob);

      expect(useVoiceVerificationStore.getState().referenceAudio).toBe(blob);
    });
  });

  describe('setRecordedPhrase', () => {
    it('stores the recorded phrase blob', () => {
      const blob = new Blob(['phrase data'], { type: 'audio/wav' });
      useVoiceVerificationStore.getState().setRecordedPhrase(blob);

      expect(useVoiceVerificationStore.getState().recordedPhrase).toBe(blob);
    });
  });

  describe('submitVerification', () => {
    it('submits both audio samples and creates verified profile', async () => {
      const refBlob = new Blob(['ref'], { type: 'audio/wav' });
      const phraseBlob = new Blob(['phrase'], { type: 'audio/wav' });

      useVoiceVerificationStore.setState({
        referenceAudio: refBlob,
        recordedPhrase: phraseBlob,
        currentPhrase: { phraseId: 'phrase-1', text: 'test phrase', language: 'en' },
      });

      vi.mocked(verifyVoiceIdentity).mockResolvedValue({
        match: true,
        confidence: 0.95,
        phrase_id: 'phrase-1',
      });

      await useVoiceVerificationStore.getState().submitVerification('My Voice');

      expect(verifyVoiceIdentity).toHaveBeenCalledWith(refBlob, phraseBlob, 'phrase-1');
      expect(useVoiceVerificationStore.getState().verificationStatus).toBe('verified');

      const profiles = useVoiceVerificationStore.getState().profiles;
      expect(profiles).toHaveLength(1);
      expect(profiles[0].name).toBe('My Voice');
      expect(profiles[0].verificationStatus).toBe('verified');
      expect(profiles[0].verificationConfidence).toBe(0.95);
    });

    it('sets failed status when match is false', async () => {
      const refBlob = new Blob(['ref'], { type: 'audio/wav' });
      const phraseBlob = new Blob(['phrase'], { type: 'audio/wav' });

      useVoiceVerificationStore.setState({
        referenceAudio: refBlob,
        recordedPhrase: phraseBlob,
        currentPhrase: { phraseId: 'phrase-1', text: 'test phrase', language: 'en' },
      });

      vi.mocked(verifyVoiceIdentity).mockResolvedValue({
        match: false,
        confidence: 0.3,
        phrase_id: 'phrase-1',
      });

      await useVoiceVerificationStore.getState().submitVerification('My Voice');

      expect(useVoiceVerificationStore.getState().verificationStatus).toBe('failed');
      expect(useVoiceVerificationStore.getState().verificationError).toContain('not match');
    });

    it('requires reference audio and recorded phrase', async () => {
      await useVoiceVerificationStore.getState().submitVerification('My Voice');

      expect(verifyVoiceIdentity).not.toHaveBeenCalled();
      expect(useVoiceVerificationStore.getState().verificationError).toBeTruthy();
    });

    it('handles API error', async () => {
      const refBlob = new Blob(['ref'], { type: 'audio/wav' });
      const phraseBlob = new Blob(['phrase'], { type: 'audio/wav' });

      useVoiceVerificationStore.setState({
        referenceAudio: refBlob,
        recordedPhrase: phraseBlob,
        currentPhrase: { phraseId: 'phrase-1', text: 'test phrase', language: 'en' },
      });

      vi.mocked(verifyVoiceIdentity).mockRejectedValue(new Error('Server error'));

      await useVoiceVerificationStore.getState().submitVerification('My Voice');

      expect(useVoiceVerificationStore.getState().verificationStatus).toBe('error');
      expect(useVoiceVerificationStore.getState().verificationError).toBe('Server error');
    });
  });

  describe('skipVerification (self-hosted)', () => {
    it('creates unverified profile when skip is enabled', () => {
      useVoiceVerificationStore.setState({ selfHostedSkipEnabled: true });

      useVoiceVerificationStore.getState().skipVerification('My Voice');

      const profiles = useVoiceVerificationStore.getState().profiles;
      expect(profiles).toHaveLength(1);
      expect(profiles[0].name).toBe('My Voice');
      expect(profiles[0].verificationStatus).toBe('unverified');
    });

    it('does nothing when skip is disabled', () => {
      useVoiceVerificationStore.setState({ selfHostedSkipEnabled: false });

      useVoiceVerificationStore.getState().skipVerification('My Voice');

      expect(useVoiceVerificationStore.getState().profiles).toHaveLength(0);
    });
  });

  describe('deleteProfile', () => {
    it('removes a profile by id', () => {
      useVoiceVerificationStore.setState({
        profiles: [{
          id: 'profile-1',
          name: 'My Voice',
          createdAt: Date.now(),
          referenceAudioKey: null,
          verificationStatus: 'verified',
          verifiedAt: Date.now(),
          verificationConfidence: 0.95,
        }],
      });

      useVoiceVerificationStore.getState().deleteProfile('profile-1');

      expect(useVoiceVerificationStore.getState().profiles).toHaveLength(0);
    });
  });

  describe('resetVerification', () => {
    it('clears verification state without affecting profiles', () => {
      useVoiceVerificationStore.setState({
        verificationStatus: 'verified',
        currentPhrase: { phraseId: 'p-1', text: 'test', language: 'en' },
        recordedPhrase: new Blob(['data']),
        referenceAudio: new Blob(['data']),
        verificationError: 'some error',
        profiles: [{
          id: 'profile-1',
          name: 'Test',
          createdAt: 1,
          referenceAudioKey: null,
          verificationStatus: 'verified',
          verifiedAt: 1,
          verificationConfidence: 0.9,
        }],
      });

      useVoiceVerificationStore.getState().resetVerification();

      const state = useVoiceVerificationStore.getState();
      expect(state.verificationStatus).toBe('idle');
      expect(state.currentPhrase).toBeNull();
      expect(state.recordedPhrase).toBeNull();
      expect(state.referenceAudio).toBeNull();
      expect(state.verificationError).toBeNull();
      // Profiles should still be there
      expect(state.profiles).toHaveLength(1);
    });
  });
});
