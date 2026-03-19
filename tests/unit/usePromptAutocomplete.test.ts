import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePromptAutocomplete, _extractCurrentToken } from '../../src/hooks/usePromptAutocomplete';

describe('extractCurrentToken', () => {
  it('extracts a single word at cursor', () => {
    const result = _extractCurrentToken('warm', 4);
    expect(result.token).toBe('warm');
    expect(result.start).toBe(0);
  });

  it('extracts partial token mid-typing', () => {
    const result = _extractCurrentToken('warm pi', 7);
    expect(result.token).toBe('pi');
  });

  it('extracts token after comma', () => {
    const result = _extractCurrentToken('jazz, pian', 10);
    expect(result.token).toBe('pian');
  });

  it('handles cursor at start of empty string', () => {
    const result = _extractCurrentToken('', 0);
    expect(result.token).toBe('');
  });

  it('handles comma-separated tokens with spaces', () => {
    const result = _extractCurrentToken('pop, rock, blu', 14);
    expect(result.token).toBe('blu');
  });

  it('extracts last word after space', () => {
    const result = _extractCurrentToken('warm synth', 10);
    expect(result.token).toBe('synth');
  });
});

describe('usePromptAutocomplete', () => {
  it('starts with no suggestions and closed', () => {
    const { result } = renderHook(() => usePromptAutocomplete());
    expect(result.current.isOpen).toBe(false);
    expect(result.current.suggestions).toEqual([]);
    expect(result.current.selectedIndex).toBe(0);
  });

  it('opens with suggestions when typing a matching token', () => {
    const { result } = renderHook(() => usePromptAutocomplete());
    act(() => {
      result.current.handleInputChange('pian', 4);
    });
    expect(result.current.isOpen).toBe(true);
    expect(result.current.suggestions.length).toBeGreaterThan(0);
    expect(result.current.suggestions[0].text).toBe('piano');
  });

  it('stays closed for no-match queries', () => {
    const { result } = renderHook(() => usePromptAutocomplete());
    act(() => {
      result.current.handleInputChange('xyzzzz', 6);
    });
    expect(result.current.isOpen).toBe(false);
    expect(result.current.suggestions).toEqual([]);
  });

  it('accepts a suggestion and returns new text', () => {
    const { result } = renderHook(() => usePromptAutocomplete());
    act(() => {
      result.current.handleInputChange('pian', 4);
    });
    let newText: string | null = null;
    act(() => {
      newText = result.current.accept(0);
    });
    expect(newText).toBe('piano');
    expect(result.current.isOpen).toBe(false);
  });

  it('accepts a suggestion after space-separated token', () => {
    const { result } = renderHook(() => usePromptAutocomplete());
    act(() => {
      result.current.handleInputChange('warm pian', 9);
    });
    let newText: string | null = null;
    act(() => {
      newText = result.current.accept(0);
    });
    expect(newText).toBe('warm piano');
  });

  it('navigates down with ArrowDown', () => {
    const { result } = renderHook(() => usePromptAutocomplete());
    act(() => {
      result.current.handleInputChange('pi', 2);
    });
    expect(result.current.selectedIndex).toBe(0);
    act(() => {
      result.current.handleKeyDown({
        key: 'ArrowDown',
        preventDefault: () => {},
      } as unknown as React.KeyboardEvent);
    });
    expect(result.current.selectedIndex).toBe(1);
  });

  it('navigates up with ArrowUp and wraps around', () => {
    const { result } = renderHook(() => usePromptAutocomplete());
    act(() => {
      result.current.handleInputChange('pi', 2);
    });
    // At index 0, pressing up should wrap to last
    act(() => {
      result.current.handleKeyDown({
        key: 'ArrowUp',
        preventDefault: () => {},
      } as unknown as React.KeyboardEvent);
    });
    expect(result.current.selectedIndex).toBe(result.current.suggestions.length - 1);
  });

  it('dismisses on Escape', () => {
    const { result } = renderHook(() => usePromptAutocomplete());
    act(() => {
      result.current.handleInputChange('jazz', 4);
    });
    expect(result.current.isOpen).toBe(true);
    act(() => {
      result.current.handleKeyDown({
        key: 'Escape',
        preventDefault: () => {},
      } as unknown as React.KeyboardEvent);
    });
    expect(result.current.isOpen).toBe(false);
  });

  it('accepts on Enter key', () => {
    const { result } = renderHook(() => usePromptAutocomplete());
    act(() => {
      result.current.handleInputChange('pian', 4);
    });
    let newText: string | null = null;
    act(() => {
      newText = result.current.handleKeyDown({
        key: 'Enter',
        preventDefault: () => {},
      } as unknown as React.KeyboardEvent);
    });
    expect(newText).toBe('piano');
  });

  it('accepts on Tab key', () => {
    const { result } = renderHook(() => usePromptAutocomplete());
    act(() => {
      result.current.handleInputChange('pian', 4);
    });
    let newText: string | null = null;
    act(() => {
      newText = result.current.handleKeyDown({
        key: 'Tab',
        preventDefault: () => {},
      } as unknown as React.KeyboardEvent);
    });
    expect(newText).toBe('piano');
  });

  it('resets selectedIndex on new input', () => {
    const { result } = renderHook(() => usePromptAutocomplete());
    act(() => {
      result.current.handleInputChange('pi', 2);
    });
    act(() => {
      result.current.handleKeyDown({
        key: 'ArrowDown',
        preventDefault: () => {},
      } as unknown as React.KeyboardEvent);
    });
    expect(result.current.selectedIndex).toBe(1);
    act(() => {
      result.current.handleInputChange('pia', 3);
    });
    expect(result.current.selectedIndex).toBe(0);
  });

  it('respects maxResults option', () => {
    const { result } = renderHook(() => usePromptAutocomplete({ maxResults: 3 }));
    act(() => {
      result.current.handleInputChange('s', 1);
    });
    expect(result.current.suggestions.length).toBeLessThanOrEqual(3);
  });

  it('returns null from handleKeyDown when closed', () => {
    const { result } = renderHook(() => usePromptAutocomplete());
    let returnVal: string | null = null;
    act(() => {
      returnVal = result.current.handleKeyDown({
        key: 'ArrowDown',
        preventDefault: () => {},
      } as unknown as React.KeyboardEvent);
    });
    expect(returnVal).toBeNull();
  });

  it('exposes currentToken', () => {
    const { result } = renderHook(() => usePromptAutocomplete());
    act(() => {
      result.current.handleInputChange('warm synth', 10);
    });
    expect(result.current.currentToken).toBe('synth');
  });
});
