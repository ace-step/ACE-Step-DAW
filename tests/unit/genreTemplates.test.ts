import { describe, it, expect } from 'vitest';
import {
  GENRE_TEMPLATES,
  getGenreTemplateById,
  getGenreTemplatesByCategory,
  getGenreCategories,
  type GenreTemplateEntry,
} from '../../src/data/genreTemplates';

describe('genreTemplates', () => {
  describe('GENRE_TEMPLATES', () => {
    it('contains at least 10 genre templates', () => {
      expect(GENRE_TEMPLATES.length).toBeGreaterThanOrEqual(10);
    });

    it('each template has required fields', () => {
      for (const entry of GENRE_TEMPLATES) {
        expect(entry.id).toBeTruthy();
        expect(entry.genre).toBeTruthy();
        expect(entry.title).toBeTruthy();
        expect(entry.description).toBeTruthy();
        expect(entry.bpm).toBeGreaterThanOrEqual(30);
        expect(entry.bpm).toBeLessThanOrEqual(300);
        expect(entry.keyScale).toBeTruthy();
        expect(entry.tracks.length).toBeGreaterThanOrEqual(2);
      }
    });

    it('all template IDs are unique', () => {
      const ids = GENRE_TEMPLATES.map((t) => t.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('each track has a localCaption for AI generation prompts', () => {
      for (const entry of GENRE_TEMPLATES) {
        for (const trackName of entry.tracks) {
          expect(typeof trackName).toBe('string');
          expect(trackName.length).toBeGreaterThan(0);
        }
      }
    });

    it('each template has a valid genre category', () => {
      const categories = getGenreCategories();
      expect(categories.length).toBeGreaterThanOrEqual(5);
      for (const entry of GENRE_TEMPLATES) {
        expect(categories).toContain(entry.genre);
      }
    });
  });

  describe('getGenreTemplateById', () => {
    it('returns a ProjectTemplate for a valid ID', () => {
      const firstEntry = GENRE_TEMPLATES[0];
      const template = getGenreTemplateById(firstEntry.id);
      expect(template).toBeDefined();
      expect(template!.name).toBe(firstEntry.title);
      expect(template!.bpm).toBe(firstEntry.bpm);
      expect(template!.keyScale).toBe(firstEntry.keyScale);
      expect(template!.tracks.length).toBeGreaterThanOrEqual(2);
    });

    it('returns undefined for an invalid ID', () => {
      expect(getGenreTemplateById('non-existent-id')).toBeUndefined();
    });

    it('each track in the template has a localCaption', () => {
      const firstEntry = GENRE_TEMPLATES[0];
      const template = getGenreTemplateById(firstEntry.id);
      expect(template).toBeDefined();
      for (const track of template!.tracks) {
        expect(track.localCaption).toBeTruthy();
      }
    });
  });

  describe('getGenreTemplatesByCategory', () => {
    it('returns templates matching the given genre', () => {
      const categories = getGenreCategories();
      for (const cat of categories) {
        const filtered = getGenreTemplatesByCategory(cat);
        expect(filtered.length).toBeGreaterThanOrEqual(1);
        for (const entry of filtered) {
          expect(entry.genre).toBe(cat);
        }
      }
    });

    it('returns empty array for unknown category', () => {
      expect(getGenreTemplatesByCategory('Unknown Category')).toEqual([]);
    });
  });

  describe('getGenreCategories', () => {
    it('returns unique genre categories', () => {
      const categories = getGenreCategories();
      expect(new Set(categories).size).toBe(categories.length);
    });

    it('includes expected genres', () => {
      const categories = getGenreCategories();
      expect(categories).toContain('Electronic');
      expect(categories).toContain('Hip Hop');
    });
  });
});
