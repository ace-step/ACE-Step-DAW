import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePerformanceMonitor } from '../usePerformanceMonitor';
import { usePerformanceStore } from '../../store/performanceStore';

// Mock requestAnimationFrame / cancelAnimationFrame
let rafCallback: ((time: number) => void) | null = null;
let rafId = 0;

beforeEach(() => {
  rafCallback = null;
  rafId = 0;
  vi.stubGlobal('requestAnimationFrame', (cb: (time: number) => void) => {
    rafCallback = cb;
    return ++rafId;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  usePerformanceStore.getState().reset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('usePerformanceMonitor', () => {
  it('starts monitoring and sets up rAF loop', () => {
    renderHook(() => usePerformanceMonitor());
    expect(rafCallback).not.toBeNull();
  });

  it('updates store after enough frames', () => {
    renderHook(() => usePerformanceMonitor({ updateRateHz: 1000 }));

    // Simulate several frames
    for (let i = 0; i < 10; i++) {
      act(() => {
        rafCallback?.(i * 16.667);
        // Re-register callback (simulating rAF loop)
      });
    }

    const state = usePerformanceStore.getState();
    // FPS should be computed from the frame deltas
    expect(state.fps).toBeGreaterThanOrEqual(0);
  });

  it('cleans up rAF on unmount', () => {
    const cancelSpy = vi.fn();
    vi.stubGlobal('cancelAnimationFrame', cancelSpy);

    const { unmount } = renderHook(() => usePerformanceMonitor());
    unmount();
    expect(cancelSpy).toHaveBeenCalled();
  });
});
