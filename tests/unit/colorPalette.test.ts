import { describe, it, expect } from 'vitest';
import {
  TRACK_COLOR_PALETTE,
  getNextTrackColor,
} from '../../src/constants/colorPalette';

describe('getNextTrackColor', () => {
  it('returns the first palette color when no colors are in use', () => {
    expect(getNextTrackColor([])).toBe(TRACK_COLOR_PALETTE[0]);
  });

  it('returns the first unused color from the palette', () => {
    const used = TRACK_COLOR_PALETTE.slice(0, 3);
    expect(getNextTrackColor(used)).toBe(TRACK_COLOR_PALETTE[3]);
  });

  it('wraps to the first palette color when all colors are in use', () => {
    expect(getNextTrackColor([...TRACK_COLOR_PALETTE])).toBe(
      TRACK_COLOR_PALETTE[0],
    );
  });
});
