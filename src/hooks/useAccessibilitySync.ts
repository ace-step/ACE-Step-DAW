import { useEffect } from 'react';
import { useUIStore } from '../store/uiStore';

/**
 * Syncs accessibility preferences from uiStore to document-level data attributes
 * so CSS can respond accordingly. Call once at the app root.
 */
export function useAccessibilitySync() {
  const reducedMotion = useUIStore((s) => s.reducedMotion);
  const highContrastMode = useUIStore((s) => s.highContrastMode);
  const colorBlindMode = useUIStore((s) => s.colorBlindMode);

  useEffect(() => {
    document.documentElement.dataset.reducedMotion = String(reducedMotion);
  }, [reducedMotion]);

  useEffect(() => {
    document.documentElement.dataset.highContrast = String(highContrastMode);
  }, [highContrastMode]);

  useEffect(() => {
    document.documentElement.dataset.colorBlind = String(colorBlindMode);
  }, [colorBlindMode]);
}
