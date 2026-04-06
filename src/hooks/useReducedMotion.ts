import { useEffect } from 'react';
import { useUIStore } from '../store/uiStore';

/**
 * Syncs the OS-level prefers-reduced-motion media query with uiStore.reducedMotion.
 * Call once at the app root. If the user overrides in Settings, that takes precedence
 * (the media query listener still runs but won't fight the persisted value).
 */
export function useReducedMotionSync() {
  const setReducedMotion = useUIStore((s) => s.setReducedMotion);

  useEffect(() => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [setReducedMotion]);
}
