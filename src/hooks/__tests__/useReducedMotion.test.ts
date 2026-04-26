import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useReducedMotionSync } from '../useReducedMotion';
import { useUIStore } from '../../store/uiStore';

describe('useReducedMotionSync', () => {
  let addListenerSpy: ReturnType<typeof vi.fn>;
  let removeListenerSpy: ReturnType<typeof vi.fn>;
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    addListenerSpy = vi.fn();
    removeListenerSpy = vi.fn();
    // Explicitly reset both reducedMotion and reducedMotionOverride for determinism
    useUIStore.setState({ reducedMotion: false, reducedMotionOverride: false });
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: addListenerSpy,
        removeEventListener: removeListenerSpy,
      })),
    });
  });

  afterEach(() => {
    // Restore original matchMedia to avoid leaking into other suites
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: originalMatchMedia,
    });
  });

  it('registers a change listener on the media query', () => {
    renderHook(() => useReducedMotionSync());
    expect(addListenerSpy).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('removes listener on unmount', () => {
    const { unmount } = renderHook(() => useReducedMotionSync());
    unmount();
    expect(removeListenerSpy).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('calls setReducedMotion when media query changes and no override', () => {
    renderHook(() => useReducedMotionSync());
    // Get the handler passed to addEventListener
    const handler = addListenerSpy.mock.calls[0]?.[1];
    expect(handler).toBeDefined();
    // Simulate media query change
    handler?.({ matches: true });
    expect(useUIStore.getState().reducedMotion).toBe(true);
  });

  it('does not override when user has set manual override', () => {
    useUIStore.setState({ reducedMotionOverride: true, reducedMotion: false });
    renderHook(() => useReducedMotionSync());
    const handler = addListenerSpy.mock.calls[0]?.[1];
    handler?.({ matches: true });
    // Should NOT change because override is active
    expect(useUIStore.getState().reducedMotion).toBe(false);
  });
});
