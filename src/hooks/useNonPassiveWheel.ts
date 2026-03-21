import { useEffect, useRef, type RefObject } from 'react';

/**
 * Attaches a non-passive wheel event listener to a DOM element.
 *
 * React's onWheel is registered as a passive listener, which means
 * `e.preventDefault()` is silently ignored. This causes trackpad
 * pinch-to-zoom (reported as wheel + ctrlKey) to trigger both our
 * custom zoom AND Chrome's native page zoom simultaneously.
 *
 * This hook uses `addEventListener` with `{ passive: false }` so that
 * `preventDefault()` actually works.
 */
export function useNonPassiveWheel(
  ref: RefObject<HTMLElement | null>,
  handler: (e: WheelEvent) => void,
) {
  // Keep handler in a ref so the effect doesn't re-run on every render
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const listener = (e: WheelEvent) => handlerRef.current(e);
    el.addEventListener('wheel', listener, { passive: false });
    return () => el.removeEventListener('wheel', listener);
  }, [ref]);
}
