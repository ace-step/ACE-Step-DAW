/**
 * React hook for wiki-powered smart parameter defaults.
 * @see https://github.com/ace-step/ACE-Step-DAW/issues/1454
 */

import { useCallback, useEffect, useState } from 'react';
import { getSmartDefaultsService, type SmartDefaultsResult } from '../services/smartDefaults';

export interface UseSmartDefaultsReturn {
  result: SmartDefaultsResult | null;
  loading: boolean;
  refresh: () => void;
}

export function useSmartDefaults(genre: string | undefined): UseSmartDefaultsReturn {
  const [result, setResult] = useState<SmartDefaultsResult | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(() => {
    if (!genre) {
      setResult(null);
      return;
    }

    setLoading(true);
    const service = getSmartDefaultsService();
    service.suggest(genre)
      .then(setResult)
      .catch(() => setResult(null))
      .finally(() => setLoading(false));
  }, [genre]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { result, loading, refresh };
}
