import { useCallback, useEffect, useRef } from 'react';

/**
 * Global aria-live announcer for screen readers.
 * Creates/reuses a single hidden live region to announce value changes.
 * Debounces announcements to avoid flooding during drag operations.
 */

let liveRegion: HTMLDivElement | null = null;
let clearTimer: ReturnType<typeof setTimeout> | undefined;

function ensureLiveRegion(): HTMLDivElement {
  if (liveRegion && document.body.contains(liveRegion)) return liveRegion;
  liveRegion = document.createElement('div');
  liveRegion.setAttribute('role', 'status');
  liveRegion.setAttribute('aria-live', 'polite');
  liveRegion.setAttribute('aria-atomic', 'true');
  liveRegion.className = 'sr-only';
  liveRegion.dataset.testid = 'sr-value-announce';
  document.body.appendChild(liveRegion);
  return liveRegion;
}

/** Announce a message to screen readers via aria-live region. */
export function announceToScreenReader(message: string): void {
  const region = ensureLiveRegion();
  // Clear first so re-reads same message
  region.textContent = '';
  if (clearTimer) clearTimeout(clearTimer);
  requestAnimationFrame(() => {
    region.textContent = message;
    clearTimer = setTimeout(() => {
      region.textContent = '';
    }, 1500);
  });
}

/**
 * Hook that returns a debounced announce function for slider/knob value changes.
 * Waits for user to stop adjusting before announcing (300ms debounce).
 */
export function useAriaValueAnnounce(label?: string): (value: string) => void {
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Clear pending timer on unmount to avoid stale announcements
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return useCallback((displayValue: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const msg = label ? `${label}: ${displayValue}` : displayValue;
      announceToScreenReader(msg);
    }, 300);
  }, [label]);
}
