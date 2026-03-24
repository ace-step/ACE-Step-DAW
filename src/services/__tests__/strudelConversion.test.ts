import { describe, expect, it } from 'vitest';
import {
  convertMidiClipToStrudelCode,
  convertMidiTrackToStrudelCode,
  createDefaultStrudelFromMidiOptions,
} from '../strudelConversion';
import type { Clip, Project, Track } from '../../types/project';

function createProject(overrides?: Partial<Project>): Project {
  return {
    id: 'project-1',
    name: 'Test Project',
    createdAt: 1,
    updatedAt: 1,
    bpm: 120,
    keyScale: 'C major',
    timeSignature: 4,
    timeSignatureDenominator: 4,
    totalDuration: 8,
    tracks: [],
    generationDefaults: {
      inferenceSteps: 30,
      guidanceScale: 7,
      shift: 0,
      thinking: false,
      model: 'test',
    },
    ...overrides,
  };
}

function createMidiClip(notes: Clip['midiData']['notes']): Clip {
  return {
    id: 'clip-1',
    trackId: 'track-1',
    startTime: 0,
    duration: 2,
    prompt: 'MIDI Clip',
    lyrics: '',
    source: 'uploaded',
    generationStatus: 'ready',
    generationJobId: null,
    cumulativeMixKey: null,
    isolatedAudioKey: null,
    waveformPeaks: null,
    midiData: {
      notes,
      grid: '1/16',
    },
  };
}

function createTrack(clip: Clip, overrides?: Partial<Track>): Track {
  return {
    id: 'track-1',
    trackName: 'keyboard',
    displayName: 'Lead Keys',
    color: '#22c55e',
    volume: 0.8,
    order: 1,
    muted: false,
    soloed: false,
    clips: [clip],
    trackType: 'pianoRoll',
    synthPreset: 'piano',
    ...overrides,
  };
}

describe('convertMidiClipToStrudelCode', () => {
  it('converts a simple melodic clip to Strudel code', () => {
    const clip = createMidiClip([
      { id: 'n1', pitch: 60, startBeat: 0, durationBeats: 1, velocity: 0.8 },
      { id: 'n2', pitch: 64, startBeat: 1, durationBeats: 1, velocity: 0.8 },
      { id: 'n3', pitch: 67, startBeat: 2, durationBeats: 2, velocity: 0.8 },
    ]);
    const track = createTrack(clip);
    const project = createProject({ tracks: [track] });
    const result = convertMidiClipToStrudelCode(clip, track, project, createDefaultStrudelFromMidiOptions(project));

    expect(result).not.toBeNull();
    expect(result?.code).toContain('const BPM = 120;');
    expect(result?.code).toContain('const lead_keys_clip');
    expect(result?.code).toContain('note(`');
    expect(result?.code).toContain('stack(');
  });

  it('splits overlapping notes into multiple melodic voices', () => {
    const clip = createMidiClip([
      { id: 'n1', pitch: 60, startBeat: 0, durationBeats: 2, velocity: 0.8 },
      { id: 'n2', pitch: 64, startBeat: 0, durationBeats: 2, velocity: 0.8 },
      { id: 'n3', pitch: 67, startBeat: 2, durationBeats: 2, velocity: 0.8 },
    ]);
    const track = createTrack(clip);
    const project = createProject({ tracks: [track] });
    const result = convertMidiClipToStrudelCode(clip, track, project, createDefaultStrudelFromMidiOptions(project));

    expect(result).not.toBeNull();
    expect(result?.code).toContain('const lead_keys_clip');
    expect(result?.code).toContain('const lead_keys_clip_harmony');
    expect(result?.code).toContain('stack(');
  });

  it('renders drum MIDI as Strudel percussion patterns', () => {
    const clip = createMidiClip([
      { id: 'n1', pitch: 36, startBeat: 0, durationBeats: 1, velocity: 0.8 },
      { id: 'n2', pitch: 38, startBeat: 1, durationBeats: 1, velocity: 0.8 },
      { id: 'n3', pitch: 42, startBeat: 2, durationBeats: 1, velocity: 0.8 },
    ]);
    const track = createTrack(clip, {
      trackName: 'drums',
      displayName: 'Drums',
    });
    const project = createProject({ tracks: [track] });
    const result = convertMidiClipToStrudelCode(clip, track, project, createDefaultStrudelFromMidiOptions(project));

    expect(result).not.toBeNull();
    expect(result?.code).toContain('s(`');
    expect(result?.code).toContain('bd');
    expect(result?.code).toContain('sd');
    expect(result?.code).toContain('hh');
  });
});

describe('convertMidiTrackToStrudelCode', () => {
  it('uses relative notation when a compatible key is provided', () => {
    const clip = createMidiClip([
      { id: 'n1', pitch: 60, startBeat: 0, durationBeats: 1, velocity: 0.8 },
      { id: 'n2', pitch: 62, startBeat: 1, durationBeats: 1, velocity: 0.8 },
      { id: 'n3', pitch: 64, startBeat: 2, durationBeats: 1, velocity: 0.8 },
    ]);
    const track = createTrack(clip);
    const project = createProject({ tracks: [track] });
    const result = convertMidiTrackToStrudelCode(track, project, {
      ...createDefaultStrudelFromMidiOptions(project),
      notationType: 'relative',
      keyScale: 'C major',
    });

    expect(result).not.toBeNull();
    expect(result?.code).toContain('n(`');
    expect(result?.code).toContain('.scale("c:major")');
  });

  it('is deterministic for the same track and options', () => {
    const clip = createMidiClip([
      { id: 'n1', pitch: 60, startBeat: 0, durationBeats: 1, velocity: 0.8 },
      { id: 'n2', pitch: 67, startBeat: 2, durationBeats: 1, velocity: 0.8 },
    ]);
    const track = createTrack(clip);
    const project = createProject({ tracks: [track] });
    const options = createDefaultStrudelFromMidiOptions(project);

    const first = convertMidiTrackToStrudelCode(track, project, options);
    const second = convertMidiTrackToStrudelCode(track, project, options);

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first?.code).toBe(second?.code);
  });
});
