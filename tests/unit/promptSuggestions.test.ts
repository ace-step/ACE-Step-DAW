import { describe, expect, it } from 'vitest';
import {
  getPromptSuggestions,
  PROMPT_SUGGESTIONS,
  PROMPT_SUGGESTION_CATEGORIES,
  type PromptSuggestionCategory,
} from '../../src/constants/promptSuggestions';

describe('promptSuggestions', () => {
  describe('PROMPT_SUGGESTIONS vocabulary', () => {
    it('contains entries for all four categories', () => {
      const categoriesPresent = new Set(PROMPT_SUGGESTIONS.map((s) => s.category));
      for (const cat of PROMPT_SUGGESTION_CATEGORIES) {
        expect(categoriesPresent.has(cat)).toBe(true);
      }
    });

    it('has no duplicate text entries', () => {
      const texts = PROMPT_SUGGESTIONS.map((s) => s.text.toLowerCase());
      expect(new Set(texts).size).toBe(texts.length);
    });

    it('has only valid categories', () => {
      const validCats = new Set<string>(PROMPT_SUGGESTION_CATEGORIES);
      for (const s of PROMPT_SUGGESTIONS) {
        expect(validCats.has(s.category)).toBe(true);
      }
    });
  });

  describe('getPromptSuggestions', () => {
    it('returns empty array for empty query', () => {
      expect(getPromptSuggestions('')).toEqual([]);
      expect(getPromptSuggestions('  ')).toEqual([]);
    });

    it('returns prefix matches first', () => {
      const results = getPromptSuggestions('pi');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].text).toBe('piano');
      // "pitch shifting" should also appear as prefix match
      expect(results.some((r) => r.text === 'pitch shifting')).toBe(true);
    });

    it('returns contains matches after prefix matches', () => {
      // "analog" is in "analog warmth" as prefix
      // Should not include things that only start with other letters
      const results = getPromptSuggestions('analog');
      expect(results[0].text).toBe('analog warmth');
    });

    it('is case-insensitive', () => {
      const lower = getPromptSuggestions('jazz');
      const upper = getPromptSuggestions('JAZZ');
      const mixed = getPromptSuggestions('Jazz');
      expect(lower).toEqual(upper);
      expect(lower).toEqual(mixed);
    });

    it('limits results to maxResults', () => {
      const results = getPromptSuggestions('s', 3);
      expect(results.length).toBeLessThanOrEqual(3);
    });

    it('matches "lof" to lo-fi entries', () => {
      const results = getPromptSuggestions('lof');
      expect(results.some((r) => r.text.includes('lo-fi'))).toBe(true);
    });

    it('matches "warm" to warm mood and analog warmth', () => {
      const results = getPromptSuggestions('warm');
      expect(results.some((r) => r.text === 'warm')).toBe(true);
      expect(results.some((r) => r.text === 'analog warmth')).toBe(true);
    });

    it('matches partial instrument names like "sax"', () => {
      const results = getPromptSuggestions('sax');
      expect(results.some((r) => r.text === 'saxophone')).toBe(true);
    });

    it('includes category in each result', () => {
      const results = getPromptSuggestions('piano');
      for (const r of results) {
        expect(typeof r.category).toBe('string');
        expect(PROMPT_SUGGESTION_CATEGORIES).toContain(r.category);
      }
    });
  });
});
