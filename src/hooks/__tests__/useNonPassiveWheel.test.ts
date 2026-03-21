import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useRef } from 'react';
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

    renderHook(() => {
      const ref = useRef<HTMLElement>(div);
      useNonPassiveWheel(ref, handler);
    });

    const call = addSpy.mock.calls.find(([type]) => type === 'wheel');
    expect(call).toBeDefined();
    expect(call![2]).toEqual({ passive: false });

    addSpy.mockRestore();
  });

  it('calls the handler when a wheel event fires', () => {
    const handler = vi.fn();

    renderHook(() => {
      const ref = useRef<HTMLElement>(div);
      useNonPassiveWheel(ref, handler);
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

    renderHook(() => {
      const ref = useRef<HTMLElement>(div);
      useNonPassiveWheel(ref, handler);
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

    const { unmount } = renderHook(() => {
      const ref = useRef<HTMLElement>(div);
      useNonPassiveWheel(ref, handler);
    });

    unmount();

    const call = removeSpy.mock.calls.find(([type]) => type === 'wheel');
    expect(call).toBeDefined();

    removeSpy.mockRestore();
  });

  it('uses latest handler without re-attaching listener', () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    const addSpy = vi.spyOn(div, 'addEventListener');

    const { rerender } = renderHook(
      ({ handler }) => {
        const ref = useRef<HTMLElement>(div);
        useNonPassiveWheel(ref, handler);
      },
      { initialProps: { handler: handler1 } },
    );

    const initialCallCount = addSpy.mock.calls.filter(([t]) => t === 'wheel').length;

    rerender({ handler: handler2 });

    // Should not re-attach
    const afterCallCount = addSpy.mock.calls.filter(([t]) => t === 'wheel').length;
    expect(afterCallCount).toBe(initialCallCount);

    // Should call latest handler
    div.dispatchEvent(new WheelEvent('wheel', { deltaY: 10 }));
    expect(handler1).not.toHaveBeenCalled();
    expect(handler2).toHaveBeenCalledTimes(1);

    addSpy.mockRestore();
  });
});
