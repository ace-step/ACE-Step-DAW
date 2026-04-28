import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const mockSuggest = vi.fn();
vi.mock('../../services/smartDefaults', () => ({
  getSmartDefaultsService: () => ({
    suggest: (...args: unknown[]) => mockSuggest(...args),
  }),
}));

import { useSmartDefaults } from '../useSmartDefaults';

describe('useSmartDefaults', () => {
  beforeEach(() => {
    mockSuggest.mockReset();
  });

  it('returns null when genre is undefined', () => {
    const { result } = renderHook(() => useSmartDefaults(undefined));
    expect(result.current.result).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('fetches suggestions for a genre', async () => {
    mockSuggest.mockResolvedValueOnce({
      params: { guidanceScale: 5 },
      source: 'wiki',
      confidence: 0.7,
      sampleSize: 10,
      reasoning: 'test',
    });

    const { result } = renderHook(() => useSmartDefaults('jazz'));

    await waitFor(() => {
      expect(result.current.result).not.toBeNull();
    });
    expect(result.current.result!.source).toBe('wiki');
    expect(result.current.loading).toBe(false);
  });

  it('handles errors gracefully', async () => {
    mockSuggest.mockRejectedValueOnce(new Error('fail'));

    const { result } = renderHook(() => useSmartDefaults('jazz'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.result).toBeNull();
  });

  it('provides a refresh function', async () => {
    mockSuggest.mockResolvedValue({
      params: {}, source: 'fallback', confidence: 0, sampleSize: 0, reasoning: '',
    });
    const { result } = renderHook(() => useSmartDefaults('jazz'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(typeof result.current.refresh).toBe('function');
  });
});
