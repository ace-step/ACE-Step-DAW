import { describe, it, expect } from 'vitest';
import { gatherAiFillContext } from '../sessionAiFill';
import type { Track, SessionClipSlot, SessionScene, Clip } from '../../types/project';

function makeClip(overrides: Partial<Clip> & { id: string; prompt: string }): Clip {
  return {
    trackId: 'track-1',
    startTime: 0,
    duration: 4,
    lyrics: '',
    source: 'generated',
    generationStatus: 'idle',
    generationJobId: null,
    cumulativeMixKey: null,
    isolatedAudioKey: null,
    waveformPeaks: null,
    ...overrides,
  } as Clip;
}

function makeScene(id: string, index: number): SessionScene {
  return { id, name: `Scene ${index + 1}`, index };
}

function makeSlot(id: string, trackId: string, sceneId: string, clipId: string | null): SessionClipSlot {
  return { id, trackId, sceneId, clipId: clipId };
}

describe('gatherAiFillContext', () => {
  const scenes = [makeScene('s0', 0), makeScene('s1', 1), makeScene('s2', 2), makeScene('s3', 3)];

  it('returns adjacent clip prompt from same track', () => {
    const clip1 = makeClip({ id: 'c1', prompt: 'energetic pop chorus' });
    const track: Track = {
      id: 'track-1',
      displayName: 'Vocals',
      clips: [clip1],
    } as Track;
    const slots = [
      makeSlot('slot-0', 'track-1', 's0', 'c1'),
      makeSlot('slot-1', 'track-1', 's1', null),
    ];

    const result = gatherAiFillContext(track, 1, scenes, slots, [track]);
    expect(result.prompt).toBe('energetic pop chorus');
    expect(result.adjacentClipIds).toContain('c1');
  });

  it('picks nearest clip when multiple are available', () => {
    const clipFar = makeClip({ id: 'c0', prompt: 'far away prompt' });
    const clipNear = makeClip({ id: 'c2', prompt: 'nearby prompt' });
    const track: Track = {
      id: 'track-1',
      displayName: 'Bass',
      clips: [clipFar, clipNear],
    } as Track;
    const slots = [
      makeSlot('slot-0', 'track-1', 's0', 'c0'),
      makeSlot('slot-1', 'track-1', 's1', null),
      makeSlot('slot-2', 'track-1', 's2', null),
      makeSlot('slot-3', 'track-1', 's3', 'c2'),
    ];

    // target scene 2: c2 at scene 3 is 1 away, c0 at scene 0 is 2 away
    const result = gatherAiFillContext(track, 2, scenes, slots, [track]);
    expect(result.prompt).toBe('nearby prompt');
  });

  it('gathers context from clips in the same scene on other tracks', () => {
    const clip1 = makeClip({ id: 'c1', prompt: 'drum pattern' });
    const track1: Track = { id: 'track-1', displayName: 'Drums', clips: [clip1] } as Track;
    const track2: Track = { id: 'track-2', displayName: 'Bass', clips: [] } as Track;
    const slots = [
      makeSlot('slot-0', 'track-1', 's0', 'c1'),
      makeSlot('slot-1', 'track-2', 's0', null),
    ];

    const result = gatherAiFillContext(track2, 0, scenes, slots, [track1, track2]);
    expect(result.prompt).toBe('drum pattern');
    expect(result.adjacentClipIds).toContain('c1');
  });

  it('falls back to track name when no adjacent clips', () => {
    const track: Track = { id: 'track-1', displayName: 'Piano', clips: [] } as Track;
    const slots = [makeSlot('slot-0', 'track-1', 's0', null)];

    const result = gatherAiFillContext(track, 0, scenes, slots, [track]);
    expect(result.prompt).toBe('Piano clip for scene 1');
    expect(result.adjacentClipIds).toHaveLength(0);
  });
});
