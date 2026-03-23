import { useEffect } from 'react';
import { useUIStore } from '../store/uiStore';
import { THEMES } from '../themes';
import { applyTheme } from '../themes/applyTheme';

export function useThemeSync(): void {
  const themeId = useUIStore((s) => s.theme);

  useEffect(() => {
    const theme = THEMES[themeId];
    if (theme) {
      applyTheme(themeId, theme.tokens);
    }
  }, [themeId]);
}
