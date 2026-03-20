import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { ModelEntry, LmModelEntry, StatsResponse } from '../types/api';
import { listModels, initModel, getStats } from '../services/aceStepApi';

const POLLING_INTERVAL_MS = 30_000;

export interface ModelStore {
  availableModels: ModelEntry[];
  availableLmModels: LmModelEntry[];
  activeModelId: string | null;
  activeLmModelId: string | null;
  pinnedModelIds: string[];
  modelLoadingState: 'idle' | 'loading' | 'error';
  connected: boolean;
  lastRefreshedAt: number;
  stats: StatsResponse | null;
  refreshModels: () => Promise<void>;
  switchModel: (name: string) => Promise<void>;
  switchLmModel: (name: string) => Promise<void>;
  pinModel: (name: string) => void;
  unpinModel: (name: string) => void;
  fetchStats: () => Promise<void>;
  startPolling: () => () => void;
}

export const useModelStore = create<ModelStore>()(
  persist(
    (set, get) => ({
      availableModels: [],
      availableLmModels: [],
      activeModelId: null,
      activeLmModelId: null,
      pinnedModelIds: [],
      modelLoadingState: 'idle',
      connected: false,
      lastRefreshedAt: 0,
      stats: null,
      refreshModels: async () => {
        try {
          const response = await listModels();
          const loadedModel = response.models.find((m) => m.is_loaded);
          const loadedLmModel = response.lm_models.find((m) => m.is_loaded);
          set({
            availableModels: response.models,
            availableLmModels: response.lm_models,
            activeModelId: loadedModel?.name ?? response.default_model ?? null,
            activeLmModelId: loadedLmModel?.name ?? response.loaded_lm_model ?? null,
            connected: true,
            lastRefreshedAt: Date.now(),
          });
        } catch {
          set({ connected: false });
        }
      },
      switchModel: async (name: string) => {
        set({ modelLoadingState: 'loading' });
        try {
          await initModel({ model: name });
          await get().refreshModels();
          set({ modelLoadingState: 'idle' });
        } catch {
          set({ modelLoadingState: 'error' });
        }
      },
      switchLmModel: async (name: string) => {
        set({ modelLoadingState: 'loading' });
        try {
          await initModel({ init_llm: true, lm_model_path: name });
          await get().refreshModels();
          set({ modelLoadingState: 'idle' });
        } catch {
          set({ modelLoadingState: 'error' });
        }
      },
      pinModel: (name: string) => {
        const { pinnedModelIds } = get();
        if (!pinnedModelIds.includes(name)) {
          set({ pinnedModelIds: [...pinnedModelIds, name] });
        }
      },
      unpinModel: (name: string) => {
        set({ pinnedModelIds: get().pinnedModelIds.filter((id) => id !== name) });
      },
      fetchStats: async () => {
        try {
          const response = await getStats();
          set({ stats: response });
        } catch {
          set({ stats: null });
        }
      },
      startPolling: () => {
        const interval = setInterval(() => {
          void get().refreshModels();
        }, POLLING_INTERVAL_MS);
        void get().refreshModels();
        return () => clearInterval(interval);
      },
    }),
    {
      name: 'ace-step-model-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        pinnedModelIds: state.pinnedModelIds,
      }),
    },
  ),
);
