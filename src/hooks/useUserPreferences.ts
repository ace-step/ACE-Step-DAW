/**
 * React hook for user preference learning.
 * Provides preference profile and personalized presets.
 * @see https://github.com/ace-step/ACE-Step-DAW/issues/1098
 */

import { useCallback, useEffect, useState } from 'react';
import { getUserPreferencesService } from '../services/userPreferences';
import type {
  UserPreferences,
  PersonalizedPreset,
} from '../types/userPreferences';

export interface UseUserPreferencesReturn {
  preferences: UserPreferences | null;
  suggestedPresets: PersonalizedPreset[];
  loading: boolean;
  refresh: () => void;
  clear: () => void;
}

export function useUserPreferences(): UseUserPreferencesReturn {
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [suggestedPresets, setSuggestedPresets] = useState<PersonalizedPreset[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(() => {
    setLoading(true);
    const service = getUserPreferencesService();
    // Compute preferences once, then derive presets from the same result
    service.computePreferences()
      .then(prefs =>
        service.getSuggestedPresets(prefs).then(presets => ({ prefs, presets }))
      )
      .then(({ prefs, presets }) => {
        setPreferences(prefs);
        setSuggestedPresets(presets);
      })
      .catch(() => {
        setPreferences(null);
        setSuggestedPresets([]);
      })
      .finally(() => setLoading(false));
  }, []);

  const clear = useCallback(() => {
    const service = getUserPreferencesService();
    service.clearPreferences().then(() => {
      setPreferences(null);
      setSuggestedPresets([]);
    });
  }, []);

  useEffect(() => {
    // Load cached on mount, then recompute in background
    const service = getUserPreferencesService();
    service.getCachedPreferences().then(cached => {
      if (cached) setPreferences(cached);
    });
    refresh();
  }, [refresh]);

  return { preferences, suggestedPresets, loading, refresh, clear };
}
