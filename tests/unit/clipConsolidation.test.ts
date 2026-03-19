import { describe, expect, it } from 'vitest';
import type { Clip, Project } from '../../src/types/project';
import { buildConsolidatedMidiClipData, mergeAudioClipBuffers } from '../../src/services/clipConsolidation';

function makeProject(): Project {
  return {
    id: 'project-1',
    name: 'Consolidation Test',
    createdAt: 1,
    updatedAt: 1,
    bpm: 120,
    keyScale: 'C major',
    timeSignature: 4,
    totalDuration: 32,
    measures: 16,
    tracks: [],
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

function makeClip(overrides: Partial<Clip>): Clip {
  return {
    id: overrides.id ?? 'clip',
    trackId: overrides.trackId ?? 'track-1',
    startTime: overrides.startTime ?? 0,
    duration: overrides.duration ?? 1,
    prompt: overrides.prompt ?? '',
    lyrics: overrides.lyrics ?? '',
    generationStatus: overrides.generationStatus ?? 'ready',
    generationJobId: overrides.generationJobId ?? null,
    cumulativeMixKey: overrides.cumulativeMixKey ?? null,
    isolatedAudioKey: overrides.isolatedAudioKey ?? null,
    waveformPeaks: overrides.waveformPeaks ?? null,
    ...overrides,
  };
}

function makeMockAudioBuffer(channelData: number[][], sampleRate: number) {
  const channels = channelData.map((values) => Float32Array.from(values));
  const length = channels[0]?.length ?? 0;
  return {
    numberOfChannels: channels.length,
    length,
    sampleRate,
    duration: length / sampleRate,
    getChannelData: (channel: number) => channels[channel],
  } as AudioBuffer;
}

describe('clipConsolidation', () => {
  it('merges MIDI notes into one clip-relative note list', () => {
    const project = makeProject();
    const clipA = makeClip({
      id: 'clip-a',
      startTime: 0,
      duration: 1,
      midiData: {
        grid: '1/16',
        notes: [{ id: 'n1', pitch: 60, startBeat: 0, durationBeats: 1, velocity: 0.8 }],
      },
    });
    const clipB = makeClip({
      id: 'clip-b',
      startTime: 1,
      duration: 1,
      midiData: {
        grid: '1/16',
        notes: [{ id: 'n2', pitch: 64, startBeat: 0.5, durationBeats: 0.5, velocity: 0.7 }],
      },
    });

    const merged = buildConsolidatedMidiClipData(project, [clipB, clipA]);

    expect(merged.startTime).toBe(0);
    expect(merged.duration).toBe(2);
    expect(merged.midiData.notes).toHaveLength(2);
    expect(merged.midiData.notes.map((note) => note.pitch)).toEqual([60, 64]);
    expect(merged.midiData.notes.map((note) => note.startBeat)).toEqual([0, 2.5]);
  });

  it('merges audio clips with silence gaps and clip gain', () => {
    const clipA = makeClip({
      id: 'clip-a',
      startTime: 0,
      duration: 0.5,
      gainEnvelope: [{ time: 0, gain: 0.5 }],
    });
    const clipB = makeClip({
      id: 'clip-b',
      startTime: 1,
      duration: 0.5,
    });

    const merged = mergeAudioClipBuffers([
      {
        clip: clipA,
        buffer: makeMockAudioBuffer([[1, 1]], 4),
        sourceRegionStart: 0,
      },
      {
        clip: clipB,
        buffer: makeMockAudioBuffer([[1, 1]], 4),
        sourceRegionStart: 0,
      },
    ]);

    expect(merged.duration).toBe(1.5);
    expect(Array.from(merged.channels[0])).toEqual([0.5, 0.5, 0, 0, 1, 1]);
  });
});
