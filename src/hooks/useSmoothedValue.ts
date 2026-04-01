/**
 * useSmoothedValue — Exponential smoothing for animated value transitions.
 *
 * Returns a smoothed version of the input value that tracks the target
 * with configurable inertia. Used for:
 * - Knob visual arc animation (slight lag gives "mass" feel)
 * - Meter ballistics (fast attack, slow release)
 * - Parameter transitions on automation/preset load
 *
 * The audio engine always gets the exact value immediately — this only
 * smooths the visual representation.
 */
import { useRef, useEffect, useState, useCallback } from 'react';

interface SmoothedValueOptions {
  /** Smoothing factor (0–1). Higher = faster tracking. Default: 0.3 */
  factor?: number;
  /** Threshold below which we snap to target (prevents endless asymptotic approach). Default: 0.001 */
  threshold?: number;
}

/**
 * Returns a smoothed version of the input value.
 *
 * @param target  The target value to track
 * @param options Smoothing configuration
 * @returns       The smoothed display value
 */
export function useSmoothedValue(
  target: number,
  options: SmoothedValueOptions = {},
): number {
  const { factor = 0.3, threshold = 0.001 } = options;
  const [display, setDisplay] = useState(target);
  const displayRef = useRef(target);
  const targetRef = useRef(target);
  const animRef = useRef<number>(0);

  targetRef.current = target;

  const animate = useCallback(() => {
    const diff = targetRef.current - displayRef.current;
    if (Math.abs(diff) < threshold) {
      displayRef.current = targetRef.current;
      setDisplay(targetRef.current);
      return; // Stop animation — close enough
    }

    displayRef.current += diff * factor;
    setDisplay(displayRef.current);
    animRef.current = requestAnimationFrame(animate);
  }, [factor, threshold]);

  useEffect(() => {
    animRef.current = requestAnimationFrame(animate);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [target, animate]);

  return display;
}
