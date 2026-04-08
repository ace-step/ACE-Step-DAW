import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useVoiceStore } from '../voiceStore';
import type { VoiceProfile } from '../../types/voiceProfile';

vi.mock('../../services/audioFileManager', () => ({
  storeAudioBlob: vi.fn().mockResolvedValue('mock-audio-key'),
  loadAudioBlobByKey: vi.fn().mockResolvedValue(new Blob(['audio'], { type: 'audio/wav' })),
  deleteAudioBlobByKey: vi.fn().mockResolvedValue(undefined),
}));

import {
  storeAudioBlob,
  loadAudioBlobByKey,
  deleteAudioBlobByKey,
} from '../../services/audioFileManager';

const MOCK_PROFILE: VoiceProfile = {
  id: 'voice-1',
  name: 'Test Voice',
  createdAt: 1000,
  updatedAt: 1000,
  audioKey: 'audio-key-1',
  duration: 30,
  skillLevel: 'intermediate',
  language: 'English',
  tags: ['pop', 'female'],
  audioInfluence: 0.5,
  styleInfluence: 0.5,
};

function resetStore() {
  useVoiceStore.setState({
    voices: [],
    selectedVoiceId: null,
    searchQuery: '',
    isCreating: false,
    createError: null,
    previewingVoiceId: null,
  });
}

describe('voiceStore', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initial state', () => {
    it('has empty voices array', () => {
      expect(useVoiceStore.getState().voices).toEqual([]);
    });

    it('has no selected voice', () => {
      expect(useVoiceStore.getState().selectedVoiceId).toBeNull();
    });

    it('has empty search query', () => {
      expect(useVoiceStore.getState().searchQuery).toBe('');
    });

    it('is not creating', () => {
      expect(useVoiceStore.getState().isCreating).toBe(false);
    });

    it('has no create error', () => {
      expect(useVoiceStore.getState().createError).toBeNull();
    });

    it('has no previewing voice', () => {
      expect(useVoiceStore.getState().previewingVoiceId).toBeNull();
    });
  });

  describe('addVoice', () => {
    it('adds a new voice profile from audio blob', async () => {
      const blob = new Blob(['test-audio'], { type: 'audio/wav' });
      await useVoiceStore.getState().addVoice({
        name: 'My Voice',
        audioBlob: blob,
        duration: 45,
        skillLevel: 'advanced',
        language: 'English',
        tags: ['rock'],
        source: 'upload',
      });

      const { voices } = useVoiceStore.getState();
      expect(voices).toHaveLength(1);
      expect(voices[0].name).toBe('My Voice');
      expect(voices[0].duration).toBe(45);
      expect(voices[0].skillLevel).toBe('advanced');
      expect(voices[0].language).toBe('English');
      expect(voices[0].tags).toEqual(['rock']);
      expect(voices[0].audioInfluence).toBe(0.5);
      expect(voices[0].styleInfluence).toBe(0.5);
      expect(storeAudioBlob).toHaveBeenCalledWith(blob);
    });

    it('sets isCreating during creation', async () => {
      const promise = useVoiceStore.getState().addVoice({
        name: 'Test',
        audioBlob: new Blob(),
        duration: 10,
        skillLevel: 'beginner',
        language: 'English',
        tags: [],
        source: 'recording',
      });
      expect(useVoiceStore.getState().isCreating).toBe(true);
      await promise;
      expect(useVoiceStore.getState().isCreating).toBe(false);
    });

    it('sets createError on failure', async () => {
      vi.mocked(storeAudioBlob).mockRejectedValueOnce(new Error('Storage full'));
      await useVoiceStore.getState().addVoice({
        name: 'Fail',
        audioBlob: new Blob(),
        duration: 10,
        skillLevel: 'beginner',
        language: 'English',
        tags: [],
        source: 'upload',
      });
      expect(useVoiceStore.getState().createError).toBe('Storage full');
      expect(useVoiceStore.getState().voices).toHaveLength(0);
    });
  });

  describe('removeVoice', () => {
    it('removes a voice profile by id', async () => {
      useVoiceStore.setState({ voices: [MOCK_PROFILE] });
      await useVoiceStore.getState().removeVoice('voice-1');
      expect(useVoiceStore.getState().voices).toHaveLength(0);
      expect(deleteAudioBlobByKey).toHaveBeenCalledWith('audio-key-1');
    });

    it('clears selectedVoiceId when removing selected voice', async () => {
      useVoiceStore.setState({ voices: [MOCK_PROFILE], selectedVoiceId: 'voice-1' });
      await useVoiceStore.getState().removeVoice('voice-1');
      expect(useVoiceStore.getState().selectedVoiceId).toBeNull();
    });

    it('clears previewingVoiceId when removing previewing voice', async () => {
      useVoiceStore.setState({ voices: [MOCK_PROFILE], previewingVoiceId: 'voice-1' });
      await useVoiceStore.getState().removeVoice('voice-1');
      expect(useVoiceStore.getState().previewingVoiceId).toBeNull();
    });

    it('does nothing for non-existent voice id', async () => {
      useVoiceStore.setState({ voices: [MOCK_PROFILE] });
      await useVoiceStore.getState().removeVoice('non-existent');
      expect(useVoiceStore.getState().voices).toHaveLength(1);
      expect(deleteAudioBlobByKey).not.toHaveBeenCalled();
    });
  });

  describe('updateVoice', () => {
    it('updates name and tags of an existing voice', () => {
      useVoiceStore.setState({ voices: [MOCK_PROFILE] });
      useVoiceStore.getState().updateVoice('voice-1', {
        name: 'Updated Voice',
        tags: ['jazz', 'male'],
      });
      const updated = useVoiceStore.getState().voices[0];
      expect(updated.name).toBe('Updated Voice');
      expect(updated.tags).toEqual(['jazz', 'male']);
      expect(updated.updatedAt).toBeGreaterThan(MOCK_PROFILE.updatedAt);
    });

    it('updates influence values', () => {
      useVoiceStore.setState({ voices: [MOCK_PROFILE] });
      useVoiceStore.getState().updateVoice('voice-1', {
        audioInfluence: 0.8,
        styleInfluence: 0.3,
      });
      const updated = useVoiceStore.getState().voices[0];
      expect(updated.audioInfluence).toBe(0.8);
      expect(updated.styleInfluence).toBe(0.3);
    });

    it('clamps influence values to 0-1 range', () => {
      useVoiceStore.setState({ voices: [MOCK_PROFILE] });
      useVoiceStore.getState().updateVoice('voice-1', {
        audioInfluence: 1.5,
        styleInfluence: -0.2,
      });
      const updated = useVoiceStore.getState().voices[0];
      expect(updated.audioInfluence).toBe(1.0);
      expect(updated.styleInfluence).toBe(0.0);
    });

    it('does nothing for non-existent voice id', () => {
      useVoiceStore.setState({ voices: [MOCK_PROFILE] });
      useVoiceStore.getState().updateVoice('non-existent', { name: 'Nope' });
      expect(useVoiceStore.getState().voices[0].name).toBe('Test Voice');
    });
  });

  describe('selectVoice / deselectVoice', () => {
    it('sets selectedVoiceId', () => {
      useVoiceStore.getState().selectVoice('voice-1');
      expect(useVoiceStore.getState().selectedVoiceId).toBe('voice-1');
    });

    it('deselects voice', () => {
      useVoiceStore.setState({ selectedVoiceId: 'voice-1' });
      useVoiceStore.getState().deselectVoice();
      expect(useVoiceStore.getState().selectedVoiceId).toBeNull();
    });
  });

  describe('setSearchQuery', () => {
    it('sets search query', () => {
      useVoiceStore.getState().setSearchQuery('pop');
      expect(useVoiceStore.getState().searchQuery).toBe('pop');
    });
  });

  describe('getFilteredVoices', () => {
    const voice2: VoiceProfile = {
      ...MOCK_PROFILE,
      id: 'voice-2',
      name: 'Jazz Singer',
      tags: ['jazz', 'male'],
      language: 'French',
    };

    it('returns all voices when search query is empty', () => {
      useVoiceStore.setState({ voices: [MOCK_PROFILE, voice2] });
      expect(useVoiceStore.getState().getFilteredVoices()).toHaveLength(2);
    });

    it('filters by name (case-insensitive)', () => {
      useVoiceStore.setState({ voices: [MOCK_PROFILE, voice2], searchQuery: 'jazz' });
      const filtered = useVoiceStore.getState().getFilteredVoices();
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('voice-2');
    });

    it('filters by tag match', () => {
      useVoiceStore.setState({ voices: [MOCK_PROFILE, voice2], searchQuery: 'pop' });
      const filtered = useVoiceStore.getState().getFilteredVoices();
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('voice-1');
    });

    it('filters by language match', () => {
      useVoiceStore.setState({ voices: [MOCK_PROFILE, voice2], searchQuery: 'french' });
      const filtered = useVoiceStore.getState().getFilteredVoices();
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('voice-2');
    });
  });

  describe('setPreviewingVoiceId / clearPreview', () => {
    it('sets previewing voice', () => {
      useVoiceStore.getState().setPreviewingVoiceId('voice-1');
      expect(useVoiceStore.getState().previewingVoiceId).toBe('voice-1');
    });

    it('clears previewing voice', () => {
      useVoiceStore.setState({ previewingVoiceId: 'voice-1' });
      useVoiceStore.getState().setPreviewingVoiceId(null);
      expect(useVoiceStore.getState().previewingVoiceId).toBeNull();
    });
  });

  describe('getVoiceById', () => {
    it('returns the voice profile by id', () => {
      useVoiceStore.setState({ voices: [MOCK_PROFILE] });
      expect(useVoiceStore.getState().getVoiceById('voice-1')).toEqual(MOCK_PROFILE);
    });

    it('returns undefined for non-existent id', () => {
      useVoiceStore.setState({ voices: [MOCK_PROFILE] });
      expect(useVoiceStore.getState().getVoiceById('nope')).toBeUndefined();
    });
  });
});
