import { describe, it, expect } from 'vitest';
import {
  filterSceneCuts,
  cutsToSceneRanges,
  computeFrameDiffScore,
  findNearestMarker,
  type SceneAnalysisResult,
} from '../sceneDetection';

describe('sceneDetection', () => {
  describe('filterSceneCuts', () => {
    const result: SceneAnalysisResult = {
      frameDiffs: [
        { time: 1, score: 0.1 },
        { time: 2, score: 0.5 },
        { time: 3, score: 0.3 },
        { time: 4, score: 0.8 },
        { time: 5, score: 0.9 },
      ],
      maxScore: 0.9,
    };

    it('returns all cuts at sensitivity 1.0', () => {
      const cuts = filterSceneCuts(result, 1.0);
      // threshold = 0.9 * (1 - 1.0) = 0 → all scores > 0 pass
      expect(cuts).toEqual([1, 2, 3, 4, 5]);
    });

    it('returns no cuts at sensitivity 0.0', () => {
      const cuts = filterSceneCuts(result, 0.0);
      // threshold = 0.9 * (1 - 0.0) = 0.9 → no score > 0.9
      expect(cuts).toEqual([]);
    });

    it('returns only high-score cuts at medium sensitivity', () => {
      const cuts = filterSceneCuts(result, 0.5);
      // threshold = 0.9 * 0.5 = 0.45 → scores > 0.45: 0.5, 0.8, 0.9
      expect(cuts).toEqual([2, 4, 5]);
    });

    it('returns timestamps, not scores', () => {
      const cuts = filterSceneCuts(result, 0.8);
      cuts.forEach((t) => expect(typeof t).toBe('number'));
      // All returned values should be from the time field
      expect(cuts.every((t) => [1, 2, 3, 4, 5].includes(t))).toBe(true);
    });

    it('clamps sensitivity to 0-1 range', () => {
      expect(filterSceneCuts(result, -0.5)).toEqual([]);
      expect(filterSceneCuts(result, 1.5)).toEqual([1, 2, 3, 4, 5]);
    });

    it('returns empty array for empty frameDiffs', () => {
      const empty: SceneAnalysisResult = { frameDiffs: [], maxScore: 0 };
      expect(filterSceneCuts(empty, 0.5)).toEqual([]);
    });

    it('returns empty array when maxScore is 0', () => {
      const zero: SceneAnalysisResult = {
        frameDiffs: [{ time: 1, score: 0 }],
        maxScore: 0,
      };
      expect(filterSceneCuts(zero, 0.5)).toEqual([]);
    });
  });

  describe('cutsToSceneRanges', () => {
    it('creates ranges from cut points', () => {
      const ranges = cutsToSceneRanges([10, 20, 30], 60);
      expect(ranges).toEqual([
        { startTime: 0, endTime: 10 },
        { startTime: 10, endTime: 20 },
        { startTime: 20, endTime: 30 },
        { startTime: 30, endTime: 60 },
      ]);
    });

    it('handles single cut', () => {
      const ranges = cutsToSceneRanges([15], 30);
      expect(ranges).toEqual([
        { startTime: 0, endTime: 15 },
        { startTime: 15, endTime: 30 },
      ]);
    });

    it('returns empty for no cuts', () => {
      expect(cutsToSceneRanges([], 60)).toEqual([]);
    });

    it('handles cut at time 0', () => {
      const ranges = cutsToSceneRanges([0, 10], 20);
      // No scene before 0, just scenes starting at 0 and 10
      expect(ranges).toEqual([
        { startTime: 0, endTime: 10 },
        { startTime: 10, endTime: 20 },
      ]);
    });

    it('handles cut at video end', () => {
      const ranges = cutsToSceneRanges([10, 30], 30);
      expect(ranges).toEqual([
        { startTime: 0, endTime: 10 },
        { startTime: 10, endTime: 30 },
        // No range after 30 since last cut == duration
      ]);
    });

    it('sorts unsorted input', () => {
      const ranges = cutsToSceneRanges([30, 10, 20], 60);
      expect(ranges[0].startTime).toBe(0);
      expect(ranges[0].endTime).toBe(10);
    });
  });

  describe('computeFrameDiffScore', () => {
    it('returns 0 for identical frames', () => {
      const data = new Uint8ClampedArray([128, 128, 128, 255, 128, 128, 128, 255]);
      expect(computeFrameDiffScore(data, data, 2, 1)).toBe(0);
    });

    it('returns 1 for maximally different frames (black vs white)', () => {
      const black = new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 255]);
      const white = new Uint8ClampedArray([255, 255, 255, 255, 255, 255, 255, 255]);
      expect(computeFrameDiffScore(black, white, 2, 1)).toBe(1);
    });

    it('returns intermediate score for partial difference', () => {
      const a = new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 255]);
      const b = new Uint8ClampedArray([128, 0, 0, 255, 0, 0, 0, 255]);
      const score = computeFrameDiffScore(a, b, 2, 1);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThan(1);
    });

    it('returns 0 for zero dimensions', () => {
      const data = new Uint8ClampedArray([]);
      expect(computeFrameDiffScore(data, data, 0, 0)).toBe(0);
    });
  });

  describe('findNearestMarker', () => {
    const times = [5, 10, 15, 20, 30];

    it('finds next marker after current time', () => {
      expect(findNearestMarker(times, 12, 'next')).toBe(15);
    });

    it('finds previous marker before current time', () => {
      expect(findNearestMarker(times, 12, 'previous')).toBe(10);
    });

    it('returns null when no next marker exists', () => {
      expect(findNearestMarker(times, 30, 'next')).toBeNull();
      expect(findNearestMarker(times, 35, 'next')).toBeNull();
    });

    it('returns null when no previous marker exists', () => {
      expect(findNearestMarker(times, 3, 'previous')).toBeNull();
    });

    it('returns null for empty array', () => {
      expect(findNearestMarker([], 10, 'next')).toBeNull();
      expect(findNearestMarker([], 10, 'previous')).toBeNull();
    });

    it('skips marker at exact current time (next)', () => {
      expect(findNearestMarker(times, 10, 'next')).toBe(15);
    });

    it('skips marker at exact current time (previous)', () => {
      expect(findNearestMarker(times, 10, 'previous')).toBe(5);
    });

    it('handles unsorted input', () => {
      expect(findNearestMarker([30, 5, 20, 10], 12, 'next')).toBe(20);
      expect(findNearestMarker([30, 5, 20, 10], 12, 'previous')).toBe(10);
    });
  });
});
