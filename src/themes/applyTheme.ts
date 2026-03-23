import type { ThemeTokens } from './themeTokens';
import type { ThemeId } from './themeTokens';

export function applyTheme(themeId: ThemeId, tokens: ThemeTokens): void {
  const root = document.documentElement;
  root.dataset.theme = themeId;
  for (const [key, value] of Object.entries(tokens)) {
    root.style.setProperty(`--color-${key}`, value);
  }
}
