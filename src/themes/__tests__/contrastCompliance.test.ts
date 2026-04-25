import { describe, it, expect } from 'vitest';
import { aceStudioTheme } from '../aceStudio';
import { abletonTheme } from '../ableton';
import { logicProTheme } from '../logicPro';
import { flStudioTheme } from '../flStudio';
import { proToolsTheme } from '../proTools';
import type { ThemeTokens } from '../themeTokens';

/**
 * sRGB linearization per WCAG 2.1 specification.
 * Converts a sRGB channel value (0-1) to linear light.
 */
function linearize(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * Calculate relative luminance per WCAG 2.1.
 * @param hex — CSS hex color string (e.g. "#2f3138")
 */
function relativeLuminance(hex: string): number {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/**
 * Calculate WCAG 2.1 contrast ratio between two colors.
 * Returns a value >= 1. WCAG AA requires >= 4.5 for normal text.
 */
function contrastRatio(fg: string, bg: string): number {
  const lFg = relativeLuminance(fg);
  const lBg = relativeLuminance(bg);
  const lighter = Math.max(lFg, lBg);
  const darker = Math.min(lFg, lBg);
  return (lighter + 0.05) / (darker + 0.05);
}

const WCAG_AA_NORMAL_TEXT = 4.5;

const allThemes: { name: string; tokens: ThemeTokens }[] = [
  { name: 'ACE Studio', tokens: aceStudioTheme.tokens },
  { name: 'Ableton', tokens: abletonTheme.tokens },
  { name: 'Logic Pro', tokens: logicProTheme.tokens },
  { name: 'FL Studio', tokens: flStudioTheme.tokens },
  { name: 'Pro Tools', tokens: proToolsTheme.tokens },
];

describe('Theme WCAG AA Contrast Compliance', () => {
  it.each(allThemes)(
    '$name: daw-text-muted meets WCAG AA 4.5:1 against daw-surface-2',
    ({ tokens }) => {
      const ratio = contrastRatio(
        tokens['daw-text-muted'],
        tokens['daw-surface-2'],
      );
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
    },
  );
});
