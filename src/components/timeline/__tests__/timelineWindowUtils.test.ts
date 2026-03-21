import { describe, expect, it } from 'vitest';
import {
  clampTimelineWindowStart,
  cloneTimelineWindow,
  convertTimelineWindowMode,
  getTimelineWindowDuration,
  moveTimelineWindow,
} from '../timelineWindowUtils';

describe('timelineWindowUtils', () => {
  it('preserves duration when moving a timeline window', () => {
    const moved = moveTimelineWindow(
      { startTime: 4, endTime: 9, trackIds: ['track-1', 'track-2'] },
      10,
      30,
    );

    expect(moved).toEqual({
      startTime: 10,
      endTime: 15,
      trackIds: ['track-1', 'track-2'],
    });
    expect(getTimelineWindowDuration(moved)).toBe(5);
  });

  it('clamps moved windows to the project duration', () => {
    const moved = moveTimelineWindow(
      { startTime: 18, endTime: 24, trackIds: ['track-3'] },
      22,
      24,
    );

    expect(moved).toEqual({
      startTime: 18,
      endTime: 24,
      trackIds: ['track-3'],
    });
  });

  it('clamps starts below zero', () => {
    expect(clampTimelineWindowStart(-3, 5, 24)).toBe(0);
  });

  it('clones track ids so mode switches do not share mutable arrays', () => {
    const original = { startTime: 2, endTime: 6, trackIds: ['track-a'] };
    const cloned = cloneTimelineWindow(original);

    cloned.trackIds.push('track-b');

    expect(original.trackIds).toEqual(['track-a']);
    expect(cloned.trackIds).toEqual(['track-a', 'track-b']);
  });

  it('converts a select window into a context window', () => {
    const next = convertTimelineWindowMode('select', {
      selectWindow: { startTime: 1, endTime: 5, trackIds: ['track-a'] },
      contextWindow: { startTime: 8, endTime: 12, trackIds: ['track-b'] },
    });

    expect(next).toEqual({
      selectWindow: null,
      contextWindow: { startTime: 1, endTime: 5, trackIds: ['track-a'] },
    });
  });

  it('converts a context window into a select window', () => {
    const next = convertTimelineWindowMode('context', {
      selectWindow: { startTime: 1, endTime: 5, trackIds: ['track-a'] },
      contextWindow: { startTime: 8, endTime: 12, trackIds: ['track-b'] },
    });

    expect(next).toEqual({
      selectWindow: { startTime: 8, endTime: 12, trackIds: ['track-b'] },
      contextWindow: null,
    });
  });
});
