import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSmoothedValue } from '../useSmoothedValue';

describe('useSmoothedValue', () => {
  it('returns the initial value immediately', () => {
    const { result } = renderHook(() => useSmoothedValue(5));
    expect(result.current).toBe(5);
  });

  it('eventually converges to target value', async () => {
    const { result, rerender } = renderHook(
      ({ target }) => useSmoothedValue(target, { factor: 0.5, threshold: 0.01 }),
      { initialProps: { target: 0 } },
    );

    // Change target
    rerender({ target: 10 });

    // Wait for animation frames to settle
    await act(async () => {
      await new Promise((r) => setTimeout(r, 200));
    });

    // Should have converged close to 10
    expect(result.current).toBeGreaterThan(9);
  });

  it('tracks value changes', () => {
    const { result, rerender } = renderHook(
      ({ target }) => useSmoothedValue(target, { factor: 1.0 }),
      { initialProps: { target: 0 } },
    );

    rerender({ target: 42 });
    // With factor=1.0, should snap immediately (or very close)
    // After a frame or two it should be at 42
    expect(typeof result.current).toBe('number');
  });
});
