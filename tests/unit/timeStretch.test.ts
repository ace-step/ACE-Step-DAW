import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '../../src/types/project';
import { useProjectStore } from '../../src/store/projectStore';

vi.mock('../../src/services/projectStorage', () => ({
  saveProject: vi.fn(),
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
        displayName: 'Vocals',
        color: '#ff0000',
        order: 0,
        volume: 0.8,
        muted: false,
        soloed: false,
        clips: [
          {
            id: 'clip-1',
            trackId: 'track-1',
            startTime: 0,
            duration: 4,
            prompt: 'test',
            lyrics: '',
            generationStatus: 'idle',
            generationJobId: null,
            cumulativeMixKey: null,
            isolatedAudioKey: null,
            waveformPeaks: null,
          },
        ],
      },
    ],
    generationDefaults: {
      inferenceSteps: 20,
      guidanceScale: 7.5,
      shift: 0,
      thinking: false,
      model: 'test-model',
    },
    globalCaption: '',
  };
}

describe('Time Stretch & Pitch Shift', () => {
  beforeEach(() => {
    useProjectStore.getState().setProject(makeProject());
  });

  it('setClipTimeStretch updates the clip timeStretchRate', () => {
    useProjectStore.getState().setClipTimeStretch('clip-1', 0.5);
    const clip = useProjectStore.getState().project!.tracks[0].clips[0];
    expect(clip.timeStretchRate).toBe(0.5);
  });

  it('setClipPitchShift updates the clip pitchShift', () => {
    useProjectStore.getState().setClipPitchShift('clip-1', -3);
    const clip = useProjectStore.getState().project!.tracks[0].clips[0];
    expect(clip.pitchShift).toBe(-3);
  });

  it('setClipSourceBpm stores the source BPM on the clip', () => {
    useProjectStore.getState().setClipSourceBpm('clip-1', 140);
    const clip = useProjectStore.getState().project!.tracks[0].clips[0];
    expect(clip.sourceBpm).toBe(140);
  });

  it('setClipStretchMode stores the stretch mode on the clip', () => {
    useProjectStore.getState().setClipStretchMode('clip-1', 'repitch');
    const clip = useProjectStore.getState().project!.tracks[0].clips[0];
    expect(clip.stretchMode).toBe('repitch');
  });

  it('tempoMatchClip calculates rate from sourceBpm to project BPM', () => {
    // Project BPM is 120, source BPM is 100 → rate = 120/100 = 1.2
    useProjectStore.getState().setClipSourceBpm('clip-1', 100);
    useProjectStore.getState().tempoMatchClip('clip-1');
    const clip = useProjectStore.getState().project!.tracks[0].clips[0];
    expect(clip.timeStretchRate).toBeCloseTo(1.2);
  });

  it('tempoMatchClip does nothing when sourceBpm is not set', () => {
    useProjectStore.getState().tempoMatchClip('clip-1');
    const clip = useProjectStore.getState().project!.tracks[0].clips[0];
    expect(clip.timeStretchRate).toBeUndefined();
  });

  it('tempoMatchClip does nothing when sourceBpm is 0', () => {
    useProjectStore.getState().setClipSourceBpm('clip-1', 0);
    useProjectStore.getState().tempoMatchClip('clip-1');
    const clip = useProjectStore.getState().project!.tracks[0].clips[0];
    expect(clip.timeStretchRate).toBeUndefined();
  });

  it('tempoMatchClip with slower source speeds up playback', () => {
    // Source is 80 BPM, project is 120 → rate = 1.5 (speed up)
    useProjectStore.getState().setClipSourceBpm('clip-1', 80);
    useProjectStore.getState().tempoMatchClip('clip-1');
    const clip = useProjectStore.getState().project!.tracks[0].clips[0];
    expect(clip.timeStretchRate).toBeCloseTo(1.5);
  });

  it('tempoMatchClip with faster source slows down playback', () => {
    // Source is 140 BPM, project is 120 → rate ≈ 0.857 (slow down)
    useProjectStore.getState().setClipSourceBpm('clip-1', 140);
    useProjectStore.getState().tempoMatchClip('clip-1');
    const clip = useProjectStore.getState().project!.tracks[0].clips[0];
    expect(clip.timeStretchRate).toBeCloseTo(120 / 140);
  });
});
