import type { ThemeId, ThemeDefinition } from './themeTokens';
import { aceStudioTheme } from './aceStudio';
import { abletonTheme } from './ableton';
import { logicProTheme } from './logicPro';
import { flStudioTheme } from './flStudio';
import { proToolsTheme } from './proTools';

export type { ThemeId, ThemeTokens, ThemeDefinition } from './themeTokens';

export const THEMES: Record<ThemeId, ThemeDefinition> = {
  'ace-studio': aceStudioTheme,
  'ableton': abletonTheme,
  'logic-pro': logicProTheme,
  'fl-studio': flStudioTheme,
  'pro-tools': proToolsTheme,
};

export const THEME_LIST: ThemeDefinition[] = Object.values(THEMES);
