import { useEffect } from 'react';
import { useUIStore } from '../store/uiStore';

/**
 * Syncs the OS-level prefers-reduced-motion media query with uiStore.reducedMotion.
 * Call once at the app root. Only applies the OS preference when the user has NOT
 * explicitly set it via Settings (tracked by reducedMotionOverride).
 */
export function useReducedMotionSync() {
  const setReducedMotion = useUIStore((s) => s.setReducedMotion);
  const reducedMotionOverride = useUIStore((s) => s.reducedMotionOverride);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent) => {
      // Only sync OS preference when user hasn't manually overridden
      if (!useUIStore.getState().reducedMotionOverride) {
        setReducedMotion(e.matches);
      }
    };

    // Use addEventListener with fallback for older browsers
    if (mql.addEventListener) {
      mql.addEventListener('change', handler);
      return () => mql.removeEventListener('change', handler);
    }
    return undefined;
  }, [setReducedMotion, reducedMotionOverride]);
}
