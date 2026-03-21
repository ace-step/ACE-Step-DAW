import { useCallback, useEffect, useRef, useState } from 'react';

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
 *
 * Returns a callback ref that should be passed to the element's `ref` prop.
 * This ensures the listener is attached even when the element mounts late
 * (e.g. behind a conditional render).
 */
export function useNonPassiveWheel(
  handler: (e: WheelEvent) => void,
) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  const [element, setElement] = useState<HTMLElement | null>(null);

  const callbackRef = useCallback((el: HTMLElement | null) => {
    setElement(el);
  }, []);

  useEffect(() => {
    if (!element) return;

    const listener = (e: WheelEvent) => handlerRef.current(e);
    element.addEventListener('wheel', listener, { passive: false });
    return () => element.removeEventListener('wheel', listener);
  }, [element]);

  return callbackRef;
}
