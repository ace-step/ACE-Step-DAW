import type { ThemeTokens } from './themeTokens';
import type { ThemeId } from './themeTokens';

/** Token key prefixes that map to non-color CSS custom properties */
const NON_COLOR_PREFIXES = ['daw-shadow-', 'daw-glass-'] as const;

export function applyTheme(themeId: ThemeId, tokens: ThemeTokens): void {
  const root = document.documentElement;
  root.dataset.theme = themeId;
  for (const [key, value] of Object.entries(tokens)) {
    const isNonColor = NON_COLOR_PREFIXES.some((p) => key.startsWith(p));
    const prop = isNonColor ? `--${key}` : `--color-${key}`;
    root.style.setProperty(prop, value);
  }
}
