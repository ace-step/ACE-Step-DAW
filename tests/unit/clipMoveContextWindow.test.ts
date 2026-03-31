import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Clip, Project } from '../../src/types/project';
import { useProjectStore } from '../../src/store/projectStore';

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
      createBuffer: vi.fn(),
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
    totalDuration: 256,
    measures: 128,
    tracks: [
      {
        id: 'track-1',
        name: 'Track 1',
        type: 'vocal',
        volume: 0,
        pan: 0,
        mute: false,
        solo: false,
        clips: [],
        color: '#ff0000',
      },
      {
        id: 'track-2',
        name: 'Track 2',
        type: 'vocal',
        volume: 0,
        pan: 0,
        mute: false,
        solo: false,
        clips: [],
        color: '#00ff00',
      },
    ] as any,
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

function makeClipWithLegacyContextWindow(startTime: number): Clip {
  return {
    id: 'clip-1',
    trackId: 'track-1',
    startTime,
    duration: 9,
    color: '#ff0000',
    prompt: 'test',
    lyrics: '',
    generationStatus: 'ready',
    isolatedAudioKey: 'key-1',
    generationParams: {
      type: 'lego',
      prompt: 'test',
      lyrics: '',
      // Legacy absolute format — this is the bug
      contextWindow: {
        startTime: 5.5,
        endTime: 14.5,
      },
    },
  } as Clip;
}

function makeClipWithRelativeContextWindow(startTime: number): Clip {
  return {
    id: 'clip-2',
    trackId: 'track-1',
    startTime,
    duration: 9,
    color: '#ff0000',
    prompt: 'test',
    lyrics: '',
    generationStatus: 'ready',
    isolatedAudioKey: 'key-2',
    generationParams: {
      type: 'lego',
      prompt: 'test',
      lyrics: '',
      // New relative format — should stay unchanged
      contextWindow: {
        offsetStart: -4,
        offsetEnd: 5,
        trackIds: ['track-1'],
      },
    },
  } as Clip;
}

describe('clip move — contextWindow migration', () => {
  beforeEach(() => {
    localStorage.clear();
    useProjectStore.setState(useProjectStore.getInitialState(), true);
  });

  describe('updateClip (same-track move)', () => {
    it('converts legacy absolute contextWindow to relative offsets when startTime changes', () => {
      const project = makeProject();
      // Clip at time 5.5, context window absolute [5.5, 14.5]
      const clip = makeClipWithLegacyContextWindow(5.5);
      project.tracks[0].clips = [clip];
      useProjectStore.getState().setProject(project);

      // Move clip to time 10
      useProjectStore.getState().updateClip('clip-1', { startTime: 10 });

      const movedClip = useProjectStore.getState().getClipById('clip-1');
      expect(movedClip).toBeDefined();
      expect(movedClip!.startTime).toBe(10);

      // contextWindow should now be relative offsets
      const ctx = movedClip!.generationParams?.contextWindow;
      expect(ctx).toBeDefined();
      expect(ctx).toHaveProperty('offsetStart');
      expect(ctx).toHaveProperty('offsetEnd');
      expect(ctx).toHaveProperty('trackIds');

      // Original context was [5.5, 14.5] relative to clip at 5.5
      // offsetStart = 5.5 - 5.5 = 0, offsetEnd = 14.5 - 5.5 = 9
      const relCtx = ctx as { offsetStart: number; offsetEnd: number; trackIds: string[] };
      expect(relCtx.offsetStart).toBe(0);
      expect(relCtx.offsetEnd).toBe(9);
    });

    it('preserves relative contextWindow format when startTime changes', () => {
      const project = makeProject();
      const clip = makeClipWithRelativeContextWindow(5.5);
      project.tracks[0].clips = [clip];
      useProjectStore.getState().setProject(project);

      // Move clip to time 10
      useProjectStore.getState().updateClip('clip-2', { startTime: 10 });

      const movedClip = useProjectStore.getState().getClipById('clip-2');
      const ctx = movedClip!.generationParams?.contextWindow as { offsetStart: number; offsetEnd: number; trackIds: string[] };
      expect(ctx.offsetStart).toBe(-4);
      expect(ctx.offsetEnd).toBe(5);
      expect(ctx.trackIds).toEqual(['track-1']);
    });

    it('does not touch contextWindow when startTime is not in updates', () => {
      const project = makeProject();
      const clip = makeClipWithLegacyContextWindow(5.5);
      project.tracks[0].clips = [clip];
      useProjectStore.getState().setProject(project);

      // Update something else, not startTime
      useProjectStore.getState().updateClip('clip-1', { prompt: 'new prompt' });

      const updatedClip = useProjectStore.getState().getClipById('clip-1');
      const ctx = updatedClip!.generationParams?.contextWindow;
      // Should remain in legacy format since we didn't move
      expect(ctx).toHaveProperty('startTime', 5.5);
      expect(ctx).toHaveProperty('endTime', 14.5);
    });
  });

  describe('moveClipToTrack (cross-track move)', () => {
    it('converts legacy absolute contextWindow to relative offsets on cross-track move', () => {
      const project = makeProject();
      const clip = makeClipWithLegacyContextWindow(5.5);
      project.tracks[0].clips = [clip];
      useProjectStore.getState().setProject(project);

      // Move to track-2 at time 10
      useProjectStore.getState().moveClipToTrack('clip-1', 'track-2', 10);

      const movedClip = useProjectStore.getState().getClipById('clip-1');
      expect(movedClip).toBeDefined();
      expect(movedClip!.startTime).toBe(10);

      const ctx = movedClip!.generationParams?.contextWindow as { offsetStart: number; offsetEnd: number; trackIds: string[] };
      expect(ctx.offsetStart).toBe(0);
      expect(ctx.offsetEnd).toBe(9);
    });
  });

  describe('batchMoveClips', () => {
    it('converts legacy absolute contextWindow to relative offsets for each moved clip', () => {
      const project = makeProject();
      const clip = makeClipWithLegacyContextWindow(5.5);
      project.tracks[0].clips = [clip];
      useProjectStore.getState().setProject(project);

      // Move +4.5 seconds
      useProjectStore.getState().batchMoveClips(['clip-1'], 4.5);

      const movedClip = useProjectStore.getState().getClipById('clip-1');
      expect(movedClip).toBeDefined();
      expect(movedClip!.startTime).toBe(10);

      const ctx = movedClip!.generationParams?.contextWindow as { offsetStart: number; offsetEnd: number; trackIds: string[] };
      expect(ctx.offsetStart).toBe(0);
      expect(ctx.offsetEnd).toBe(9);
    });
  });
});
