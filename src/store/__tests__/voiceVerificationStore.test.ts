import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useVoiceVerificationStore } from '../voiceVerificationStore';
import { useVoiceStore } from '../voiceStore';
import type { AddVoiceInput } from '../voiceStore';

vi.mock('idb-keyval', () => ({
  get: vi.fn(),
  set: vi.fn().mockResolvedValue(undefined),
  del: vi.fn(),
  keys: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../services/aceStepApi', () => ({
  getVerificationPhrase: vi.fn(),
  verifyVoiceIdentity: vi.fn(),
}));

import {
  getVerificationPhrase,
  verifyVoiceIdentity,
} from '../../services/aceStepApi';

const voiceInput: AddVoiceInput = {
  name: 'My Voice',
  durationSeconds: 12,
  skillLevel: 'intermediate',
  source: 'upload',
  tags: [],
  waveformPeaks: [0.1, 0.5, 0.2],
};

function resetStores() {
  useVoiceVerificationStore.setState({
    pendingVoice: null,
    currentPhrase: null,
    verificationStatus: 'idle',
    verificationError: null,
    recordedPhrase: null,
    referenceAudio: null,
    selfHostedSkipEnabled: false,
  });
  useVoiceStore.setState({
    voices: [],
    selectedVoiceId: null,
    searchQuery: '',
    filterTag: null,
  });
}

describe('voiceVerificationStore', () => {
  beforeEach(() => {
    resetStores();
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('has no pending voice', () => {
      expect(useVoiceVerificationStore.getState().pendingVoice).toBeNull();
    });

    it('has idle verification status', () => {
      expect(useVoiceVerificationStore.getState().verificationStatus).toBe('idle');
    });

    it('has no current phrase', () => {
      expect(useVoiceVerificationStore.getState().currentPhrase).toBeNull();
    });
  });

  describe('beginVerification', () => {
    it('stores the pending voice and reference audio', () => {
      const blob = new Blob(['ref'], { type: 'audio/wav' });

      useVoiceVerificationStore.getState().beginVerification(voiceInput, blob);

      const state = useVoiceVerificationStore.getState();
      expect(state.pendingVoice?.input.name).toBe('My Voice');
      expect(state.pendingVoice?.audioBlob).toBe(blob);
      expect(state.referenceAudio).toBe(blob);
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

  describe('setRecordedPhrase', () => {
    it('stores the recorded phrase blob', () => {
      const blob = new Blob(['phrase data'], { type: 'audio/wav' });
      useVoiceVerificationStore.getState().setRecordedPhrase(blob);

      expect(useVoiceVerificationStore.getState().recordedPhrase).toBe(blob);
    });
  });

  describe('submitVerification', () => {
    it('submits both audio samples and creates a verified voice profile', async () => {
      const refBlob = new Blob(['ref'], { type: 'audio/wav' });
      const phraseBlob = new Blob(['phrase'], { type: 'audio/wav' });

      useVoiceVerificationStore.getState().beginVerification(voiceInput, refBlob);
      useVoiceVerificationStore.setState({
        recordedPhrase: phraseBlob,
        currentPhrase: { phraseId: 'phrase-1', text: 'test phrase', language: 'en' },
      });

      vi.mocked(verifyVoiceIdentity).mockResolvedValue({
        match: true,
        confidence: 0.95,
        phrase_id: 'phrase-1',
      });

      await useVoiceVerificationStore.getState().submitVerification();

      expect(verifyVoiceIdentity).toHaveBeenCalledWith(refBlob, phraseBlob, 'phrase-1');
      expect(useVoiceVerificationStore.getState().verificationStatus).toBe('verified');

      const voices = useVoiceStore.getState().voices;
      expect(voices).toHaveLength(1);
      expect(voices[0].name).toBe('My Voice');
      expect(voices[0].verificationStatus).toBe('verified');
      expect(voices[0].verificationConfidence).toBe(0.95);
    });

    it('sets failed status when match is false', async () => {
      const refBlob = new Blob(['ref'], { type: 'audio/wav' });
      const phraseBlob = new Blob(['phrase'], { type: 'audio/wav' });

      useVoiceVerificationStore.getState().beginVerification(voiceInput, refBlob);
      useVoiceVerificationStore.setState({
        recordedPhrase: phraseBlob,
        currentPhrase: { phraseId: 'phrase-1', text: 'test phrase', language: 'en' },
      });

      vi.mocked(verifyVoiceIdentity).mockResolvedValue({
        match: false,
        confidence: 0.3,
        phrase_id: 'phrase-1',
      });

      await useVoiceVerificationStore.getState().submitVerification();

      expect(useVoiceVerificationStore.getState().verificationStatus).toBe('failed');
      expect(useVoiceVerificationStore.getState().verificationError).toContain('not match');
      expect(useVoiceStore.getState().voices).toHaveLength(0);
    });

    it('requires pending voice, reference audio, and recorded phrase', async () => {
      await useVoiceVerificationStore.getState().submitVerification();

      expect(verifyVoiceIdentity).not.toHaveBeenCalled();
      expect(useVoiceVerificationStore.getState().verificationError).toBeTruthy();
    });

    it('handles API error', async () => {
      const refBlob = new Blob(['ref'], { type: 'audio/wav' });
      const phraseBlob = new Blob(['phrase'], { type: 'audio/wav' });

      useVoiceVerificationStore.getState().beginVerification(voiceInput, refBlob);
      useVoiceVerificationStore.setState({
        recordedPhrase: phraseBlob,
        currentPhrase: { phraseId: 'phrase-1', text: 'test phrase', language: 'en' },
      });

      vi.mocked(verifyVoiceIdentity).mockRejectedValue(new Error('Server error'));

      await useVoiceVerificationStore.getState().submitVerification();

      expect(useVoiceVerificationStore.getState().verificationStatus).toBe('error');
      expect(useVoiceVerificationStore.getState().verificationError).toBe('Server error');
    });
  });

  describe('skipVerification', () => {
    it('creates an unverified voice profile when skip is enabled', () => {
      const refBlob = new Blob(['ref'], { type: 'audio/wav' });
      useVoiceVerificationStore.getState().beginVerification(voiceInput, refBlob);
      useVoiceVerificationStore.setState({ selfHostedSkipEnabled: true });

      useVoiceVerificationStore.getState().skipVerification();

      const voices = useVoiceStore.getState().voices;
      expect(voices).toHaveLength(1);
      expect(voices[0].name).toBe('My Voice');
      expect(voices[0].verificationStatus).toBe('unverified');
    });

    it('does nothing when skip is disabled', () => {
      const refBlob = new Blob(['ref'], { type: 'audio/wav' });
      useVoiceVerificationStore.getState().beginVerification(voiceInput, refBlob);
      useVoiceVerificationStore.setState({ selfHostedSkipEnabled: false });

      useVoiceVerificationStore.getState().skipVerification();

      expect(useVoiceStore.getState().voices).toHaveLength(0);
    });
  });

  describe('resetVerification', () => {
    it('clears phrase state while keeping the pending voice', () => {
      const refBlob = new Blob(['ref'], { type: 'audio/wav' });
      useVoiceVerificationStore.getState().beginVerification(voiceInput, refBlob);
      useVoiceVerificationStore.setState({
        verificationStatus: 'failed',
        currentPhrase: { phraseId: 'p-1', text: 'test', language: 'en' },
        recordedPhrase: new Blob(['data']),
        verificationError: 'some error',
      });

      useVoiceVerificationStore.getState().resetVerification();

      const state = useVoiceVerificationStore.getState();
      expect(state.verificationStatus).toBe('idle');
      expect(state.currentPhrase).toBeNull();
      expect(state.recordedPhrase).toBeNull();
      expect(state.referenceAudio).toBe(refBlob);
      expect(state.pendingVoice).not.toBeNull();
      expect(state.verificationError).toBeNull();
    });
  });

  describe('cancelVerification', () => {
    it('clears pending voice and transient audio', () => {
      const refBlob = new Blob(['ref'], { type: 'audio/wav' });
      useVoiceVerificationStore.getState().beginVerification(voiceInput, refBlob);
      useVoiceVerificationStore.setState({ recordedPhrase: new Blob(['phrase']) });

      useVoiceVerificationStore.getState().cancelVerification();

      const state = useVoiceVerificationStore.getState();
      expect(state.pendingVoice).toBeNull();
      expect(state.referenceAudio).toBeNull();
      expect(state.recordedPhrase).toBeNull();
    });
  });
});
