import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAnimatedPresence } from '../useAnimatedPresence';

describe('useAnimatedPresence', () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    vi.useFakeTimers();
    // Ensure prefers-reduced-motion is not set
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    // Restore original matchMedia to avoid leaking into other test files
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: originalMatchMedia,
    });
  });

  it('starts rendering when show is true', () => {
    const { result } = renderHook(() => useAnimatedPresence(true));
    expect(result.current.shouldRender).toBe(true);
  });

  it('does not render when show is false initially', () => {
    const { result } = renderHook(() => useAnimatedPresence(false));
    expect(result.current.shouldRender).toBe(false);
  });

  it('starts visible animation after mount', async () => {
    const { result } = renderHook(() => useAnimatedPresence(true));
    // isVisible becomes true after rAF
    await act(async () => {
      vi.advanceTimersByTime(16); // simulate rAF
    });
    expect(result.current.isVisible).toBe(true);
  });

  it('delays unmount by exitDurationMs', () => {
    const { result, rerender } = renderHook(
      ({ show }) => useAnimatedPresence(show, 300),
      { initialProps: { show: true } },
    );
    // Make visible
    act(() => { vi.advanceTimersByTime(16); });
    expect(result.current.shouldRender).toBe(true);

    // Start exit
    rerender({ show: false });
    expect(result.current.isVisible).toBe(false);
    // Still rendering during exit animation
    expect(result.current.shouldRender).toBe(true);

    // After exit duration
    act(() => { vi.advanceTimersByTime(300); });
    expect(result.current.shouldRender).toBe(false);
  });

  it('keeps rendering during exit animation', () => {
    const { result, rerender } = renderHook(
      ({ show }) => useAnimatedPresence(show, 500),
      { initialProps: { show: true } },
    );
    act(() => { vi.advanceTimersByTime(16); });

    rerender({ show: false });
    act(() => { vi.advanceTimersByTime(200); });
    // Still rendering halfway through exit
    expect(result.current.shouldRender).toBe(true);
    expect(result.current.isVisible).toBe(false);
  });

  it('cancels exit if show becomes true again', () => {
    const { result, rerender } = renderHook(
      ({ show }) => useAnimatedPresence(show, 300),
      { initialProps: { show: true } },
    );
    act(() => { vi.advanceTimersByTime(16); });

    // Start exit
    rerender({ show: false });
    act(() => { vi.advanceTimersByTime(100); });

    // Re-show before exit completes
    rerender({ show: true });
    act(() => { vi.advanceTimersByTime(16); });
    expect(result.current.shouldRender).toBe(true);
    expect(result.current.isVisible).toBe(true);
  });

  it('skips animation with reduced motion preference', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });

    const { result } = renderHook(() => useAnimatedPresence(true));
    // With reduced motion, both should immediately reflect the show state
    expect(result.current.shouldRender).toBe(true);
    expect(result.current.isVisible).toBe(true);
  });
});
