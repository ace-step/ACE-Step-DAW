import { describe, expect, it } from 'vitest';
import { getTrackHeightForPreset } from '../../../constants/trackHeight';
import {
  DEFAULT_ARRANGEMENT_ROW_HEIGHT,
  getArrangementRowHeight,
} from '../rowLayout';

describe('rowLayout', () => {
  it('uses the default stems auto height for empty arrangement rows', () => {
    expect(DEFAULT_ARRANGEMENT_ROW_HEIGHT).toBe(getTrackHeightForPreset('auto', 'stems'));
    expect(getArrangementRowHeight()).toBe(DEFAULT_ARRANGEMENT_ROW_HEIGHT);
  });

  it('preserves lane height for regular tracks', () => {
    expect(getArrangementRowHeight({ laneHeight: 92 })).toBe(92);
  });

  it('uses a shared reduced row height for group tracks', () => {
    expect(getArrangementRowHeight({ isGroup: true, laneHeight: 100 })).toBe(70);
  });

  it('respects the minimum group row height', () => {
    expect(getArrangementRowHeight({ isGroup: true, laneHeight: 48 })).toBe(40);
  });
});
