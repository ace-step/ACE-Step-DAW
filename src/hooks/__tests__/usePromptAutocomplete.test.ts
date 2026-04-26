import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePromptAutocomplete, _extractCurrentToken } from '../usePromptAutocomplete';

describe('extractCurrentToken', () => {
  it('extracts token at cursor position', () => {
    // Cursor after 'rock' → token is 'rock'
    const result = _extractCurrentToken('pop rock jazz', 8);
    expect(result.token).toBe('rock');
  });

  it('extracts partial token mid-word', () => {
    // Cursor after 'ro' in 'rock' → token is 'ro'
    const result = _extractCurrentToken('pop rock jazz', 6);
    expect(result.token).toBe('ro');
  });

  it('extracts first token', () => {
    const result = _extractCurrentToken('pop rock jazz', 3);
    expect(result.token).toBe('pop');
  });

  it('handles cursor at start', () => {
    const result = _extractCurrentToken('pop rock', 0);
    expect(result.token).toBe('');
  });

  it('handles empty string', () => {
    const result = _extractCurrentToken('', 0);
    expect(result.token).toBe('');
  });

  it('handles comma-separated tokens', () => {
    // 'pop, rock, jazz' - at position 12 (after 'j'), token is 'j'
    const result = _extractCurrentToken('pop, rock, jazz', 12);
    expect(result.token).toBe('j');
  });
});

describe('usePromptAutocomplete', () => {
  it('starts with empty state', () => {
    const { result } = renderHook(() => usePromptAutocomplete());
    expect(result.current.isOpen).toBe(false);
    expect(result.current.suggestions).toEqual([]);
    expect(result.current.selectedIndex).toBe(0);
    expect(result.current.currentToken).toBe('');
  });

  it('opens with suggestions when input has matching token', () => {
    const { result } = renderHook(() => usePromptAutocomplete());
    act(() => {
      result.current.handleInputChange('pop', 3);
    });
    expect(result.current.suggestions.length).toBeGreaterThan(0);
    expect(result.current.isOpen).toBe(true);
  });

  it('closes with empty input', () => {
    const { result } = renderHook(() => usePromptAutocomplete());
    act(() => {
      result.current.handleInputChange('pop', 3);
    });
    act(() => {
      result.current.handleInputChange('', 0);
    });
    expect(result.current.isOpen).toBe(false);
  });

  it('dismiss closes the autocomplete', () => {
    const { result } = renderHook(() => usePromptAutocomplete());
    act(() => {
      result.current.handleInputChange('pop', 3);
    });
    act(() => {
      result.current.dismiss();
    });
    expect(result.current.isOpen).toBe(false);
    expect(result.current.selectedIndex).toBe(0);
  });

  it('respects maxResults option', () => {
    const { result } = renderHook(() => usePromptAutocomplete({ maxResults: 3 }));
    act(() => {
      result.current.handleInputChange('a', 1);
    });
    expect(result.current.suggestions.length).toBeLessThanOrEqual(3);
  });

  it('resets selectedIndex on new input', () => {
    const { result } = renderHook(() => usePromptAutocomplete());
    act(() => {
      result.current.handleInputChange('pop', 3);
    });
    act(() => {
      result.current.handleInputChange('rock', 4);
    });
    expect(result.current.selectedIndex).toBe(0);
  });

  it('accept returns null when not open', () => {
    const { result } = renderHook(() => usePromptAutocomplete());
    let accepted: string | null = null;
    act(() => {
      accepted = result.current.accept();
    });
    expect(accepted).toBeNull();
  });
});
