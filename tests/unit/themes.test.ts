import { describe, it, expect } from 'vitest';
import { THEMES, THEME_LIST } from '../../src/themes';
import type { ThemeTokens } from '../../src/themes';
import { aceStudioTheme } from '../../src/themes/aceStudio';

const EXPECTED_TOKEN_KEYS: (keyof ThemeTokens)[] = [
  'daw-bg', 'daw-surface', 'daw-surface-2', 'daw-surface-3',
  'daw-border', 'daw-border-strong',
  'daw-hover', 'daw-hover-subtle',
  'daw-text-muted',
  'daw-accent', 'daw-accent-hover', 'daw-playhead',
  'daw-arrangement-header-bg', 'daw-arrangement-group-bg',
  'daw-arrangement-empty-lane-bg', 'daw-arrangement-separator',
  'daw-grid-bar', 'daw-grid-beat', 'daw-grid-eighth', 'daw-grid-sub',
  'daw-track-selected',
  'daw-region-audio', 'daw-region-midi', 'daw-region-drummer', 'daw-region-sample',
  'daw-scrollbar', 'daw-scrollbar-hover',
  'daw-slider-thumb', 'daw-slider-thumb-hover',
  'daw-focus-ring',
];

describe('Theme definitions', () => {
  it('exports 5 themes', () => {
    expect(Object.keys(THEMES)).toHaveLength(5);
    expect(THEME_LIST).toHaveLength(5);
  });

  it('includes all expected theme IDs', () => {
    expect(Object.keys(THEMES).sort()).toEqual([
      'ableton', 'ace-studio', 'fl-studio', 'logic-pro', 'pro-tools',
    ]);
  });

  for (const [id, theme] of Object.entries(THEMES)) {
    describe(`${id} theme`, () => {
      it('has all required token keys', () => {
        for (const key of EXPECTED_TOKEN_KEYS) {
          expect(theme.tokens).toHaveProperty(key);
        }
      });

      it('has no extra token keys', () => {
        const tokenKeys = Object.keys(theme.tokens).sort();
        expect(tokenKeys).toEqual([...EXPECTED_TOKEN_KEYS].sort());
      });

      it('has valid color values for all tokens', () => {
        for (const [key, value] of Object.entries(theme.tokens)) {
          expect(
            value,
            `${id}.${key} should be a valid CSS color`,
          ).toMatch(/^(#[0-9a-fA-F]{6}|rgba?\(.+\))$/);
        }
      });

      it('has a non-empty name and description', () => {
        expect(theme.name.length).toBeGreaterThan(0);
        expect(theme.description.length).toBeGreaterThan(0);
      });

      it('has matching id', () => {
        expect(theme.id).toBe(id);
      });
    });
  }

  it('ACE Studio theme matches index.css defaults', () => {
    expect(aceStudioTheme.tokens['daw-bg']).toBe('#191b1f');
    expect(aceStudioTheme.tokens['daw-accent']).toBe('#4a90d9');
    expect(aceStudioTheme.tokens['daw-playhead']).toBe('#5e59ff');
  });
});
