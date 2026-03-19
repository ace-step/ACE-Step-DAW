import { describe, expect, it } from 'vitest';
import { TRACK_COLOR_PALETTE, getNextTrackColor } from '../../src/constants/colorPalette';

describe('getNextTrackColor', () => {
  it('returns the first palette color when no tracks exist', () => {
    expect(getNextTrackColor([])).toBe(TRACK_COLOR_PALETTE[0]);
  });

  it('skips colors already in use and returns the next unused one', () => {
    const used = [TRACK_COLOR_PALETTE[0], TRACK_COLOR_PALETTE[1]];
    expect(getNextTrackColor(used)).toBe(TRACK_COLOR_PALETTE[2]);
  });

  it('wraps around when all 16 colors are used', () => {
    const allUsed = [...TRACK_COLOR_PALETTE];
    const result = getNextTrackColor(allUsed);
    expect(TRACK_COLOR_PALETTE).toContain(result);
    expect(result).toBe(TRACK_COLOR_PALETTE[allUsed.length % TRACK_COLOR_PALETTE.length]);
  });
});
