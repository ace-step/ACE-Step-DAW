import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const mockComputePreferences = vi.fn();
const mockGetSuggestedPresets = vi.fn();
const mockGetCachedPreferences = vi.fn();
const mockClearPreferences = vi.fn();

vi.mock('../../services/userPreferences', () => ({
  getUserPreferencesService: () => ({
    computePreferences: () => mockComputePreferences(),
    getSuggestedPresets: () => mockGetSuggestedPresets(),
    getCachedPreferences: () => mockGetCachedPreferences(),
    clearPreferences: () => mockClearPreferences(),
  }),
}));

import { useUserPreferences } from '../useUserPreferences';
import { EMPTY_PREFERENCES } from '../../types/userPreferences';

describe('useUserPreferences', () => {
  beforeEach(() => {
    mockComputePreferences.mockReset().mockResolvedValue(EMPTY_PREFERENCES);
    mockGetSuggestedPresets.mockReset().mockResolvedValue([]);
    mockGetCachedPreferences.mockReset().mockResolvedValue(null);
    mockClearPreferences.mockReset().mockResolvedValue(undefined);
  });

  it('loads preferences on mount', async () => {
    const prefs = {
      ...EMPTY_PREFERENCES,
      topGenres: [{ genre: 'jazz', weight: 5, count: 3, averageRating: 4.0 }],
      generationCount: 3,
    };
    mockComputePreferences.mockResolvedValue(prefs);

    const { result } = renderHook(() => useUserPreferences());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.preferences).not.toBeNull();
    expect(result.current.preferences!.topGenres[0].genre).toBe('jazz');
  });

  it('provides suggested presets', async () => {
    mockComputePreferences.mockResolvedValue(EMPTY_PREFERENCES);
    mockGetSuggestedPresets.mockResolvedValue([
      { id: 'p1', name: 'My Jazz', caption: 'jazz chill', bpm: 100, keyScale: 'Bb major', reason: 'test' },
    ]);

    const { result } = renderHook(() => useUserPreferences());

    await waitFor(() => {
      expect(result.current.suggestedPresets.length).toBe(1);
    });

    expect(result.current.suggestedPresets[0].name).toBe('My Jazz');
  });

  it('handles clear', async () => {
    const { result } = renderHook(() => useUserPreferences());

    await waitFor(() => expect(result.current.loading).toBe(false));
    result.current.clear();

    expect(mockClearPreferences).toHaveBeenCalled();
  });

  it('provides refresh function', async () => {
    const { result } = renderHook(() => useUserPreferences());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(typeof result.current.refresh).toBe('function');
  });
});
