import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNonPassiveWheel } from '../useNonPassiveWheel';

describe('useNonPassiveWheel', () => {
  let div: HTMLDivElement;

  beforeEach(() => {
    div = document.createElement('div');
    document.body.appendChild(div);
  });

  it('registers a non-passive wheel listener so preventDefault works', () => {
    const addSpy = vi.spyOn(div, 'addEventListener');
    const handler = vi.fn();

    const { result } = renderHook(() => useNonPassiveWheel(handler));

    act(() => {
      result.current(div);
    });

    const call = addSpy.mock.calls.find(([type]) => type === 'wheel');
    expect(call).not.toBeUndefined();
    expect(call![2]).toEqual({ passive: false });

    addSpy.mockRestore();
  });

  it('calls the handler when a wheel event fires', () => {
    const handler = vi.fn();

    const { result } = renderHook(() => useNonPassiveWheel(handler));

    act(() => {
      result.current(div);
    });

    const event = new WheelEvent('wheel', { deltaY: -100, ctrlKey: true });
    div.dispatchEvent(event);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].ctrlKey).toBe(true);
  });

  it('allows preventDefault to actually cancel the event', () => {
    const handler = vi.fn((e: WheelEvent) => {
      e.preventDefault();
    });

    const { result } = renderHook(() => useNonPassiveWheel(handler));

    act(() => {
      result.current(div);
    });

    const event = new WheelEvent('wheel', {
      deltaY: -100,
      ctrlKey: true,
      cancelable: true,
    });
    div.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it('removes listener on unmount', () => {
    const removeSpy = vi.spyOn(div, 'removeEventListener');
    const handler = vi.fn();

    const { result, unmount } = renderHook(() => useNonPassiveWheel(handler));

    act(() => {
      result.current(div);
    });

    unmount();

    const call = removeSpy.mock.calls.find(([type]) => type === 'wheel');
    expect(call).not.toBeUndefined();

    removeSpy.mockRestore();
  });

  it('uses latest handler without re-attaching listener', () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    const addSpy = vi.spyOn(div, 'addEventListener');

    const { result, rerender } = renderHook(
      ({ handler }) => useNonPassiveWheel(handler),
      { initialProps: { handler: handler1 } },
    );

    act(() => {
      result.current(div);
    });

    const initialCallCount = addSpy.mock.calls.filter(([t]) => t === 'wheel').length;

    rerender({ handler: handler2 });

    // Should not re-attach (element didn't change)
    const afterCallCount = addSpy.mock.calls.filter(([t]) => t === 'wheel').length;
    expect(afterCallCount).toBe(initialCallCount);

    // Should call latest handler
    div.dispatchEvent(new WheelEvent('wheel', { deltaY: 10 }));
    expect(handler1).not.toHaveBeenCalled();
    expect(handler2).toHaveBeenCalledTimes(1);

    addSpy.mockRestore();
  });

  it('attaches listener when callback ref is called with an element (late mount)', () => {
    const handler = vi.fn();
    const addSpy = vi.spyOn(div, 'addEventListener');

    const { result } = renderHook(() => useNonPassiveWheel(handler));

    // No listener attached yet (ref not called)
    expect(addSpy.mock.calls.filter(([t]) => t === 'wheel').length).toBe(0);

    // Simulate late mount via callback ref
    act(() => {
      result.current(div);
    });

    const call = addSpy.mock.calls.find(([type]) => type === 'wheel');
    expect(call).not.toBeUndefined();
    expect(call![2]).toEqual({ passive: false });

    // Handler should work
    div.dispatchEvent(new WheelEvent('wheel', { deltaY: 10 }));
    expect(handler).toHaveBeenCalledTimes(1);

    addSpy.mockRestore();
  });

  it('cleans up when callback ref is called with null', () => {
    const handler = vi.fn();
    const removeSpy = vi.spyOn(div, 'removeEventListener');

    const { result } = renderHook(() => useNonPassiveWheel(handler));

    act(() => {
      result.current(div);
    });

    act(() => {
      result.current(null);
    });

    const call = removeSpy.mock.calls.find(([type]) => type === 'wheel');
    expect(call).not.toBeUndefined();

    // Handler should no longer fire
    div.dispatchEvent(new WheelEvent('wheel', { deltaY: 10 }));
    expect(handler).not.toHaveBeenCalled();

    removeSpy.mockRestore();
  });
});
