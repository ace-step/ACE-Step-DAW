import { describe, it, expect } from 'vitest';
import { hexToRgba, darken } from '../color';

describe('color utilities', () => {
  describe('hexToRgba', () => {
    it('converts white hex to rgba', () => {
      expect(hexToRgba('#ffffff', 1)).toBe('rgba(255, 255, 255, 1)');
    });

    it('converts black hex to rgba', () => {
      expect(hexToRgba('#000000', 0.5)).toBe('rgba(0, 0, 0, 0.5)');
    });

    it('converts arbitrary color with alpha', () => {
      expect(hexToRgba('#3b82f6', 0.8)).toBe('rgba(59, 130, 246, 0.8)');
    });

    it('handles zero alpha', () => {
      expect(hexToRgba('#ff0000', 0)).toBe('rgba(255, 0, 0, 0)');
    });
  });

  describe('darken', () => {
    it('darkens white by 50', () => {
      const result = darken('#ffffff', 50);
      expect(result).toBe('#cdcdcd');
    });

    it('clamps to black when amount exceeds channel value', () => {
      const result = darken('#1a1a1a', 100);
      expect(result).toBe('#000000');
    });

    it('returns same color when amount is 0', () => {
      expect(darken('#3b82f6', 0)).toBe('#3b82f6');
    });

    it('darkens each channel independently', () => {
      const result = darken('#ff8040', 32);
      expect(result).toBe('#df6020');
    });
  });
});
