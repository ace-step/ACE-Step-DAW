import type { ThemeTokens } from './themeTokens';
import type { ThemeId } from './themeTokens';

/** Token key prefixes that map to non-color CSS custom properties */
export const NON_COLOR_PREFIXES = ['daw-shadow-', 'daw-glass-'] as const;

/** Convert a theme token key to its CSS custom property name */
export function tokenToCssVar(key: string): string {
  const isNonColor = NON_COLOR_PREFIXES.some((p) => key.startsWith(p));
  return isNonColor ? `--${key}` : `--color-${key}`;
}

export function applyTheme(themeId: ThemeId, tokens: ThemeTokens): void {
  const root = document.documentElement;
  root.dataset.theme = themeId;
  for (const [key, value] of Object.entries(tokens)) {
    root.style.setProperty(tokenToCssVar(key), value);
  }
}
