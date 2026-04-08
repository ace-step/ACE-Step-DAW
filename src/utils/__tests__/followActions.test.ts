import { describe, it, expect, vi, afterEach } from 'vitest';
import type { SessionClipSlot, SessionScene } from '../../types/project';
import {
  detectClipGroups,
  resolveFollowAction,
  rollFollowAction,
  resolveSceneFollowAction,
} from '../followActions';

function makeSlot(overrides: Partial<SessionClipSlot> = {}): SessionClipSlot {
  return {
    id: 'slot-1',
    trackId: 'track-1',
    sceneId: 'scene-1',
    clipId: 'clip-1',
    ...overrides,
  };
}

function makeScene(overrides: Partial<SessionScene> = {}): SessionScene {
  return {
    id: 'scene-1',
    name: 'Scene 1',
    index: 0,
    ...overrides,
  };
}

describe('detectClipGroups', () => {
  it('returns empty for no slots', () => {
    expect(detectClipGroups([], [], 'track-1')).toEqual([]);
  });

  it('groups consecutive occupied slots', () => {
    const scenes = [
      makeScene({ id: 's1', index: 0 }),
      makeScene({ id: 's2', index: 1 }),
      makeScene({ id: 's3', index: 2 }),
    ];
    const slots = [
      makeSlot({ id: 'a', sceneId: 's1', clipId: 'c1' }),
      makeSlot({ id: 'b', sceneId: 's2', clipId: 'c2' }),
      makeSlot({ id: 'c', sceneId: 's3', clipId: 'c3' }),
    ];
    const groups = detectClipGroups(slots, scenes, 'track-1');
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(3);
  });

  it('splits groups at empty slots', () => {
    const scenes = [
      makeScene({ id: 's1', index: 0 }),
      makeScene({ id: 's2', index: 1 }),
      makeScene({ id: 's3', index: 2 }),
    ];
    const slots = [
      makeSlot({ id: 'a', sceneId: 's1', clipId: 'c1' }),
      makeSlot({ id: 'b', sceneId: 's2', clipId: null }),
      makeSlot({ id: 'c', sceneId: 's3', clipId: 'c3' }),
    ];
    const groups = detectClipGroups(slots, scenes, 'track-1');
    expect(groups).toHaveLength(2);
    expect(groups[0]).toHaveLength(1);
    expect(groups[1]).toHaveLength(1);
  });

  it('filters by trackId', () => {
    const scenes = [makeScene({ id: 's1', index: 0 })];
    const slots = [
      makeSlot({ id: 'a', trackId: 'track-1', sceneId: 's1', clipId: 'c1' }),
      makeSlot({ id: 'b', trackId: 'track-2', sceneId: 's1', clipId: 'c2' }),
    ];
    const groups = detectClipGroups(slots, scenes, 'track-1');
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(1);
    expect(groups[0][0].id).toBe('a');
  });
});

describe('resolveFollowAction', () => {
  const group = [
    makeSlot({ id: 's1' }),
    makeSlot({ id: 's2' }),
    makeSlot({ id: 's3' }),
  ];

  it('returns null for stop action', () => {
    expect(resolveFollowAction('stop', group[0], group)).toBeNull();
  });

  it('returns same slot for again action', () => {
    const result = resolveFollowAction('again', group[1], group);
    expect(result?.id).toBe('s2');
  });

  it('returns next slot with wraparound', () => {
    expect(resolveFollowAction('next', group[2], group)?.id).toBe('s1');
    expect(resolveFollowAction('next', group[0], group)?.id).toBe('s2');
  });

  it('returns previous slot with wraparound', () => {
    expect(resolveFollowAction('previous', group[0], group)?.id).toBe('s3');
    expect(resolveFollowAction('previous', group[1], group)?.id).toBe('s1');
  });

  it('returns first slot', () => {
    expect(resolveFollowAction('first', group[2], group)?.id).toBe('s1');
  });

  it('returns last slot', () => {
    expect(resolveFollowAction('last', group[0], group)?.id).toBe('s3');
  });

  it('returns a slot from group for any action', () => {
    const result = resolveFollowAction('any', group[0], group);
    expect(group.some((s) => s.id === result?.id)).toBe(true);
  });

  it('returns a different slot for other action when possible', () => {
    // With 3 slots, 'other' should never return the current slot
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const result = resolveFollowAction('other', group[0], group);
    expect(result?.id).not.toBe('s1');
    vi.restoreAllMocks();
  });

  it('returns current slot for other action with single-element group', () => {
    const singleGroup = [makeSlot({ id: 'only' })];
    const result = resolveFollowAction('other', singleGroup[0], singleGroup);
    expect(result?.id).toBe('only');
  });

  it('returns null when slot not in group', () => {
    const orphan = makeSlot({ id: 'orphan' });
    expect(resolveFollowAction('next', orphan, group)).toBeNull();
  });
});

describe('rollFollowAction', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns actionA when random < chanceA', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.3);
    const result = rollFollowAction({
      actionA: 'next',
      actionB: 'stop',
      chanceA: 0.5,
    });
    expect(result).toBe('next');
  });

  it('returns actionB when random >= chanceA', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.7);
    const result = rollFollowAction({
      actionA: 'next',
      actionB: 'stop',
      chanceA: 0.5,
    });
    expect(result).toBe('stop');
  });
});

describe('resolveSceneFollowAction', () => {
  const scenes = [
    makeScene({ id: 'a', index: 0 }),
    makeScene({ id: 'b', index: 1 }),
    makeScene({ id: 'c', index: 2 }),
  ];

  it('returns null for none action', () => {
    expect(resolveSceneFollowAction('none', scenes[0], scenes)).toBeNull();
  });

  it('returns null for stop action', () => {
    expect(resolveSceneFollowAction('stop', scenes[0], scenes)).toBeNull();
  });

  it('returns next scene', () => {
    expect(resolveSceneFollowAction('next', scenes[0], scenes)?.id).toBe('b');
  });

  it('returns null for next at last scene (no wrap)', () => {
    expect(resolveSceneFollowAction('next', scenes[2], scenes)).toBeNull();
  });

  it('returns previous scene', () => {
    expect(resolveSceneFollowAction('previous', scenes[1], scenes)?.id).toBe('a');
  });

  it('returns null for previous at first scene (no wrap)', () => {
    expect(resolveSceneFollowAction('previous', scenes[0], scenes)).toBeNull();
  });

  it('returns a random scene', () => {
    const result = resolveSceneFollowAction('random', scenes[0], scenes);
    expect(scenes.some((s) => s.id === result?.id)).toBe(true);
  });

  it('returns null for scene not in list', () => {
    const orphan = makeScene({ id: 'orphan', index: 99 });
    expect(resolveSceneFollowAction('next', orphan, scenes)).toBeNull();
  });
});
