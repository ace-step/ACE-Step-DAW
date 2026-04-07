import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VoiceProfile } from '../../types/voice';

// Mock voiceProfileService
const mockListVoiceProfiles = vi.fn();
const mockSaveVoiceProfile = vi.fn();
const mockDeleteVoiceProfile = vi.fn();
const mockUpdateVoiceProfileName = vi.fn();
vi.mock('../../services/voiceProfileService', () => ({
  listVoiceProfiles: (...args: unknown[]) => mockListVoiceProfiles(...args),
  saveVoiceProfile: (...args: unknown[]) => mockSaveVoiceProfile(...args),
  deleteVoiceProfile: (...args: unknown[]) => mockDeleteVoiceProfile(...args),
  updateVoiceProfileName: (...args: unknown[]) => mockUpdateVoiceProfileName(...args),
}));

// Mock uuid
vi.mock('uuid', () => ({ v4: () => 'mock-uuid' }));

// Mock waveform
vi.mock('../../utils/waveformPeaks', () => ({
  computeWaveformPeaks: vi.fn(() => [0.5]),
}));

import { useVoiceStore } from '../voiceStore';

function makeProfile(overrides: Partial<VoiceProfile> = {}): VoiceProfile {
  return {
    id: 'voice-1',
    name: 'My Voice',
    source: 'upload',
    mimeType: 'audio/wav',
    duration: 30,
    fileSize: 1024,
    waveformPeaks: [0.5],
    defaultAudioInfluence: 0.4,
    defaultStyleInfluence: 0.6,
    createdAt: 1000,
    updatedAt: 2000,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSaveVoiceProfile.mockResolvedValue(undefined);
  mockDeleteVoiceProfile.mockResolvedValue(undefined);
  // Reset store state
  useVoiceStore.setState({
    profiles: [],
    selectedProfileId: null,
    audioInfluence: 0.4,
    styleInfluence: 0.6,
    loading: false,
    recording: false,
    error: null,
  });
});

describe('voiceStore', () => {
  describe('loadProfiles', () => {
    it('loads profiles from service and sets them in state', async () => {
      const profiles = [makeProfile({ id: 'v1' }), makeProfile({ id: 'v2' })];
      mockListVoiceProfiles.mockResolvedValueOnce(profiles);

      await useVoiceStore.getState().loadProfiles();

      const state = useVoiceStore.getState();
      expect(state.profiles).toEqual(profiles);
      expect(state.loading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('sets error on failure', async () => {
      mockListVoiceProfiles.mockRejectedValueOnce(new Error('DB error'));

      await useVoiceStore.getState().loadProfiles();

      const state = useVoiceStore.getState();
      expect(state.profiles).toEqual([]);
      expect(state.error).toBe('DB error');
      expect(state.loading).toBe(false);
    });
  });

  describe('addProfile', () => {
    it('saves profile to service and prepends to state', async () => {
      const existing = makeProfile({ id: 'existing' });
      useVoiceStore.setState({ profiles: [existing] });

      const blob = new Blob([new ArrayBuffer(1024)], { type: 'audio/wav' });
      const result = await useVoiceStore.getState().addProfile(
        'New Voice',
        'upload',
        blob,
        30,
      );

      expect(result.id).toBe('mock-uuid');
      expect(result.name).toBe('New Voice');
      expect(result.source).toBe('upload');
      expect(mockSaveVoiceProfile).toHaveBeenCalledTimes(1);

      const state = useVoiceStore.getState();
      expect(state.profiles).toHaveLength(2);
      expect(state.profiles[0].id).toBe('mock-uuid');
    });
  });

  describe('removeProfile', () => {
    it('deletes profile from service and removes from state', async () => {
      const p1 = makeProfile({ id: 'v1' });
      const p2 = makeProfile({ id: 'v2' });
      useVoiceStore.setState({ profiles: [p1, p2], selectedProfileId: 'v1' });

      await useVoiceStore.getState().removeProfile('v1');

      const state = useVoiceStore.getState();
      expect(state.profiles).toHaveLength(1);
      expect(state.profiles[0].id).toBe('v2');
      expect(state.selectedProfileId).toBeNull(); // deselected
      expect(mockDeleteVoiceProfile).toHaveBeenCalledWith('v1');
    });

    it('keeps selectedProfileId if a different profile is deleted', async () => {
      useVoiceStore.setState({
        profiles: [makeProfile({ id: 'v1' }), makeProfile({ id: 'v2' })],
        selectedProfileId: 'v2',
      });

      await useVoiceStore.getState().removeProfile('v1');

      expect(useVoiceStore.getState().selectedProfileId).toBe('v2');
    });
  });

  describe('renameProfile', () => {
    it('renames profile in service and updates state', async () => {
      const profile = makeProfile({ id: 'v1', name: 'Old' });
      const updated = { ...profile, name: 'New', updatedAt: 9999 };
      mockUpdateVoiceProfileName.mockResolvedValueOnce(updated);
      useVoiceStore.setState({ profiles: [profile] });

      await useVoiceStore.getState().renameProfile('v1', 'New');

      const state = useVoiceStore.getState();
      expect(state.profiles[0].name).toBe('New');
      expect(mockUpdateVoiceProfileName).toHaveBeenCalledWith('v1', 'New');
    });
  });

  describe('selectProfile', () => {
    it('sets selectedProfileId when profile exists', () => {
      useVoiceStore.setState({ profiles: [makeProfile({ id: 'v1' })] });
      useVoiceStore.getState().selectProfile('v1');
      expect(useVoiceStore.getState().selectedProfileId).toBe('v1');
    });

    it('sets null when profile id not found in profiles', () => {
      useVoiceStore.getState().selectProfile('nonexistent');
      expect(useVoiceStore.getState().selectedProfileId).toBeNull();
    });

    it('clears selection with null', () => {
      useVoiceStore.setState({ selectedProfileId: 'v1' });
      useVoiceStore.getState().selectProfile(null);
      expect(useVoiceStore.getState().selectedProfileId).toBeNull();
    });

    it('loads per-profile influence defaults on selection', () => {
      useVoiceStore.setState({
        profiles: [makeProfile({ id: 'v1', defaultAudioInfluence: 0.7, defaultStyleInfluence: 0.3 })],
      });
      useVoiceStore.getState().selectProfile('v1');
      expect(useVoiceStore.getState().audioInfluence).toBeCloseTo(0.7);
      expect(useVoiceStore.getState().styleInfluence).toBeCloseTo(0.3);
    });
  });

  describe('setRecording', () => {
    it('toggles recording state', () => {
      useVoiceStore.getState().setRecording(true);
      expect(useVoiceStore.getState().recording).toBe(true);
      useVoiceStore.getState().setRecording(false);
      expect(useVoiceStore.getState().recording).toBe(false);
    });
  });
});
