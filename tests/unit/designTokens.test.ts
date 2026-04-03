import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const indexCss = readFileSync(resolve(__dirname, '../../src/index.css'), 'utf-8');

describe('Design System Tokens (index.css)', () => {
  describe('Type Scale', () => {
    const typeTokens = [
      ['--daw-text-xs', '10px'],
      ['--daw-text-sm', '11px'],
      ['--daw-text-base', '12px'],
      ['--daw-text-lg', '13px'],
      ['--daw-text-xl', '16px'],
      ['--daw-text-2xl', '20px'],
      ['--daw-text-display', '28px'],
    ];

    it.each(typeTokens)('defines %s as %s', (token, value) => {
      expect(indexCss).toContain(`${token}: ${value}`);
    });
  });

  describe('Font Weights', () => {
    const weightTokens = [
      ['--font-normal', '400'],
      ['--font-medium', '500'],
      ['--font-semibold', '600'],
    ];

    it.each(weightTokens)('defines %s as %s', (token, value) => {
      expect(indexCss).toContain(`${token}: ${value}`);
    });
  });

  describe('Spacing Scale (4px grid)', () => {
    const spacingTokens = [
      ['--space-0', '0px'],
      ['--space-0-5', '2px'],
      ['--space-1', '4px'],
      ['--space-1-5', '6px'],
      ['--space-2', '8px'],
      ['--space-3', '12px'],
      ['--space-4', '16px'],
      ['--space-5', '20px'],
      ['--space-6', '24px'],
      ['--space-8', '32px'],
      ['--space-10', '40px'],
      ['--space-12', '48px'],
    ];

    it.each(spacingTokens)('defines %s as %s', (token, value) => {
      expect(indexCss).toContain(`${token}: ${value}`);
    });

    it('all spacing values follow 4px grid (except 0-5 and 1-5)', () => {
      const exceptions = ['--space-0', '--space-0-5', '--space-1-5'];
      for (const [token, value] of spacingTokens) {
        if (exceptions.includes(token)) continue;
        const px = parseInt(value);
        expect(px % 4, `${token} (${value}) should be divisible by 4`).toBe(0);
      }
    });
  });

  describe('Animation Tokens', () => {
    const durationTokens = [
      ['--duration-fast', '100ms'],
      ['--duration-normal', '200ms'],
      ['--duration-slow', '350ms'],
    ];

    it.each(durationTokens)('defines %s as %s', (token, value) => {
      expect(indexCss).toContain(`${token}: ${value}`);
    });

    const easingTokens = [
      ['--ease-out', 'cubic-bezier(0.16, 1, 0.3, 1)'],
      ['--ease-in-out', 'cubic-bezier(0.65, 0, 0.35, 1)'],
      ['--ease-spring', 'cubic-bezier(0.34, 1.56, 0.64, 1)'],
    ];

    it.each(easingTokens)('defines %s easing curve', (token, value) => {
      expect(indexCss).toContain(`${token}: ${value}`);
    });
  });

  describe('Reduced Motion', () => {
    it('includes prefers-reduced-motion media query', () => {
      expect(indexCss).toContain('@media (prefers-reduced-motion: reduce)');
    });

    it('disables animation-duration in reduced motion', () => {
      expect(indexCss).toContain('animation-duration: 0.01ms !important');
    });

    it('disables transition-duration in reduced motion', () => {
      expect(indexCss).toContain('transition-duration: 0.01ms !important');
    });
  });

  describe('Tabular Nums', () => {
    it('defines .daw-numeric utility class', () => {
      expect(indexCss).toContain('.daw-numeric');
      expect(indexCss).toContain('font-variant-numeric: tabular-nums');
    });
  });

  describe('All tokens are within @theme block', () => {
    it('type scale tokens are in @theme', () => {
      const themeBlock = indexCss.match(/@theme\s*\{[\s\S]*?\n\}/)?.[0] ?? '';
      expect(themeBlock).toContain('--daw-text-xs');
      expect(themeBlock).toContain('--daw-text-display');
    });

    it('does not define un-namespaced --text-* tokens in @theme (avoid Tailwind v4 conflict)', () => {
      const themeBlock = indexCss.match(/@theme\s*\{[\s\S]*?\n\}/)?.[0] ?? '';
      expect(themeBlock).not.toMatch(/--text-[a-z0-9-]+\s*:/);
    });

    it('spacing tokens are in @theme', () => {
      const themeBlock = indexCss.match(/@theme\s*\{[\s\S]*?\n\}/)?.[0] ?? '';
      expect(themeBlock).toContain('--space-1');
      expect(themeBlock).toContain('--space-12');
    });

    it('animation tokens are in @theme', () => {
      const themeBlock = indexCss.match(/@theme\s*\{[\s\S]*?\n\}/)?.[0] ?? '';
      expect(themeBlock).toContain('--duration-fast');
      expect(themeBlock).toContain('--ease-out');
    });
  });
});
