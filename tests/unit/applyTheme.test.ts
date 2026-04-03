import { describe, it, expect, beforeEach } from 'vitest';
import { applyTheme, tokenToCssVar } from '../../src/themes/applyTheme';
import { THEMES } from '../../src/themes';
import { aceStudioTheme } from '../../src/themes/aceStudio';
import { abletonTheme } from '../../src/themes/ableton';

describe('applyTheme', () => {

  beforeEach(() => {
    const root = document.documentElement;
    for (const key of Object.keys(aceStudioTheme.tokens)) {
      root.style.removeProperty(tokenToCssVar(key));
    }
    delete root.dataset.theme;
  });

  it('sets CSS custom properties on document.documentElement', () => {
    applyTheme('ace-studio', aceStudioTheme.tokens);

    const root = document.documentElement;
    expect(root.style.getPropertyValue('--color-daw-bg')).toBe(aceStudioTheme.tokens['daw-bg']);
    expect(root.style.getPropertyValue('--color-daw-accent')).toBe(aceStudioTheme.tokens['daw-accent']);
    expect(root.style.getPropertyValue('--color-daw-playhead')).toBe(aceStudioTheme.tokens['daw-playhead']);
  });

  it('sets data-theme attribute', () => {
    applyTheme('ace-studio', aceStudioTheme.tokens);
    expect(document.documentElement.dataset.theme).toBe('ace-studio');

    applyTheme('ableton', abletonTheme.tokens);
    expect(document.documentElement.dataset.theme).toBe('ableton');
  });

  it('sets all token properties', () => {
    applyTheme('ace-studio', aceStudioTheme.tokens);

    const root = document.documentElement;
    for (const [key, value] of Object.entries(aceStudioTheme.tokens)) {
      expect(root.style.getPropertyValue(tokenToCssVar(key))).toBe(value);
    }
  });

  it('sets shadow tokens without --color- prefix', () => {
    applyTheme('ace-studio', aceStudioTheme.tokens);

    const root = document.documentElement;
    expect(root.style.getPropertyValue('--daw-shadow-sm')).toBe(aceStudioTheme.tokens['daw-shadow-sm']);
    expect(root.style.getPropertyValue('--daw-shadow-xl')).toBe(aceStudioTheme.tokens['daw-shadow-xl']);
    expect(root.style.getPropertyValue('--daw-glass-bg')).toBe(aceStudioTheme.tokens['daw-glass-bg']);
  });

  it('Ableton theme sets shadow tokens to none', () => {
    applyTheme('ableton', abletonTheme.tokens);

    const root = document.documentElement;
    expect(root.style.getPropertyValue('--daw-shadow-sm')).toBe('none');
    expect(root.style.getPropertyValue('--daw-shadow-xl')).toBe('none');
  });

  it('all themes define shadow and glass tokens', () => {
    const requiredTokens = [
      'daw-shadow-sm', 'daw-shadow-md', 'daw-shadow-lg', 'daw-shadow-xl', 'daw-shadow-inset',
      'daw-glass-bg', 'daw-glass-border',
    ] as const;

    for (const [themeId, theme] of Object.entries(THEMES)) {
      for (const token of requiredTokens) {
        expect(theme.tokens[token], `${themeId} missing ${token}`).toBeDefined();
        expect(theme.tokens[token].length, `${themeId} has empty ${token}`).toBeGreaterThan(0);
      }
    }
  });

  it('overwrites previous theme values', () => {
    applyTheme('ace-studio', aceStudioTheme.tokens);
    expect(document.documentElement.style.getPropertyValue('--color-daw-accent')).toBe(aceStudioTheme.tokens['daw-accent']);
    expect(document.documentElement.dataset.theme).toBe('ace-studio');

    applyTheme('ableton', abletonTheme.tokens);
    expect(document.documentElement.style.getPropertyValue('--color-daw-accent')).toBe(abletonTheme.tokens['daw-accent']);
    expect(document.documentElement.dataset.theme).toBe('ableton');
  });
});
