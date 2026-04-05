import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

// Mock idb-keyval
vi.mock('idb-keyval', () => ({
  get: vi.fn().mockResolvedValue(undefined),
  set: vi.fn().mockResolvedValue(undefined),
  del: vi.fn(),
  keys: vi.fn().mockResolvedValue([]),
}));

import { useSmartDefaults } from '../useSmartDefaults';
import { resetSmartDefaults } from '../../services/smartDefaults';
import { resetRecipeWiki } from '../../services/recipeWiki';

describe('useSmartDefaults', () => {
  beforeEach(() => {
    resetSmartDefaults();
    resetRecipeWiki();
  });

  it('returns null when no genre provided', () => {
    const { result } = renderHook(() => useSmartDefaults(undefined));
    expect(result.current.result).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('returns a result for a known genre', async () => {
    const { result } = renderHook(() => useSmartDefaults('Pop'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Should return static preset fallback since wiki has no data
    expect(result.current.result).not.toBeNull();
    expect(result.current.result!.source).toBe('static');
  });

  it('returns fallback for unknown genre', async () => {
    const { result } = renderHook(() => useSmartDefaults('Unknown Genre'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.result).not.toBeNull();
    expect(result.current.result!.source).toBe('fallback');
  });

  it('provides refresh function', async () => {
    const { result } = renderHook(() => useSmartDefaults('Jazz'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(typeof result.current.refresh).toBe('function');
  });
});
