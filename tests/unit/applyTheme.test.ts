import { describe, it, expect, beforeEach } from 'vitest';
import { applyTheme } from '../../src/themes/applyTheme';
import { aceStudioTheme } from '../../src/themes/aceStudio';
import { abletonTheme } from '../../src/themes/ableton';

describe('applyTheme', () => {
  beforeEach(() => {
    const root = document.documentElement;
    for (const key of Object.keys(aceStudioTheme.tokens)) {
      root.style.removeProperty(`--color-${key}`);
    }
    delete root.dataset.theme;
  });

  it('sets CSS custom properties on document.documentElement', () => {
    applyTheme('ace-studio', aceStudioTheme.tokens);

    const root = document.documentElement;
    expect(root.style.getPropertyValue('--color-daw-bg')).toBe('#191b1f');
    expect(root.style.getPropertyValue('--color-daw-accent')).toBe('#4a90d9');
    expect(root.style.getPropertyValue('--color-daw-playhead')).toBe('#5e59ff');
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
      expect(root.style.getPropertyValue(`--color-${key}`)).toBe(value);
    }
  });

  it('overwrites previous theme values', () => {
    applyTheme('ace-studio', aceStudioTheme.tokens);
    expect(document.documentElement.style.getPropertyValue('--color-daw-accent')).toBe('#4a90d9');
    expect(document.documentElement.dataset.theme).toBe('ace-studio');

    applyTheme('ableton', abletonTheme.tokens);
    expect(document.documentElement.style.getPropertyValue('--color-daw-accent')).toBe(abletonTheme.tokens['daw-accent']);
    expect(document.documentElement.dataset.theme).toBe('ableton');
  });
});
