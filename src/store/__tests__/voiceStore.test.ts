import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('idb-keyval', () => ({
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  keys: vi.fn().mockResolvedValue([]),
}));

import { useVoiceStore } from '../voiceStore';
import { get, set, del } from 'idb-keyval';
import type { VoiceProfile } from '../../types/voice';

const mockedGet = vi.mocked(get);
const mockedSet = vi.mocked(set);
const mockedDel = vi.mocked(del);

function makeProfile(overrides: Partial<VoiceProfile> = {}): VoiceProfile {
  return {
    id: 'voice-1',
    name: 'Test Voice',
    createdAt: 1000,
    updatedAt: 1000,
    audioKey: 'voice-audio:voice-1',
    durationSeconds: 45,
    skillLevel: 'intermediate',
    tags: [],
    defaultAudioInfluence: 50,
    defaultStyleInfluence: 50,
    source: 'upload',
    ...overrides,
  };
}

describe('voiceStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useVoiceStore.setState({
      voices: [],
      selectedVoiceId: null,
      searchQuery: '',
      filterTag: null,
    });
  });

  describe('addVoice', () => {
    it('adds a voice profile to the store', () => {
      const blob = new Blob(['audio'], { type: 'audio/wav' });
      mockedSet.mockResolvedValue(undefined);

      const id = useVoiceStore.getState().addVoice({
        name: 'My Voice',
        durationSeconds: 60,
        skillLevel: 'professional',
        source: 'upload',
        tags: ['rock'],
        language: 'en',
      }, blob);

      const state = useVoiceStore.getState();
      expect(state.voices).toHaveLength(1);
      expect(state.voices[0].name).toBe('My Voice');
      expect(state.voices[0].durationSeconds).toBe(60);
      expect(state.voices[0].skillLevel).toBe('professional');
      expect(state.voices[0].source).toBe('upload');
      expect(state.voices[0].tags).toEqual(['rock']);
      expect(state.voices[0].language).toBe('en');
      expect(state.voices[0].defaultAudioInfluence).toBe(50);
      expect(state.voices[0].defaultStyleInfluence).toBe(50);
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
      // Should save audio blob to IDB
      expect(mockedSet).toHaveBeenCalledWith(
        expect.stringContaining('voice-audio:'),
        blob,
      );
    });

    it('assigns a unique id to each voice', () => {
      const blob = new Blob(['audio'], { type: 'audio/wav' });
      mockedSet.mockResolvedValue(undefined);

      const id1 = useVoiceStore.getState().addVoice({
        name: 'Voice A',
        durationSeconds: 30,
        skillLevel: 'beginner',
        source: 'upload',
        tags: [],
      }, blob);
      const id2 = useVoiceStore.getState().addVoice({
        name: 'Voice B',
        durationSeconds: 40,
        skillLevel: 'advanced',
        source: 'recording',
        tags: [],
      }, blob);

      expect(id1).not.toBe(id2);
      expect(useVoiceStore.getState().voices).toHaveLength(2);
    });

    it('removes the profile and clears selection when audio storage fails', async () => {
      const blob = new Blob(['audio'], { type: 'audio/wav' });
      mockedSet.mockRejectedValue(new Error('quota exceeded'));

      const id = useVoiceStore.getState().addVoice({
        name: 'Broken Voice',
        durationSeconds: 30,
        skillLevel: 'intermediate',
        source: 'upload',
        tags: [],
      }, blob);

      useVoiceStore.getState().selectVoice(id);
      expect(useVoiceStore.getState().voices).toHaveLength(1);

      await Promise.resolve();

      expect(useVoiceStore.getState().voices).toHaveLength(0);
      expect(useVoiceStore.getState().selectedVoiceId).toBeNull();
    });
  });

  describe('updateVoice', () => {
    it('updates voice metadata by id', () => {
      const profile = makeProfile();
      useVoiceStore.setState({ voices: [profile] });

      useVoiceStore.getState().updateVoice('voice-1', {
        name: 'Updated Name',
        skillLevel: 'professional',
        tags: ['jazz', 'smooth'],
      });

      const updated = useVoiceStore.getState().voices[0];
      expect(updated.name).toBe('Updated Name');
      expect(updated.skillLevel).toBe('professional');
      expect(updated.tags).toEqual(['jazz', 'smooth']);
      expect(updated.updatedAt).toBeGreaterThanOrEqual(profile.updatedAt);
    });

    it('does nothing for a non-existent id', () => {
      const profile = makeProfile();
      useVoiceStore.setState({ voices: [profile] });

      useVoiceStore.getState().updateVoice('non-existent', { name: 'X' });

      expect(useVoiceStore.getState().voices[0].name).toBe('Test Voice');
    });
  });

  describe('deleteVoice', () => {
    it('removes a voice profile and deletes its audio from IDB', async () => {
      const profile = makeProfile();
      useVoiceStore.setState({ voices: [profile] });
      mockedDel.mockResolvedValue(undefined);

      await useVoiceStore.getState().deleteVoice('voice-1');

      expect(useVoiceStore.getState().voices).toHaveLength(0);
      expect(mockedDel).toHaveBeenCalledWith('voice-audio:voice-1');
    });

    it('clears selectedVoiceId if the deleted voice was selected', async () => {
      const profile = makeProfile();
      useVoiceStore.setState({ voices: [profile], selectedVoiceId: 'voice-1' });
      mockedDel.mockResolvedValue(undefined);

      await useVoiceStore.getState().deleteVoice('voice-1');

      expect(useVoiceStore.getState().selectedVoiceId).toBeNull();
    });

    it('preserves selectedVoiceId when deleting a different voice', async () => {
      const profile1 = makeProfile({ id: 'voice-1', audioKey: 'voice-audio:voice-1' });
      const profile2 = makeProfile({ id: 'voice-2', audioKey: 'voice-audio:voice-2', name: 'Voice 2' });
      useVoiceStore.setState({ voices: [profile1, profile2], selectedVoiceId: 'voice-2' });
      mockedDel.mockResolvedValue(undefined);

      await useVoiceStore.getState().deleteVoice('voice-1');

      expect(useVoiceStore.getState().selectedVoiceId).toBe('voice-2');
      expect(useVoiceStore.getState().voices).toHaveLength(1);
    });
  });

  describe('selectVoice / deselectVoice', () => {
    it('selects a voice by id', () => {
      useVoiceStore.getState().selectVoice('voice-1');
      expect(useVoiceStore.getState().selectedVoiceId).toBe('voice-1');
    });

    it('deselects the voice', () => {
      useVoiceStore.setState({ selectedVoiceId: 'voice-1' });
      useVoiceStore.getState().deselectVoice();
      expect(useVoiceStore.getState().selectedVoiceId).toBeNull();
    });
  });

  describe('setSearchQuery', () => {
    it('updates the search query', () => {
      useVoiceStore.getState().setSearchQuery('rock');
      expect(useVoiceStore.getState().searchQuery).toBe('rock');
    });
  });

  describe('setFilterTag', () => {
    it('sets the tag filter', () => {
      useVoiceStore.getState().setFilterTag('jazz');
      expect(useVoiceStore.getState().filterTag).toBe('jazz');
    });

    it('clears the tag filter with null', () => {
      useVoiceStore.setState({ filterTag: 'jazz' });
      useVoiceStore.getState().setFilterTag(null);
      expect(useVoiceStore.getState().filterTag).toBeNull();
    });
  });

  describe('getFilteredVoices', () => {
    const voices: VoiceProfile[] = [
      makeProfile({ id: '1', name: 'Rock Voice', tags: ['rock', 'energetic'] }),
      makeProfile({ id: '2', name: 'Jazz Singer', tags: ['jazz', 'smooth'] }),
      makeProfile({ id: '3', name: 'Pop Star', tags: ['pop'] }),
    ];

    it('returns all voices when no filter is set', () => {
      useVoiceStore.setState({ voices });
      expect(useVoiceStore.getState().getFilteredVoices()).toHaveLength(3);
    });

    it('filters by search query (case-insensitive)', () => {
      useVoiceStore.setState({ voices, searchQuery: 'rock' });
      const result = useVoiceStore.getState().getFilteredVoices();
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Rock Voice');
    });

    it('filters by tag', () => {
      useVoiceStore.setState({ voices, filterTag: 'jazz' });
      const result = useVoiceStore.getState().getFilteredVoices();
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Jazz Singer');
    });

    it('combines search query and tag filter', () => {
      useVoiceStore.setState({ voices, searchQuery: 'jazz', filterTag: 'jazz' });
      const result = useVoiceStore.getState().getFilteredVoices();
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Jazz Singer');
    });

    it('returns empty when nothing matches', () => {
      useVoiceStore.setState({ voices, searchQuery: 'nonexistent' });
      expect(useVoiceStore.getState().getFilteredVoices()).toHaveLength(0);
    });
  });

  describe('getAllTags', () => {
    it('returns unique sorted tags from all voices', () => {
      useVoiceStore.setState({
        voices: [
          makeProfile({ id: '1', tags: ['rock', 'energetic'] }),
          makeProfile({ id: '2', tags: ['jazz', 'rock'] }),
        ],
      });
      expect(useVoiceStore.getState().getAllTags()).toEqual(['energetic', 'jazz', 'rock']);
    });

    it('returns empty array when no voices exist', () => {
      expect(useVoiceStore.getState().getAllTags()).toEqual([]);
    });
  });

  describe('getVoiceById', () => {
    it('returns the matching voice', () => {
      const profile = makeProfile();
      useVoiceStore.setState({ voices: [profile] });
      expect(useVoiceStore.getState().getVoiceById('voice-1')).toEqual(profile);
    });

    it('returns undefined for unknown id', () => {
      expect(useVoiceStore.getState().getVoiceById('missing')).toBeUndefined();
    });
  });

  describe('loadAudioBlob', () => {
    it('loads audio blob from IDB by voice audioKey', async () => {
      const profile = makeProfile();
      useVoiceStore.setState({ voices: [profile] });
      const fakeBlob = new Blob(['audio'], { type: 'audio/wav' });
      mockedGet.mockResolvedValue(fakeBlob);

      const result = await useVoiceStore.getState().loadAudioBlob('voice-1');

      expect(mockedGet).toHaveBeenCalledWith('voice-audio:voice-1');
      expect(result).toBe(fakeBlob);
    });

    it('returns undefined for unknown voice id', async () => {
      const result = await useVoiceStore.getState().loadAudioBlob('missing');
      expect(result).toBeUndefined();
    });
  });

  describe('setWaveformPeaks', () => {
    it('stores precomputed peaks on the voice profile', () => {
      const profile = makeProfile();
      useVoiceStore.setState({ voices: [profile] });
      const peaks = [0.1, -0.1, 0.2, -0.2];

      useVoiceStore.getState().setWaveformPeaks('voice-1', peaks);

      expect(useVoiceStore.getState().voices[0].waveformPeaks).toEqual(peaks);
    });
  });
});
