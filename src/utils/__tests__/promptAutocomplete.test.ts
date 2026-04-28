import { describe, it, expect } from 'vitest';
import {
  getPromptAutocompleteToken,
  getPromptAutocompleteSuggestions,
  applyPromptAutocompleteSuggestion,
} from '../promptAutocomplete';

describe('getPromptAutocompleteToken', () => {
  it('returns null for empty prompt', () => {
    expect(getPromptAutocompleteToken('')).toBeNull();
  });

  it('extracts single-word token', () => {
    const result = getPromptAutocompleteToken('synth');
    expect(result).toEqual({ token: 'synth', start: 0, end: 5 });
  });

  it('extracts token at caret position', () => {
    const result = getPromptAutocompleteToken('warm jazz piano', 9);
    // caret at index 9 is in "jazz"
    expect(result?.token).toBe('jazz');
  });

  it('extracts last token when caret is at end', () => {
    const result = getPromptAutocompleteToken('warm jazz');
    expect(result?.token).toBe('jazz');
  });

  it('returns null when caret is at a delimiter', () => {
    const result = getPromptAutocompleteToken('warm jazz ', 10);
    expect(result).toBeNull();
  });

  it('handles caret beyond prompt length', () => {
    const result = getPromptAutocompleteToken('test', 100);
    expect(result?.token).toBe('test');
  });
});

describe('getPromptAutocompleteSuggestions', () => {
  it('returns empty array for empty prompt', () => {
    expect(getPromptAutocompleteSuggestions('')).toEqual([]);
  });

  it('returns matching suggestions for prefix', () => {
    const results = getPromptAutocompleteSuggestions('syn');
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((s) => s.value === 'synthwave')).toBe(true);
  });

  it('returns suggestions sorted by score', () => {
    const results = getPromptAutocompleteSuggestions('pi');
    expect(results.length).toBeGreaterThan(0);
    // Scores should be descending
    for (let i = 1; i < results.length; i++) {
      expect(results[i].score).toBeLessThanOrEqual(results[i - 1].score);
    }
  });

  it('matches aliases', () => {
    const results = getPromptAutocompleteSuggestions('lofi');
    expect(results.some((s) => s.value === 'lo-fi')).toBe(true);
  });

  it('respects the limit parameter', () => {
    const results = getPromptAutocompleteSuggestions('a', undefined, 3);
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it('returns suggestions with correct category', () => {
    const results = getPromptAutocompleteSuggestions('jazz');
    const jazz = results.find((s) => s.value === 'jazz');
    expect(jazz?.category).toBe('genre');
  });

  it('performs fuzzy matching', () => {
    const results = getPromptAutocompleteSuggestions('drm');
    // Should fuzzy-match "drum machine" (d-r-m all appear in order)
    expect(results.some((s) => s.value === 'drum machine')).toBe(true);
  });
});

describe('applyPromptAutocompleteSuggestion', () => {
  it('replaces the current token with suggestion', () => {
    const result = applyPromptAutocompleteSuggestion('syn', 'synthwave');
    expect(result?.prompt).toBe('synthwave ');
    expect(result?.caretIndex).toBe(10); // after "synthwave "
  });

  it('preserves text before the token', () => {
    const result = applyPromptAutocompleteSuggestion('warm syn', 'synthwave', 8);
    expect(result?.prompt).toBe('warm synthwave ');
  });

  it('preserves text after the token', () => {
    const result = applyPromptAutocompleteSuggestion('warm syn piano', 'synthwave', 8);
    expect(result?.prompt).toBe('warm synthwave piano');
  });

  it('returns null for empty token', () => {
    const result = applyPromptAutocompleteSuggestion('test ', 'synthwave', 5);
    expect(result).toBeNull();
  });

  it('adds trailing space when at end of prompt', () => {
    const result = applyPromptAutocompleteSuggestion('pia', 'piano');
    expect(result?.prompt.endsWith(' ')).toBe(true);
  });

  it('does not add trailing space when followed by delimiter', () => {
    const result = applyPromptAutocompleteSuggestion('pia, test', 'piano', 3);
    expect(result?.prompt).toBe('piano, test');
  });
});
