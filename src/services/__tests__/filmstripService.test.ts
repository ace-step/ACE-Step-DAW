import { describe, it, expect } from 'vitest';
import {
  computeThumbnailInterval,
  computeThumbnailCount,
  FILMSTRIP_THUMBNAIL_WIDTH,
  FILMSTRIP_THUMBNAIL_HEIGHT,
  type FilmstripConfig,
  buildFilmstripConfig,
} from '../filmstripService';

describe('filmstripService', () => {
  describe('FILMSTRIP dimensions', () => {
    it('thumbnail size is 160x90', () => {
      expect(FILMSTRIP_THUMBNAIL_WIDTH).toBe(160);
      expect(FILMSTRIP_THUMBNAIL_HEIGHT).toBe(90);
    });
  });

  describe('computeThumbnailInterval', () => {
    it('returns 10s interval at low zoom (<20px/s)', () => {
      expect(computeThumbnailInterval(10)).toBe(10);
      expect(computeThumbnailInterval(15)).toBe(10);
    });

    it('returns 2s interval at medium zoom (20-100px/s)', () => {
      expect(computeThumbnailInterval(20)).toBe(2);
      expect(computeThumbnailInterval(50)).toBe(2);
      expect(computeThumbnailInterval(100)).toBe(2);
    });

    it('returns 0.5s interval at high zoom (>100px/s)', () => {
      expect(computeThumbnailInterval(150)).toBe(0.5);
      expect(computeThumbnailInterval(500)).toBe(0.5);
    });
  });

  describe('computeThumbnailCount', () => {
    it('calculates correct count for 5-minute video at 2s interval', () => {
      expect(computeThumbnailCount(300, 2)).toBe(150);
    });

    it('calculates correct count for 30s video at 0.5s interval', () => {
      expect(computeThumbnailCount(30, 0.5)).toBe(60);
    });

    it('returns at least 1 thumbnail', () => {
      expect(computeThumbnailCount(0.1, 10)).toBe(1);
    });
  });

  describe('buildFilmstripConfig', () => {
    it('builds config for a typical video at medium zoom', () => {
      const config = buildFilmstripConfig({
        videoDuration: 120,
        pixelsPerSecond: 50,
        sourceWidth: 1920,
        sourceHeight: 1080,
      });

      expect(config.intervalSeconds).toBe(2);
      expect(config.thumbnailWidth).toBe(160);
      expect(config.thumbnailHeight).toBe(90);
      expect(config.totalThumbnails).toBe(60);
    });

    it('adjusts aspect ratio for non-16:9 source', () => {
      const config = buildFilmstripConfig({
        videoDuration: 60,
        pixelsPerSecond: 50,
        sourceWidth: 1080,
        sourceHeight: 1920,
      });

      // 9:16 portrait video should maintain aspect ratio
      expect(config.thumbnailWidth).toBe(160);
      // Height should be taller than 90 for portrait video
      expect(config.thumbnailHeight).toBeGreaterThan(90);
    });

    it('falls back to default 16:9 height when source dimensions are zero', () => {
      const config = buildFilmstripConfig({
        videoDuration: 60,
        pixelsPerSecond: 50,
        sourceWidth: 0,
        sourceHeight: 0,
      });

      expect(config.thumbnailWidth).toBe(160);
      expect(config.thumbnailHeight).toBe(90); // default FILMSTRIP_THUMBNAIL_HEIGHT
    });

    it('falls back to default height for NaN dimensions', () => {
      const config = buildFilmstripConfig({
        videoDuration: 60,
        pixelsPerSecond: 50,
        sourceWidth: NaN,
        sourceHeight: NaN,
      });

      expect(config.thumbnailHeight).toBe(90);
    });

    it('handles very short videos', () => {
      const config = buildFilmstripConfig({
        videoDuration: 1,
        pixelsPerSecond: 50,
        sourceWidth: 1920,
        sourceHeight: 1080,
      });

      expect(config.totalThumbnails).toBeGreaterThanOrEqual(1);
    });
  });
});
