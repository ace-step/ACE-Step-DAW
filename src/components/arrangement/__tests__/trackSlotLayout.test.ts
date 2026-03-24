import { describe, expect, it } from 'vitest';
import type { Track } from '../../../types/project';
import { buildArrangementTrackSlots, getArrangementEmptyTrackId } from '../trackSlotLayout';

function createTrack(id: string, displayName: string, order: number): Track {
  return {
    id,
    trackName: 'custom',
    trackType: 'sample',
    displayName,
    color: '#ffffff',
    order,
    volume: 0.8,
    muted: false,
    soloed: false,
    clips: [],
  };
}

describe('trackSlotLayout', () => {
  it('preserves empty arrangement rows between sparse track orders', () => {
    const slots = buildArrangementTrackSlots([
      createTrack('track-1', 'Track 1', 1),
      createTrack('track-2', 'Track 2', 4),
    ], 6);

    expect(slots.slice(0, 6)).toEqual([
      { kind: 'track', track: expect.objectContaining({ id: 'track-1', order: 1 }) },
      { kind: 'empty', slotIndex: 1 },
      { kind: 'empty', slotIndex: 2 },
      { kind: 'track', track: expect.objectContaining({ id: 'track-2', order: 4 }) },
      { kind: 'empty', slotIndex: 4 },
      { kind: 'empty', slotIndex: 5 },
    ]);
  });

  it('derives stable virtual ids from absolute slot indices', () => {
    expect(getArrangementEmptyTrackId(3)).toBe('__empty-3');
  });

  it('fills the arrangement to 128 visible rows by default', () => {
    const slots = buildArrangementTrackSlots([]);

    expect(slots).toHaveLength(128);
    expect(slots.at(0)).toEqual({ kind: 'empty', slotIndex: 0 });
    expect(slots.at(-1)).toEqual({ kind: 'empty', slotIndex: 127 });
  });
});
