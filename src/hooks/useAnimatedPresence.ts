import { useState, useEffect, useRef } from 'react';

/**
 * Hook that delays unmounting to allow exit animations.
 * Returns { shouldRender, isVisible } where:
 * - shouldRender: true while the component should be in the DOM (including during exit animation)
 * - isVisible: true when the component should be in its "visible" state (drives CSS transitions)
 *
 * Usage:
 *   const { shouldRender, isVisible } = useAnimatedPresence(isOpen, 300);
 *   if (!shouldRender) return null;
 *   return <div className={isVisible ? 'opacity-100' : 'opacity-0'}>...</div>;
 */
export function useAnimatedPresence(show: boolean, exitDurationMs = 300) {
  const [shouldRender, setShouldRender] = useState(show);
  const [isVisible, setIsVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (show) {
      // Mount immediately, then trigger enter animation on next frame
      setShouldRender(true);
      // Use rAF to ensure the component is mounted before triggering the animation
      const raf = requestAnimationFrame(() => {
        setIsVisible(true);
      });
      return () => cancelAnimationFrame(raf);
    } else {
      // Start exit animation immediately
      setIsVisible(false);
      // Unmount after exit animation completes
      timerRef.current = setTimeout(() => {
        setShouldRender(false);
      }, exitDurationMs);
      return () => clearTimeout(timerRef.current);
    }
  }, [show, exitDurationMs]);

  // Check if prefers-reduced-motion is enabled
  const prefersReducedMotion = typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  // With reduced motion, skip animations entirely
  if (prefersReducedMotion) {
    return { shouldRender: show, isVisible: show };
  }

  return { shouldRender, isVisible };
}
