import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useReducedMotion } from '../useReducedMotion';

describe('useReducedMotion', () => {
  it('returns a boolean', () => {
    const { result } = renderHook(() => useReducedMotion());
    expect(typeof result.current).toBe('boolean');
  });

  it('defaults to false in test environment (no prefers-reduced-motion)', () => {
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
  });
});
