import { describe, expect, it } from 'vitest';
import {
  resolveBounceRange,
  DEFAULT_BOUNCE_IN_PLACE_OPTIONS,
} from '../bounceInPlace';
import type { BounceInPlaceOptions, Project, Track } from '../../types/project';

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'track-1',
    trackName: 'keyboard',
    trackType: 'pianoRoll',
    displayName: 'Keys',
    color: '#22c55e',
    order: 1,
    volume: 0.8,
    muted: false,
    soloed: false,
    effects: [],
    clips: [],
    ...overrides,
  } as Track;
}

function makeProject(tracks: Track[] = [], overrides: Partial<Project> = {}): Project {
  return {
    id: 'project-1',
    name: 'Bounce Test',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    bpm: 120,
    keyScale: 'C major',
    timeSignature: 4,
    totalDuration: 8,
    globalCaption: '',
    generationDefaults: { inferenceSteps: 8, guidanceScale: 3, shift: 0, thinking: false, model: 'test' },
    tracks,
    markers: [],
    assets: [],
    trackPresets: [],
    automationLanes: [],
    returnTracks: [],
    tempoMap: [],
    timeSignatureMap: [],
    mastering: undefined,
    measures: 8,
    masterVolume: 0.8,
  } as Project;
}

describe('resolveBounceRange', () => {
  it('returns clip content range when track has clips', () => {
    const track = makeTrack({
      clips: [
        { id: 'c1', trackId: 'track-1', startTime: 2, duration: 3 } as Track['clips'][0],
        { id: 'c2', trackId: 'track-1', startTime: 6, duration: 1 } as Track['clips'][0],
      ],
    });
    const project = makeProject([track]);
    const range = resolveBounceRange(project, track, DEFAULT_BOUNCE_IN_PLACE_OPTIONS);

    expect(range.startTime).toBe(2);
    expect(range.duration).toBe(5); // 6+1 - 2 = 5
  });

  it('returns full project duration when track has no clips', () => {
    const track = makeTrack({ clips: [] });
    const project = makeProject([track]);
    const range = resolveBounceRange(project, track, DEFAULT_BOUNCE_IN_PLACE_OPTIONS);

    expect(range.startTime).toBe(0);
    expect(range.duration).toBe(8);
  });

  it('uses explicit startTime and duration when provided', () => {
    const track = makeTrack({
      clips: [{ id: 'c1', trackId: 'track-1', startTime: 0, duration: 10 } as Track['clips'][0]],
    });
    const project = makeProject([track]);
    const options: BounceInPlaceOptions = {
      ...DEFAULT_BOUNCE_IN_PLACE_OPTIONS,
      startTime: 3,
      duration: 4,
    };
    const range = resolveBounceRange(project, track, options);

    expect(range.startTime).toBe(3);
    expect(range.duration).toBe(4);
  });

  it('clamps negative startTime to 0', () => {
    const track = makeTrack();
    const project = makeProject([track]);
    const options: BounceInPlaceOptions = {
      ...DEFAULT_BOUNCE_IN_PLACE_OPTIONS,
      startTime: -5,
      duration: 2,
    };
    const range = resolveBounceRange(project, track, options);

    expect(range.startTime).toBe(0);
  });

  it('enforces minimum duration of 0.01', () => {
    const track = makeTrack();
    const project = makeProject([track], { totalDuration: 0 });
    const range = resolveBounceRange(project, track, DEFAULT_BOUNCE_IN_PLACE_OPTIONS);

    expect(range.duration).toBeGreaterThanOrEqual(0.01);
  });

  it('handles single clip correctly', () => {
    const track = makeTrack({
      clips: [{ id: 'c1', trackId: 'track-1', startTime: 4, duration: 2 } as Track['clips'][0]],
    });
    const project = makeProject([track]);
    const range = resolveBounceRange(project, track, DEFAULT_BOUNCE_IN_PLACE_OPTIONS);

    expect(range.startTime).toBe(4);
    expect(range.duration).toBe(2);
  });
});

describe('DEFAULT_BOUNCE_IN_PLACE_OPTIONS', () => {
  it('has expected default values', () => {
    expect(DEFAULT_BOUNCE_IN_PLACE_OPTIONS).toEqual({
      includeEffects: true,
      includeAutomation: true,
      normalize: false,
      replaceOriginal: true,
    });
  });
});
