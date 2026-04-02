import { describe, it, expect } from 'vitest';
import type { DragGhostInfo } from '../useClipDrag';

describe('DragGhostInfo.isValidDrop', () => {
  it('defaults to undefined (truthy) when not set', () => {
    const ghost: DragGhostInfo = {
      x: 100,
      y: 200,
      width: 150,
      height: 60,
      targetTrackId: 'track-1',
      targetLaneRect: null,
      sourceLaneRect: null,
    };
    // isValidDrop not set = undefined, which should be treated as valid
    expect(ghost.isValidDrop).toBeUndefined();
    expect(ghost.isValidDrop !== false).toBe(true);
  });

  it('can be set to false for invalid targets', () => {
    const ghost: DragGhostInfo = {
      x: 100,
      y: 200,
      width: 150,
      height: 60,
      targetTrackId: 'group-1',
      targetLaneRect: { top: 100, height: 60 },
      sourceLaneRect: null,
      isValidDrop: false,
    };
    expect(ghost.isValidDrop).toBe(false);
  });

  it('can be set to true for valid targets', () => {
    const ghost: DragGhostInfo = {
      x: 100,
      y: 200,
      width: 150,
      height: 60,
      targetTrackId: 'track-2',
      targetLaneRect: { top: 100, height: 60 },
      sourceLaneRect: null,
      isValidDrop: true,
    };
    expect(ghost.isValidDrop).toBe(true);
  });
});
