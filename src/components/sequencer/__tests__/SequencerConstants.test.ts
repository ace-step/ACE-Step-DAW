import { describe, it, expect } from 'vitest';
import { FL, ROW_SIZES, ROW_LABEL_W, GRAPH_H, ROW_COLORS } from '../SequencerConstants';

describe('SequencerConstants', () => {
  describe('FL theme colors', () => {
    it('defines all required color tokens', () => {
      expect(FL.bg).toBeDefined();
      expect(FL.headerBg).toBeDefined();
      expect(FL.accent).toBeDefined();
      expect(FL.accentBright).toBeDefined();
      expect(FL.text).toBeDefined();
      expect(FL.textDim).toBeDefined();
      expect(FL.textBright).toBeDefined();
      expect(FL.border).toBeDefined();
    });

    it('uses valid hex color format', () => {
      const hexPattern = /^#[0-9a-fA-F]{6}$/;
      for (const [key, value] of Object.entries(FL)) {
        expect(value, `FL.${key}`).toMatch(hexPattern);
      }
    });
  });

  describe('ROW_SIZES', () => {
    it('defines compact, normal, and expanded sizes', () => {
      expect(ROW_SIZES.compact).toBeDefined();
      expect(ROW_SIZES.normal).toBeDefined();
      expect(ROW_SIZES.expanded).toBeDefined();
    });

    it('compact is smallest, expanded is largest', () => {
      expect(ROW_SIZES.compact.stepH).toBeLessThan(ROW_SIZES.normal.stepH);
      expect(ROW_SIZES.normal.stepH).toBeLessThan(ROW_SIZES.expanded.stepH);
      expect(ROW_SIZES.compact.stepW).toBeLessThan(ROW_SIZES.normal.stepW);
      expect(ROW_SIZES.normal.stepW).toBeLessThan(ROW_SIZES.expanded.stepW);
    });

    it('all sizes have positive dimensions', () => {
      for (const size of Object.values(ROW_SIZES)) {
        expect(size.stepH).toBeGreaterThan(0);
        expect(size.stepW).toBeGreaterThan(0);
      }
    });
  });

  describe('layout constants', () => {
    it('ROW_LABEL_W is a reasonable width', () => {
      expect(ROW_LABEL_W).toBeGreaterThanOrEqual(100);
      expect(ROW_LABEL_W).toBeLessThanOrEqual(300);
    });

    it('GRAPH_H is a reasonable height', () => {
      expect(GRAPH_H).toBeGreaterThanOrEqual(40);
      expect(GRAPH_H).toBeLessThanOrEqual(200);
    });
  });

  describe('ROW_COLORS', () => {
    it('has at least 10 colors', () => {
      expect(ROW_COLORS.length).toBeGreaterThanOrEqual(10);
    });

    it('all colors are valid hex format', () => {
      for (const color of ROW_COLORS) {
        expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    });

    it('has no duplicate colors', () => {
      const unique = new Set(ROW_COLORS);
      expect(unique.size).toBe(ROW_COLORS.length);
    });
  });
});
