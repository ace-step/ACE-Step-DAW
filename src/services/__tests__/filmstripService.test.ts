import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getFilmstripInterval,
  calculateFrameCount,
  calculateFrameTimestamps,
  calculateThumbnailDimensions,
  FILMSTRIP_THUMB_WIDTH,
  FILMSTRIP_THUMB_HEIGHT,
  FILMSTRIP_DENSITY_TIERS,
  saveFilmstripCache,
  loadFilmstripCache,
  deleteFilmstripCache,
} from '../filmstripService';

// Mock idb-keyval
const mockStore = new Map<string, any>();
vi.mock('idb-keyval', () => ({
  get: vi.fn((key: string) => Promise.resolve(mockStore.get(key))),
  set: vi.fn((key: string, value: any) => { mockStore.set(key, value); return Promise.resolve(); }),
  del: vi.fn((key: string) => { mockStore.delete(key); return Promise.resolve(); }),
  keys: vi.fn(() => Promise.resolve([...mockStore.keys()])),
}));

describe('filmstripService', () => {
  describe('getFilmstripInterval', () => {
    it('returns 0.5s for high zoom (>100 px/s)', () => {
      expect(getFilmstripInterval(150)).toBe(0.5);
      expect(getFilmstripInterval(100)).toBe(0.5);
    });

    it('returns 2s for medium zoom (20–100 px/s)', () => {
      expect(getFilmstripInterval(50)).toBe(2);
      expect(getFilmstripInterval(20)).toBe(2);
    });

    it('returns 10s for low zoom (<20 px/s)', () => {
      expect(getFilmstripInterval(10)).toBe(10);
      expect(getFilmstripInterval(1)).toBe(10);
      expect(getFilmstripInterval(0)).toBe(10);
    });

    it('tiers are sorted from highest to lowest threshold', () => {
      for (let i = 1; i < FILMSTRIP_DENSITY_TIERS.length; i++) {
        expect(FILMSTRIP_DENSITY_TIERS[i - 1].minPixelsPerSecond)
          .toBeGreaterThan(FILMSTRIP_DENSITY_TIERS[i].minPixelsPerSecond);
      }
    });
  });

  describe('calculateFrameCount', () => {
    it('calculates correct frame count for 5 min at 2s intervals', () => {
      expect(calculateFrameCount(300, 2)).toBe(150);
    });

    it('calculates correct frame count for 5 min at 10s intervals', () => {
      expect(calculateFrameCount(300, 10)).toBe(30);
    });

    it('calculates correct frame count for 5 min at 0.5s intervals', () => {
      expect(calculateFrameCount(300, 0.5)).toBe(600);
    });

    it('returns 0 for zero duration', () => {
      expect(calculateFrameCount(0, 2)).toBe(0);
    });

    it('returns 0 for negative duration', () => {
      expect(calculateFrameCount(-5, 2)).toBe(0);
    });

    it('returns 0 for zero interval', () => {
      expect(calculateFrameCount(60, 0)).toBe(0);
    });

    it('rounds up for non-exact divisions', () => {
      // 7 seconds / 3 second interval = 2.33 → 3 frames
      expect(calculateFrameCount(7, 3)).toBe(3);
    });
  });

  describe('calculateFrameTimestamps', () => {
    it('generates correct timestamps for 10s at 2s intervals', () => {
      const timestamps = calculateFrameTimestamps(10, 2);
      expect(timestamps).toEqual([0, 2, 4, 6, 8]);
    });

    it('generates correct timestamps for 5s at 1s intervals', () => {
      const timestamps = calculateFrameTimestamps(5, 1);
      expect(timestamps).toEqual([0, 1, 2, 3, 4]);
    });

    it('returns empty array for zero duration', () => {
      expect(calculateFrameTimestamps(0, 2)).toEqual([]);
    });

    it('starts at 0', () => {
      const timestamps = calculateFrameTimestamps(30, 10);
      expect(timestamps[0]).toBe(0);
    });
  });

  describe('calculateThumbnailDimensions', () => {
    it('returns standard 160x90 for 16:9 source', () => {
      const dims = calculateThumbnailDimensions(1920, 1080);
      expect(dims.width).toBe(FILMSTRIP_THUMB_WIDTH);
      expect(dims.height).toBe(FILMSTRIP_THUMB_HEIGHT);
    });

    it('scales down wider-than-16:9 sources (e.g., ultrawide)', () => {
      const dims = calculateThumbnailDimensions(2560, 1080);
      expect(dims.width).toBe(FILMSTRIP_THUMB_WIDTH);
      expect(dims.height).toBeLessThan(FILMSTRIP_THUMB_HEIGHT);
    });

    it('scales down taller-than-16:9 sources (e.g., 4:3)', () => {
      const dims = calculateThumbnailDimensions(1024, 768);
      expect(dims.width).toBeLessThan(FILMSTRIP_THUMB_WIDTH);
      expect(dims.height).toBe(FILMSTRIP_THUMB_HEIGHT);
    });

    it('handles square source', () => {
      const dims = calculateThumbnailDimensions(500, 500);
      expect(dims.height).toBe(FILMSTRIP_THUMB_HEIGHT);
      expect(dims.width).toBe(FILMSTRIP_THUMB_HEIGHT); // square
    });

    it('returns defaults for zero dimensions', () => {
      const dims = calculateThumbnailDimensions(0, 0);
      expect(dims.width).toBe(FILMSTRIP_THUMB_WIDTH);
      expect(dims.height).toBe(FILMSTRIP_THUMB_HEIGHT);
    });

    it('preserves aspect ratio', () => {
      const dims = calculateThumbnailDimensions(1920, 1080);
      const sourceAspect = 1920 / 1080;
      const thumbAspect = dims.width / dims.height;
      expect(Math.abs(sourceAspect - thumbAspect)).toBeLessThan(0.01);
    });
  });

  describe('filmstrip cache (IndexedDB)', () => {
    beforeEach(() => {
      mockStore.clear();
    });

    it('saves and loads filmstrip cache', async () => {
      const filmstrip = {
        thumbnails: [new Blob(['thumb1']), new Blob(['thumb2'])],
        intervalSeconds: 2,
        frameCount: 2,
        generatedAt: Date.now(),
      };

      const key = await saveFilmstripCache('proj-1', 'clip-1', filmstrip);
      expect(key).toBe('filmstrip:proj-1:clip-1:2s');

      const loaded = await loadFilmstripCache('proj-1', 'clip-1', 2);
      expect(loaded).toBeDefined();
      expect(loaded!.frameCount).toBe(2);
      expect(loaded!.intervalSeconds).toBe(2);
      expect(loaded!.thumbnails).toHaveLength(2);
    });

    it('returns undefined for missing cache', async () => {
      const loaded = await loadFilmstripCache('nope', 'nope', 2);
      expect(loaded).toBeUndefined();
    });

    it('deletes cached filmstrip', async () => {
      const filmstrip = {
        thumbnails: [],
        intervalSeconds: 10,
        frameCount: 0,
        generatedAt: Date.now(),
      };
      await saveFilmstripCache('p', 'c', filmstrip);
      await deleteFilmstripCache('p', 'c', 10);
      const loaded = await loadFilmstripCache('p', 'c', 10);
      expect(loaded).toBeUndefined();
    });

    it('different intervals produce different cache keys', async () => {
      const filmstrip2s = { thumbnails: [], intervalSeconds: 2, frameCount: 5, generatedAt: 0 };
      const filmstrip10s = { thumbnails: [], intervalSeconds: 10, frameCount: 1, generatedAt: 0 };

      await saveFilmstripCache('p', 'c', filmstrip2s);
      await saveFilmstripCache('p', 'c', filmstrip10s);

      expect(mockStore.size).toBe(2);
      const loaded2 = await loadFilmstripCache('p', 'c', 2);
      const loaded10 = await loadFilmstripCache('p', 'c', 10);
      expect(loaded2!.frameCount).toBe(5);
      expect(loaded10!.frameCount).toBe(1);
    });
  });
});
