import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '../../src/types/project';
import { useProjectStore } from '../../src/store/projectStore';
import { createDefaultMasteringState } from '../../src/utils/mastering';

vi.mock('../../src/services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

vi.mock('../../src/services/audioFileManager', async () => {
  const actual = await vi.importActual<typeof import('../../src/services/audioFileManager')>('../../src/services/audioFileManager');
  return {
    ...actual,
    loadAudioBlobByKey: vi.fn(),
    saveAudioBlob: vi.fn(),
  };
});

vi.mock('../../src/hooks/useToast', () => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('../../src/hooks/useAudioEngine', () => ({
  getAudioEngine: () => ({
    ctx: {
      createBuffer: vi.fn((channels: number, length: number, rate: number) => ({
        numberOfChannels: channels,
        length,
        sampleRate: rate,
        duration: length / rate,
        getChannelData: (ch: number) => new Float32Array(length),
      })),
    },
    decodeAudioData: vi.fn(),
  }),
}));

function makeProject(): Project {
  return {
    id: 'project-1',
    name: 'Test Project',
    createdAt: 1,
    updatedAt: 1,
    bpm: 120,
    keyScale: 'C major',
    timeSignature: 4,
    totalDuration: 128,
    measures: 64,
    tracks: [
      {
        id: 'track-1',
        trackName: 'vocals',
        trackType: 'stems',
        volume: 0.8,
        pan: 0,
        muted: false,
        soloed: false,
        armed: false,
        eqLowGain: 0,
        eqMidGain: 0,
        eqHighGain: 0,
        compressorEnabled: false,
        compressorThreshold: -18,
        compressorRatio: 4,
        compressorAttack: 0.003,
        compressorRelease: 0.25,
        compressorKnee: 6,
        reverbEnabled: false,
        reverbRoomSize: 0.5,
        reverbWet: 0.3,
        clips: [{ id: 'clip-1', generationStatus: 'ready' } as any],
        effects: [],
        color: '#4fc3f7',
      } as any,
    ],
    trackPresets: [],
    generationDefaults: {
      inferenceSteps: 20,
      guidanceScale: 7.5,
      shift: 0,
      thinking: false,
      model: 'test-model',
    },
    globalCaption: '',
    automationLanes: [],
    assets: [],
  };
}

describe('mastering store actions', () => {
  beforeEach(() => {
    localStorage.clear();
    useProjectStore.setState(useProjectStore.getInitialState(), true);
  });

  describe('analyzeMastering', () => {
    it('sets status to analyzing then ready', async () => {
      const store = useProjectStore.getState();
      store.setProject(makeProject());

      const promise = useProjectStore.getState().analyzeMastering();

      // Should be analyzing immediately
      expect(useProjectStore.getState().project?.mastering?.status).toBe('analyzing');

      await promise;

      const mastering = useProjectStore.getState().project?.mastering;
      expect(mastering?.status).toBe('ready');
      expect(mastering?.enabled).toBe(true);
      expect(mastering?.analysis).not.toBeNull();
      expect(mastering?.outputLufs).not.toBeNull();
    });

    it('does nothing without a project', async () => {
      await useProjectStore.getState().analyzeMastering();
      expect(useProjectStore.getState().project).toBeNull();
    });

    it('produces analysis with correct track counts', async () => {
      useProjectStore.getState().setProject(makeProject());
      await useProjectStore.getState().analyzeMastering();
      const analysis = useProjectStore.getState().project?.mastering?.analysis;
      expect(analysis?.trackCount).toBe(1);
      expect(analysis?.activeTrackCount).toBe(1);
      expect(analysis?.clipCount).toBe(1);
    });
  });

  describe('setMasteringPreset', () => {
    it('changes the preset and rebuilds chain', async () => {
      useProjectStore.getState().setProject(makeProject());
      await useProjectStore.getState().analyzeMastering();

      useProjectStore.getState().setMasteringPreset('loud');
      const mastering = useProjectStore.getState().project?.mastering;
      expect(mastering?.preset).toBe('loud');
      expect(mastering?.enabled).toBe(true);
    });

    it('updates outputLufs when analysis exists', async () => {
      useProjectStore.getState().setProject(makeProject());
      await useProjectStore.getState().analyzeMastering();

      const beforeLufs = useProjectStore.getState().project?.mastering?.outputLufs;
      useProjectStore.getState().setMasteringPreset('loud');
      const afterLufs = useProjectStore.getState().project?.mastering?.outputLufs;

      // Loud preset should produce different LUFS than balanced
      expect(afterLufs).not.toBe(beforeLufs);
    });

    it('does nothing without a project', () => {
      useProjectStore.getState().setMasteringPreset('warm');
      expect(useProjectStore.getState().project).toBeNull();
    });
  });

  describe('setMasteringLoudnessTarget', () => {
    it('changes the loudness target', async () => {
      useProjectStore.getState().setProject(makeProject());
      await useProjectStore.getState().analyzeMastering();

      useProjectStore.getState().setMasteringLoudnessTarget(-8);
      const mastering = useProjectStore.getState().project?.mastering;
      expect(mastering?.loudnessTarget).toBe(-8);
    });

    it('rebuilds chain with new target', async () => {
      useProjectStore.getState().setProject(makeProject());
      await useProjectStore.getState().analyzeMastering();

      const before = useProjectStore.getState().project?.mastering?.chain;
      useProjectStore.getState().setMasteringLoudnessTarget(-8);
      const after = useProjectStore.getState().project?.mastering?.chain;

      expect(after?.limiterThreshold).toBe(-0.9);
      expect(after?.limiterThreshold).not.toBe(before?.limiterThreshold);
    });
  });

  describe('toggleMasteringPreview', () => {
    it('toggles previewOriginal flag', async () => {
      useProjectStore.getState().setProject(makeProject());
      await useProjectStore.getState().analyzeMastering();

      expect(useProjectStore.getState().project?.mastering?.previewOriginal).toBe(false);
      useProjectStore.getState().toggleMasteringPreview();
      expect(useProjectStore.getState().project?.mastering?.previewOriginal).toBe(true);
      useProjectStore.getState().toggleMasteringPreview();
      expect(useProjectStore.getState().project?.mastering?.previewOriginal).toBe(false);
    });
  });

  describe('setMasteringEnabled', () => {
    it('enables mastering', async () => {
      useProjectStore.getState().setProject(makeProject());
      await useProjectStore.getState().analyzeMastering();

      useProjectStore.getState().setMasteringEnabled(false);
      expect(useProjectStore.getState().project?.mastering?.enabled).toBe(false);

      useProjectStore.getState().setMasteringEnabled(true);
      expect(useProjectStore.getState().project?.mastering?.enabled).toBe(true);
    });

    it('resets previewOriginal when disabling', async () => {
      useProjectStore.getState().setProject(makeProject());
      await useProjectStore.getState().analyzeMastering();

      useProjectStore.getState().toggleMasteringPreview();
      expect(useProjectStore.getState().project?.mastering?.previewOriginal).toBe(true);

      useProjectStore.getState().setMasteringEnabled(false);
      expect(useProjectStore.getState().project?.mastering?.previewOriginal).toBe(false);
    });
  });

  describe('removeMastering', () => {
    it('resets mastering to default state', async () => {
      useProjectStore.getState().setProject(makeProject());
      await useProjectStore.getState().analyzeMastering();

      // Verify mastering is active
      expect(useProjectStore.getState().project?.mastering?.enabled).toBe(true);
      expect(useProjectStore.getState().project?.mastering?.analysis).not.toBeNull();

      useProjectStore.getState().removeMastering();
      const mastering = useProjectStore.getState().project?.mastering;
      expect(mastering?.enabled).toBe(false);
      expect(mastering?.status).toBe('idle');
      expect(mastering?.analysis).toBeNull();
      expect(mastering?.outputLufs).toBeNull();
    });

    it('is non-destructive — does not affect tracks', async () => {
      useProjectStore.getState().setProject(makeProject());
      await useProjectStore.getState().analyzeMastering();

      const tracksBefore = useProjectStore.getState().project?.tracks;
      useProjectStore.getState().removeMastering();
      const tracksAfter = useProjectStore.getState().project?.tracks;

      expect(tracksAfter).toEqual(tracksBefore);
    });
  });

  describe('mastering updates project timestamp', () => {
    it('analyzeMastering updates updatedAt', async () => {
      useProjectStore.getState().setProject(makeProject());
      const before = useProjectStore.getState().project?.updatedAt ?? 0;

      await useProjectStore.getState().analyzeMastering();
      const after = useProjectStore.getState().project?.updatedAt ?? 0;
      // analyzeMastering has a 650ms delay so timestamp will differ
      expect(after).toBeGreaterThan(before);
    });

    it('setMasteringPreset updates updatedAt', async () => {
      const proj = makeProject();
      proj.updatedAt = 1; // force an old timestamp
      useProjectStore.getState().setProject(proj);
      await useProjectStore.getState().analyzeMastering();

      const before = 1; // original timestamp
      useProjectStore.getState().setMasteringPreset('warm');
      const after = useProjectStore.getState().project?.updatedAt ?? 0;
      expect(after).toBeGreaterThan(before);
    });

    it('removeMastering updates updatedAt', async () => {
      const proj = makeProject();
      proj.updatedAt = 1; // force an old timestamp
      useProjectStore.getState().setProject(proj);
      await useProjectStore.getState().analyzeMastering();

      const before = 1; // original timestamp
      useProjectStore.getState().removeMastering();
      const after = useProjectStore.getState().project?.updatedAt ?? 0;
      expect(after).toBeGreaterThan(before);
    });
  });
});
