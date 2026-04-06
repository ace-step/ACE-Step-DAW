import { describe, it, expect } from 'vitest';
import {
  NEGATIVE_PROMPT_SUGGESTIONS,
  toggleNegativePromptChip,
  isChipActive,
} from '../negativePromptChips';

describe('negativePromptChips', () => {
  describe('NEGATIVE_PROMPT_SUGGESTIONS', () => {
    it('contains at least 5 common exclusions', () => {
      expect(NEGATIVE_PROMPT_SUGGESTIONS.length).toBeGreaterThanOrEqual(5);
    });

    it('each suggestion is a non-empty trimmed string', () => {
      for (const chip of NEGATIVE_PROMPT_SUGGESTIONS) {
        expect(chip.length).toBeGreaterThan(0);
        expect(chip).toBe(chip.trim());
      }
    });
  });

  describe('isChipActive', () => {
    it('returns true when chip is present as an exact comma-separated token', () => {
      expect(isChipActive('no autotune, no reverb', 'no autotune')).toBe(true);
      expect(isChipActive('no autotune, no reverb', 'no reverb')).toBe(true);
    });

    it('returns false for partial/substring matches', () => {
      expect(isChipActive('no reverberation', 'no reverb')).toBe(false);
      expect(isChipActive('no autotune effects', 'no autotune')).toBe(false);
    });

    it('is case-insensitive', () => {
      expect(isChipActive('No Autotune, no reverb', 'no autotune')).toBe(true);
      expect(isChipActive('no autotune', 'No Autotune')).toBe(true);
    });

    it('returns false for empty text', () => {
      expect(isChipActive('', 'no reverb')).toBe(false);
    });

    it('handles whitespace around tokens', () => {
      expect(isChipActive('no autotune , no reverb', 'no reverb')).toBe(true);
      expect(isChipActive(' no autotune ', 'no autotune')).toBe(true);
    });
  });

  describe('toggleNegativePromptChip', () => {
    it('adds chip to empty text', () => {
      expect(toggleNegativePromptChip('', 'no autotune')).toBe('no autotune');
    });

    it('appends chip to existing text with comma', () => {
      expect(toggleNegativePromptChip('no reverb', 'no autotune')).toBe('no reverb, no autotune');
    });

    it('removes chip when already present', () => {
      expect(toggleNegativePromptChip('no autotune, no reverb', 'no autotune')).toBe('no reverb');
    });

    it('removes chip case-insensitively', () => {
      expect(toggleNegativePromptChip('No Autotune, no reverb', 'no autotune')).toBe('no reverb');
    });

    it('does not corrupt other tokens when removing', () => {
      const result = toggleNegativePromptChip('no autotune, no reverberation, no distortion', 'no autotune');
      expect(result).toBe('no reverberation, no distortion');
    });

    it('handles removing the only chip', () => {
      expect(toggleNegativePromptChip('no autotune', 'no autotune')).toBe('');
    });

    it('handles removing middle chip', () => {
      const result = toggleNegativePromptChip('no autotune, no reverb, no distortion', 'no reverb');
      expect(result).toBe('no autotune, no distortion');
    });
  });
});
