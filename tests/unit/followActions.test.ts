import { describe, it, expect, vi } from 'vitest';
import {
  detectClipGroups,
  resolveFollowAction,
  rollFollowAction,
} from '../../src/utils/followActions';
import type {
  SessionClipSlot,
  SessionScene,
  FollowActionConfig,
  FollowActionType,
} from '../../src/types/project';

function makeScene(index: number): SessionScene {
  return { id: `scene-${index}`, name: `Scene ${index + 1}`, index };
}

function makeSlot(
  trackId: string,
  sceneId: string,
  clipId: string | null,
  overrides: Partial<SessionClipSlot> = {},
): SessionClipSlot {
  return {
    id: `slot-${trackId}-${sceneId}`,
    trackId,
    sceneId,
    clipId,
    ...overrides,
  };
}

function makeConfig(overrides: Partial<FollowActionConfig> = {}): FollowActionConfig {
  return {
    actionA: 'next',
    actionB: 'stop',
    chanceA: 1,
    time: 4,
    enabled: true,
    ...overrides,
  };
}

describe('detectClipGroups', () => {
  it('detects a single group of consecutive occupied slots', () => {
    const scenes = [makeScene(0), makeScene(1), makeScene(2)];
    const slots = [
      makeSlot('t1', 'scene-0', 'clip-a'),
      makeSlot('t1', 'scene-1', 'clip-b'),
      makeSlot('t1', 'scene-2', 'clip-c'),
    ];

    const groups = detectClipGroups(slots, scenes, 't1');
    expect(groups).toHaveLength(1);
    expect(groups[0].map((s) => s.clipId)).toEqual(['clip-a', 'clip-b', 'clip-c']);
  });

  it('splits groups at empty slots', () => {
    const scenes = [makeScene(0), makeScene(1), makeScene(2), makeScene(3)];
    const slots = [
      makeSlot('t1', 'scene-0', 'clip-a'),
      makeSlot('t1', 'scene-1', null),
      makeSlot('t1', 'scene-2', 'clip-b'),
      makeSlot('t1', 'scene-3', 'clip-c'),
    ];

    const groups = detectClipGroups(slots, scenes, 't1');
    expect(groups).toHaveLength(2);
    expect(groups[0].map((s) => s.clipId)).toEqual(['clip-a']);
    expect(groups[1].map((s) => s.clipId)).toEqual(['clip-b', 'clip-c']);
  });

  it('returns empty array for track with no occupied slots', () => {
    const scenes = [makeScene(0), makeScene(1)];
    const slots = [
      makeSlot('t1', 'scene-0', null),
      makeSlot('t1', 'scene-1', null),
    ];

    const groups = detectClipGroups(slots, scenes, 't1');
    expect(groups).toHaveLength(0);
  });

  it('filters slots by trackId', () => {
    const scenes = [makeScene(0), makeScene(1)];
    const slots = [
      makeSlot('t1', 'scene-0', 'clip-a'),
      makeSlot('t2', 'scene-0', 'clip-x'),
      makeSlot('t1', 'scene-1', 'clip-b'),
      makeSlot('t2', 'scene-1', null),
    ];

    const groups = detectClipGroups(slots, scenes, 't1');
    expect(groups).toHaveLength(1);
    expect(groups[0].map((s) => s.clipId)).toEqual(['clip-a', 'clip-b']);
  });

  it('handles single occupied slot as a group', () => {
    const scenes = [makeScene(0), makeScene(1), makeScene(2)];
    const slots = [
      makeSlot('t1', 'scene-0', null),
      makeSlot('t1', 'scene-1', 'clip-a'),
      makeSlot('t1', 'scene-2', null),
    ];

    const groups = detectClipGroups(slots, scenes, 't1');
    expect(groups).toHaveLength(1);
    expect(groups[0].map((s) => s.clipId)).toEqual(['clip-a']);
  });

  it('orders slots by scene index', () => {
    const scenes = [makeScene(0), makeScene(1), makeScene(2)];
    // Slots given in reverse order
    const slots = [
      makeSlot('t1', 'scene-2', 'clip-c'),
      makeSlot('t1', 'scene-0', 'clip-a'),
      makeSlot('t1', 'scene-1', 'clip-b'),
    ];

    const groups = detectClipGroups(slots, scenes, 't1');
    expect(groups).toHaveLength(1);
    expect(groups[0].map((s) => s.clipId)).toEqual(['clip-a', 'clip-b', 'clip-c']);
  });
});

describe('resolveFollowAction', () => {
  const scenes = [makeScene(0), makeScene(1), makeScene(2), makeScene(3)];
  const slots = [
    makeSlot('t1', 'scene-0', 'clip-a'),
    makeSlot('t1', 'scene-1', 'clip-b'),
    makeSlot('t1', 'scene-2', 'clip-c'),
  ];

  // A helper to get a group for tests
  function getGroup(): SessionClipSlot[] {
    return detectClipGroups(slots, scenes, 't1')[0];
  }

  it('"next" resolves to the next clip in group', () => {
    const group = getGroup();
    const result = resolveFollowAction('next', group[0], group);
    expect(result?.clipId).toBe('clip-b');
  });

  it('"next" wraps to first from the last clip in group', () => {
    const group = getGroup();
    const result = resolveFollowAction('next', group[2], group);
    expect(result?.clipId).toBe('clip-a');
  });

  it('"previous" resolves to the previous clip in group', () => {
    const group = getGroup();
    const result = resolveFollowAction('previous', group[1], group);
    expect(result?.clipId).toBe('clip-a');
  });

  it('"previous" wraps to last from the first clip in group', () => {
    const group = getGroup();
    const result = resolveFollowAction('previous', group[0], group);
    expect(result?.clipId).toBe('clip-c');
  });

  it('"first" resolves to the first clip in group', () => {
    const group = getGroup();
    const result = resolveFollowAction('first', group[2], group);
    expect(result?.clipId).toBe('clip-a');
  });

  it('"last" resolves to the last clip in group', () => {
    const group = getGroup();
    const result = resolveFollowAction('last', group[0], group);
    expect(result?.clipId).toBe('clip-c');
  });

  it('"again" resolves to the same clip', () => {
    const group = getGroup();
    const result = resolveFollowAction('again', group[1], group);
    expect(result?.clipId).toBe('clip-b');
  });

  it('"stop" resolves to null (stop playback)', () => {
    const group = getGroup();
    const result = resolveFollowAction('stop', group[0], group);
    expect(result).toBeNull();
  });

  it('"any" resolves to some clip in the group', () => {
    const group = getGroup();
    const result = resolveFollowAction('any', group[0], group);
    // Result is either null (stop) or a slot in the group
    expect(result === null || group.some((s) => s.id === result?.id)).toBe(true);
  });

  it('"other" resolves to a different clip in the group', () => {
    const group = getGroup();
    // Run multiple times to exercise randomness; should never return the current slot
    for (let i = 0; i < 20; i++) {
      const result = resolveFollowAction('other', group[0], group);
      expect(result).not.toBeNull();
      expect(result!.clipId).not.toBe('clip-a');
    }
  });

  it('"other" with single-clip group returns the same clip (fallback)', () => {
    const singleSlot = makeSlot('t1', 'scene-0', 'clip-a');
    const result = resolveFollowAction('other', singleSlot, [singleSlot]);
    // When there's only one clip, "other" falls back to "again"
    expect(result?.clipId).toBe('clip-a');
  });
});

describe('rollFollowAction', () => {
  it('always picks action A when chanceA is 1', () => {
    const config = makeConfig({ actionA: 'next', actionB: 'stop', chanceA: 1 });
    for (let i = 0; i < 50; i++) {
      expect(rollFollowAction(config)).toBe('next');
    }
  });

  it('always picks action B when chanceA is 0', () => {
    const config = makeConfig({ actionA: 'next', actionB: 'stop', chanceA: 0 });
    for (let i = 0; i < 50; i++) {
      expect(rollFollowAction(config)).toBe('stop');
    }
  });

  it('picks both actions over many rolls when chanceA is 0.5', () => {
    const config = makeConfig({ actionA: 'next', actionB: 'stop', chanceA: 0.5 });
    const results = new Set<FollowActionType>();
    for (let i = 0; i < 200; i++) {
      results.add(rollFollowAction(config));
    }
    expect(results.has('next')).toBe(true);
    expect(results.has('stop')).toBe(true);
  });
});
