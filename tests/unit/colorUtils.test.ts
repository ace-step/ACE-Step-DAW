import { describe, expect, it } from 'vitest';
import { hexToRgba, darken } from '../../src/utils/color';

describe('color utilities', () => {
  describe('hexToRgba', () => {
    it('converts a hex color to rgba with given alpha', () => {
      expect(hexToRgba('#ff0000', 1)).toBe('rgba(255, 0, 0, 1)');
      expect(hexToRgba('#00ff00', 0.5)).toBe('rgba(0, 255, 0, 0.5)');
      expect(hexToRgba('#0000ff', 0)).toBe('rgba(0, 0, 255, 0)');
    });

    it('handles mixed channel values', () => {
      expect(hexToRgba('#3b82f6', 0.8)).toBe('rgba(59, 130, 246, 0.8)');
    });
  });

  describe('darken', () => {
    it('reduces each channel by the given amount', () => {
      expect(darken('#ffffff', 10)).toBe('#f5f5f5');
    });

    it('clamps channels to 0 (no negative values)', () => {
      expect(darken('#050505', 10)).toBe('#000000');
    });

    it('darkens a realistic track color', () => {
      // #22c55e (green) darkened by 32 = each channel reduced
      const result = darken('#22c55e', 32);
      const r = parseInt(result.slice(1, 3), 16);
      const g = parseInt(result.slice(3, 5), 16);
      const b = parseInt(result.slice(5, 7), 16);
      expect(r).toBe(Math.max(0, 0x22 - 32));
      expect(g).toBe(Math.max(0, 0xc5 - 32));
      expect(b).toBe(Math.max(0, 0x5e - 32));
    });
  });
});
