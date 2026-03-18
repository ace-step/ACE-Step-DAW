import { describe, expect, it } from 'vitest';
import {
  calcClipMove,
  calcClipResizeRight,
  calcClipResizeLeft,
  pxToTime,
  timeToPx,
  findClosestTrackId,
  MIN_CLIP_DURATION,
} from '../../src/utils/dragMath';

describe('dragMath', () => {
  const BPM = 120; // 1 beat = 0.5s
  const PPS = 100; // 100 pixels per second
  const TOTAL_DUR = 60; // 60 seconds total

  describe('calcClipMove', () => {
    it('moves a clip right by converting pixels to snapped time', () => {
      // 50px at 100px/s = 0.5s delta, starting at 2s → should snap to grid
      const result = calcClipMove(2, 50, PPS, BPM, TOTAL_DUR);
      expect(result).toBe(2.5); // 2 + 0.5 = 2.5, snaps to 2.5 (beat boundary at 120bpm)
    });

    it('clamps to 0 when dragging past the start', () => {
      const result = calcClipMove(1, -500, PPS, BPM, TOTAL_DUR);
      expect(result).toBe(0);
    });

    it('clamps to totalDuration - MIN_CLIP_DURATION when dragging past the end', () => {
      const result = calcClipMove(58, 500, PPS, BPM, TOTAL_DUR);
      expect(result).toBeLessThanOrEqual(TOTAL_DUR - MIN_CLIP_DURATION);
    });

    it('respects snap=false for free movement', () => {
      const result = calcClipMove(0, 33, PPS, BPM, TOTAL_DUR, false);
      expect(result).toBeCloseTo(0.33, 1);
    });
  });

  describe('calcClipResizeRight', () => {
    it('extends clip duration by dragging right edge', () => {
      const result = calcClipResizeRight(2, 50, PPS, BPM, 0, TOTAL_DUR);
      expect(result).toBe(2.5);
    });

    it('never goes below MIN_CLIP_DURATION', () => {
      const result = calcClipResizeRight(2, -500, PPS, BPM, 0, TOTAL_DUR);
      expect(result).toBe(MIN_CLIP_DURATION);
    });

    it('clamps to available space (totalDuration - clipStart)', () => {
      const result = calcClipResizeRight(2, 10000, PPS, BPM, 55, TOTAL_DUR);
      expect(result).toBeLessThanOrEqual(TOTAL_DUR - 55);
    });
  });

  describe('calcClipResizeLeft', () => {
    it('extends clip by dragging left edge earlier', () => {
      const { startTime, duration } = calcClipResizeLeft(2, 4, -50, PPS, BPM);
      expect(startTime).toBeLessThan(2);
      expect(duration).toBeGreaterThan(4);
    });

    it('does not resize below MIN_CLIP_DURATION', () => {
      // Try to make duration tiny by dragging right
      const result = calcClipResizeLeft(2, 1, 200, PPS, BPM);
      // Should return original if duration would be < MIN_CLIP_DURATION
      expect(result.duration).toBeGreaterThanOrEqual(MIN_CLIP_DURATION);
    });

    it('clamps start to 0', () => {
      const { startTime } = calcClipResizeLeft(0.2, 5, -500, PPS, BPM);
      expect(startTime).toBe(0);
    });

    it('adjusts audioOffset when left edge moves', () => {
      const { audioOffset } = calcClipResizeLeft(2, 4, 50, PPS, BPM, 0);
      expect(audioOffset).toBeGreaterThan(0);
    });
  });

  describe('pxToTime / timeToPx', () => {
    it('converts pixels to time correctly', () => {
      expect(pxToTime(200, PPS)).toBe(2);
    });

    it('converts time to pixels correctly', () => {
      expect(timeToPx(3, PPS)).toBe(300);
    });

    it('round-trips correctly', () => {
      const time = 5.5;
      expect(pxToTime(timeToPx(time, PPS), PPS)).toBeCloseTo(time);
    });
  });

  describe('findClosestTrackId', () => {
    const lanes = [
      { trackId: 'track-1', top: 0, bottom: 100 },
      { trackId: 'track-2', top: 100, bottom: 200 },
      { trackId: 'track-3', top: 200, bottom: 300 },
    ];

    it('finds the correct track by Y coordinate', () => {
      expect(findClosestTrackId(lanes, 50)).toBe('track-1');
      expect(findClosestTrackId(lanes, 150)).toBe('track-2');
      expect(findClosestTrackId(lanes, 250)).toBe('track-3');
    });

    it('returns null when Y is outside all lanes', () => {
      expect(findClosestTrackId(lanes, 400)).toBeNull();
    });

    it('returns the first matching lane at exact boundary', () => {
      // At y=100, track-1 bottom=100, track-2 top=100
      // track-1 is <= so it matches first
      expect(findClosestTrackId(lanes, 100)).toBe('track-1');
    });
  });
});
