import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useMetaKeyDown } from '../../src/hooks/useMetaKeyDown';

describe('useMetaKeyDown', () => {
  it('returns false by default', () => {
    const { result } = renderHook(() => useMetaKeyDown());
    expect(result.current).toBe(false);
  });

  it('returns true when Meta key is pressed', () => {
    const { result } = renderHook(() => useMetaKeyDown());
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Meta' }));
    });
    expect(result.current).toBe(true);
  });

  it('returns false when Meta key is released', () => {
    const { result } = renderHook(() => useMetaKeyDown());
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Meta' }));
    });
    expect(result.current).toBe(true);
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Meta' }));
    });
    expect(result.current).toBe(false);
  });

  it('resets to false on window blur (Cmd-tab away)', () => {
    const { result } = renderHook(() => useMetaKeyDown());
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Meta' }));
    });
    expect(result.current).toBe(true);
    act(() => {
      window.dispatchEvent(new Event('blur'));
    });
    expect(result.current).toBe(false);
  });

  it('ignores non-Meta keys', () => {
    const { result } = renderHook(() => useMetaKeyDown());
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift' }));
    });
    expect(result.current).toBe(false);
  });
});
