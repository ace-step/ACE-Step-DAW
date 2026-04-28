import { describe, it, expect } from 'vitest';
import {
  snapToFrame,
  formatTimecode,
  computeLeftTrim,
  computeRightTrim,
  computeVideoSplit,
} from '../videoUtils';

describe('videoUtils', () => {
  describe('snapToFrame', () => {
    it('snaps to nearest frame at 30fps', () => {
      const result = snapToFrame(1.05, 30);
      // 1.05 / (1/30) = 31.5 → round to 32 → 32/30 = 1.0667
      expect(result).toBeCloseTo(32 / 30, 5);
    });

    it('returns exact value when already on frame boundary', () => {
      expect(snapToFrame(1.0, 30)).toBeCloseTo(1.0, 5);
    });

    it('snaps at 24fps', () => {
      const result = snapToFrame(2.51, 24);
      // 2.51 * 24 = 60.24 → round to 60 → 60/24 = 2.5
      expect(result).toBeCloseTo(2.5, 5);
    });

    it('returns input when frameRate is 0', () => {
      expect(snapToFrame(1.5, 0)).toBe(1.5);
    });

    it('handles time 0', () => {
      expect(snapToFrame(0, 30)).toBe(0);
    });
  });

  describe('formatTimecode', () => {
    it('formats 0 seconds', () => {
      expect(formatTimecode(0, 30)).toBe('00:00:00:00');
    });

    it('formats exactly 1 second', () => {
      expect(formatTimecode(1, 30)).toBe('00:00:01:00');
    });

    it('formats with frames', () => {
      // 1.5s at 30fps = 45 frames → 1s + 15 frames
      expect(formatTimecode(1.5, 30)).toBe('00:00:01:15');
    });

    it('formats minutes', () => {
      expect(formatTimecode(90, 24)).toBe('00:01:30:00');
    });

    it('formats hours', () => {
      expect(formatTimecode(3661, 30)).toBe('01:01:01:00');
    });

    it('handles 24fps', () => {
      // 1.5s at 24fps = 36 frames → 1s + 12 frames
      expect(formatTimecode(1.5, 24)).toBe('00:00:01:12');
    });

    it('returns 00:00:00:00 for frameRate 0', () => {
      expect(formatTimecode(10, 0)).toBe('00:00:00:00');
    });

    it('returns 00:00:00:00 for negative frameRate', () => {
      expect(formatTimecode(10, -1)).toBe('00:00:00:00');
    });

    it('returns 00:00:00:00 for NaN frameRate', () => {
      expect(formatTimecode(10, NaN)).toBe('00:00:00:00');
    });

    it('uses integer fps consistently for 29.97', () => {
      // 29.97 rounds to 30; 1.5s * 30 = 45 frames → 1s + 15 frames
      expect(formatTimecode(1.5, 29.97)).toBe('00:00:01:15');
    });
  });

  describe('computeLeftTrim', () => {
    it('trims left edge correctly', () => {
      const result = computeLeftTrim(10, 20, 0, 15, 30);
      expect(result).not.toBeNull();
      expect(result!.startTime).toBeCloseTo(15, 1);
      expect(result!.duration).toBeCloseTo(15, 1);
      expect(result!.sourceOffset).toBeCloseTo(5, 1);
    });

    it('snaps to frame boundary', () => {
      const result = computeLeftTrim(10, 20, 0, 10.02, 30);
      expect(result).not.toBeNull();
      // 0.02 / (1/30) = 0.6 → round to 1 → 1/30 ≈ 0.0333
      // New start = 10 + 0.0333
      expect(result!.startTime).toBeCloseTo(10 + 1 / 30, 4);
    });

    it('returns null when trimming past right edge', () => {
      const result = computeLeftTrim(10, 5, 0, 15.1, 30);
      expect(result).toBeNull();
    });

    it('returns null when sourceOffset would go negative', () => {
      // sourceOffset is already at 0, trimming left would push it negative
      const result = computeLeftTrim(10, 20, 0, 5, 30);
      // Delta = 5 - 10 = -5 → sourceOffset = 0 + (-5) = -5 → null
      expect(result).toBeNull();
    });

    it('adjusts sourceOffset proportionally', () => {
      const result = computeLeftTrim(10, 20, 5, 13, 30);
      expect(result).not.toBeNull();
      expect(result!.sourceOffset).toBeCloseTo(8, 1); // 5 + 3
    });
  });

  describe('computeRightTrim', () => {
    it('trims right edge correctly', () => {
      const result = computeRightTrim(10, 0, 25, 30, 120);
      expect(result).not.toBeNull();
      expect(result!.duration).toBeCloseTo(15, 1);
    });

    it('returns null when trimming before start', () => {
      const result = computeRightTrim(10, 0, 10.01, 30, 120);
      expect(result).toBeNull();
    });

    it('clamps to source file end', () => {
      // Source is 120s, offset is 100 → max clip duration is 20s
      // Clip starts at 10, so max end is 10 + 20 = 30
      const result = computeRightTrim(10, 100, 50, 30, 120);
      expect(result).not.toBeNull();
      // fileDuration - sourceOffset = 120 - 100 = 20
      expect(result!.duration).toBeCloseTo(20, 1);
    });
  });

  describe('computeVideoSplit', () => {
    it('splits a clip at a given time', () => {
      const result = computeVideoSplit(10, 20, 0, 20, 30);
      expect(result).not.toBeNull();
      expect(result!.left.duration).toBeCloseTo(10, 1);
      expect(result!.right.startTime).toBeCloseTo(20, 1);
      expect(result!.right.duration).toBeCloseTo(10, 1);
      expect(result!.right.sourceOffset).toBeCloseTo(10, 1);
    });

    it('preserves sourceOffset in right clip', () => {
      const result = computeVideoSplit(10, 20, 5, 20, 30);
      expect(result).not.toBeNull();
      expect(result!.right.sourceOffset).toBeCloseTo(15, 1); // 5 + 10
    });

    it('returns null when split is at clip start', () => {
      expect(computeVideoSplit(10, 20, 0, 10, 30)).toBeNull();
    });

    it('returns null when split is at clip end', () => {
      expect(computeVideoSplit(10, 20, 0, 30, 30)).toBeNull();
    });

    it('returns null when split is outside clip', () => {
      expect(computeVideoSplit(10, 20, 0, 5, 30)).toBeNull();
      expect(computeVideoSplit(10, 20, 0, 35, 30)).toBeNull();
    });

    it('snaps split point to frame boundary', () => {
      const result = computeVideoSplit(10, 20, 0, 20.02, 30);
      expect(result).not.toBeNull();
      // Snaps to nearest frame at 30fps
      expect(result!.right.startTime).toBeCloseTo(snapToFrame(20.02, 30), 4);
    });
  });
});
