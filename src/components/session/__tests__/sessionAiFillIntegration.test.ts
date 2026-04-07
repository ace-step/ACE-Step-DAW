import { describe, it, expect } from 'vitest';
import { gatherAiFillContext } from '../../../utils/sessionAiFill';
import type { Track, SessionClipSlot, SessionScene, Clip } from '../../../types/project';

/**
 * Tests verifying that AI-fill gathers context and produces the expected
 * prompt/clip metadata for session slot generation.
 * The actual generation trigger (generateSingleClip) is tested via
 * the generationPipeline unit tests.
 */

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
  return { id, trackId, sceneId, clipId };
}

describe('Session AI-fill integration', () => {
  const scenes = [makeScene('s0', 0), makeScene('s1', 1), makeScene('s2', 2), makeScene('s3', 3)];

  it('produces a prompt suitable for generation from adjacent clips', () => {
    const clip1 = makeClip({ id: 'c1', prompt: 'energetic synth lead' });
    const clip2 = makeClip({ id: 'c2', prompt: 'deep bass groove' });
    const track: Track = {
      id: 'track-1',
      displayName: 'Synth',
      clips: [clip1, clip2],
    } as Track;
    const slots = [
      makeSlot('slot-0', 'track-1', 's0', 'c1'),
      makeSlot('slot-1', 'track-1', 's1', null), // target
      makeSlot('slot-2', 'track-1', 's2', 'c2'),
    ];

    const result = gatherAiFillContext(track, 1, scenes, slots, [track]);
    // Should pick the nearest clip's prompt
    expect(result.prompt.length).toBeGreaterThan(0);
    expect(result.adjacentClipIds).toContain('c1');
    expect(result.adjacentClipIds).toContain('c2');
  });

  it('gathers cross-track context from same scene', () => {
    const drumClip = makeClip({ id: 'drum-c1', prompt: '808 trap beat' });
    const drumTrack: Track = {
      id: 'drum-track',
      displayName: 'Drums',
      clips: [drumClip],
    } as Track;
    const bassTrack: Track = {
      id: 'bass-track',
      displayName: 'Bass',
      clips: [],
    } as Track;
    const slots = [
      makeSlot('slot-d0', 'drum-track', 's0', 'drum-c1'),
      makeSlot('slot-b0', 'bass-track', 's0', null), // target
    ];

    const result = gatherAiFillContext(bassTrack, 0, scenes, slots, [drumTrack, bassTrack]);
    expect(result.prompt).toBe('808 trap beat');
    expect(result.adjacentClipIds).toContain('drum-c1');
  });

  it('creates fallback prompt with track name when no context', () => {
    const track: Track = {
      id: 'track-1',
      displayName: 'Strings',
      clips: [],
    } as Track;
    const slots = [makeSlot('slot-0', 'track-1', 's0', null)];

    const result = gatherAiFillContext(track, 0, scenes, slots, [track]);
    expect(result.prompt).toBe('Strings clip for scene 1');
  });

  it('limits adjacent clip collection to 3 from same track + 2 from same scene', () => {
    // Create 5 clips on the same track
    const clips = Array.from({ length: 5 }, (_, i) =>
      makeClip({ id: `c${i}`, prompt: `prompt ${i}` }),
    );
    const track: Track = {
      id: 'track-1',
      displayName: 'Lead',
      clips,
    } as Track;
    const slots = [
      ...clips.map((c, i) => makeSlot(`slot-${i}`, 'track-1', scenes[i]?.id ?? `s${i}`, c.id)),
    ];

    // Target scene 2 — should get up to 3 nearest from same track
    const result = gatherAiFillContext(track, 2, scenes, slots, [track]);
    // Should have at most 3 from same track (nearest) + 0 from other tracks
    expect(result.adjacentClipIds.length).toBeLessThanOrEqual(3);
    expect(result.adjacentClipIds.length).toBeGreaterThan(0);
  });
});
