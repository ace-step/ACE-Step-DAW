import { describe, it, expect } from 'vitest';
import { calcClipSlip } from '../dragMath';

describe('calcClipSlip', () => {
  const pps = 100;
  const audioDuration = 10;

  it('shifts audioOffset right when dragging right (positive deltaPx)', () => {
    expect(calcClipSlip(2, 100, pps, audioDuration, 4)).toBe(3);
  });

  it('shifts audioOffset left when dragging left (negative deltaPx)', () => {
    expect(calcClipSlip(3, -200, pps, audioDuration, 4)).toBe(1);
  });

  it('clamps audioOffset to 0', () => {
    expect(calcClipSlip(1, -500, pps, audioDuration, 4)).toBe(0);
  });

  it('clamps audioOffset so clip does not extend past audio end', () => {
    expect(calcClipSlip(5, 500, pps, audioDuration, 4)).toBe(6);
  });

  it('returns origAudioOffset when audioDuration <= clipDuration', () => {
    expect(calcClipSlip(0, 100, pps, 4, 4)).toBe(0);
  });

  it('handles zero deltaPx', () => {
    expect(calcClipSlip(2, 0, pps, audioDuration, 4)).toBe(2);
  });
});
