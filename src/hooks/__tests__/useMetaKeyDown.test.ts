import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { fireEvent } from '@testing-library/dom';
import { useMetaKeyDown } from '../useMetaKeyDown';

describe('useMetaKeyDown', () => {
  it('returns false initially', () => {
    const { result } = renderHook(() => useMetaKeyDown());
    expect(result.current).toBe(false);
  });

  it('returns true when Meta key is pressed', () => {
    const { result } = renderHook(() => useMetaKeyDown());
    act(() => {
      fireEvent.keyDown(window, { key: 'Meta' });
    });
    expect(result.current).toBe(true);
  });

  it('returns false when Meta key is released', () => {
    const { result } = renderHook(() => useMetaKeyDown());
    act(() => {
      fireEvent.keyDown(window, { key: 'Meta' });
    });
    expect(result.current).toBe(true);
    act(() => {
      fireEvent.keyUp(window, { key: 'Meta' });
    });
    expect(result.current).toBe(false);
  });

  it('resets on window blur', () => {
    const { result } = renderHook(() => useMetaKeyDown());
    act(() => {
      fireEvent.keyDown(window, { key: 'Meta' });
    });
    expect(result.current).toBe(true);
    act(() => {
      fireEvent.blur(window);
    });
    expect(result.current).toBe(false);
  });

  it('ignores non-Meta keys', () => {
    const { result } = renderHook(() => useMetaKeyDown());
    act(() => {
      fireEvent.keyDown(window, { key: 'Shift' });
    });
    expect(result.current).toBe(false);
  });
});
