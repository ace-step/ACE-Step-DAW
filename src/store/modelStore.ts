import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { ModelEntry, LmModelEntry, StatsResponse, ModelCategory, GenerationIntent, ModelCapability, AiTaskType } from '../types/api';
import { listModels, initModel, getStats, inferModelCategory } from '../services/aceStepApi';
import { checkProviderHealth as checkProviderHealthApi, TASK_TYPE_TO_CAPABILITY, type ProviderHealthResult } from '../services/unifiedTaskRouter';
import { GpuMemoryManager, type GpuMemoryState } from '../services/gpuMemoryManager';

const POLLING_INTERVAL_MS = 30_000;

/** Shared GPU memory manager instance — tracks model VRAM across the session */
const gpuMemoryManager = new GpuMemoryManager();

/**
 * Map a GenerationIntent to the required ModelCategory.
 * Cover/repaint work with either family — returns null (no switching needed).
 */
export function intentToCategory(intent: GenerationIntent): ModelCategory | null {
  switch (intent) {
    case 'full-song':
      return 'text2music';
    case 'single-track':
    case 'all-tracks':
      return 'lego';
    case 'cover':
    case 'repaint':
      return null; // either model works
  }
}

/** Whether a generation intent requires an LM model to be loaded. */
export function intentNeedsLm(intent: GenerationIntent): boolean {
  return intent === 'full-song';
}

export interface ModelStore {
  availableModels: ModelEntry[];
  availableLmModels: LmModelEntry[];
  activeModelId: string | null;
  activeLmModelId: string | null;
  pinnedModelIds: string[];
  /** Per-category pinned model overrides */
  categoryModelOverrides: Partial<Record<ModelCategory, string>>;
  modelLoadingState: 'idle' | 'loading' | 'error';
  connected: boolean;
  lastRefreshedAt: number;
  stats: StatsResponse | null;

  /** Per-capability provider health status (#741) */
  providerHealth: Partial<Record<ModelCapability, ProviderHealthResult>>;
  /** Estimated GPU memory state (#741) */
  gpuMemory: GpuMemoryState;

  // Existing actions
  refreshModels: () => Promise<void>;
  switchModel: (name: string) => Promise<void>;
  switchLmModel: (name: string) => Promise<void>;
  pinModel: (name: string) => void;
  unpinModel: (name: string) => void;
  fetchStats: () => Promise<void>;
  startPolling: () => () => void;

  // Category-aware getters
  getModelsByCategory: (category: ModelCategory) => ModelEntry[];
  getActiveModelCategory: () => ModelCategory | null;
  getDefaultModelForCategory: (category: ModelCategory) => string | null;
  /** Return the name of a currently-loaded model matching the given category, or null. */
  getLoadedModelForCategory: (category: ModelCategory) => string | null;

  // Intent-driven actions
  ensureModelForIntent: (intent: GenerationIntent) => Promise<void>;
  setCategoryModelOverride: (category: ModelCategory, modelName: string | null) => void;

  // Unified multi-provider features (#741)
  checkProviderHealth: (capability: ModelCapability) => Promise<void>;
  checkAllProviderHealth: () => Promise<void>;
  getProviderStatus: (capability: ModelCapability) => ProviderHealthResult['status'] | 'unknown';
  isProviderAvailable: (capability: ModelCapability) => boolean;
  getCapabilityForTaskType: (taskType: AiTaskType) => ModelCapability;

  // GPU memory management (#741)
  getGpuMemoryState: () => GpuMemoryState;
  canFitModel: (vramGb: number) => boolean;
}

export const useModelStore = create<ModelStore>()(
  persist(
    (set, get) => ({
      availableModels: [],
      availableLmModels: [],
      activeModelId: null,
      activeLmModelId: null,
      pinnedModelIds: [],
      categoryModelOverrides: {},
      modelLoadingState: 'idle',
      connected: false,
      lastRefreshedAt: 0,
      stats: null,
      providerHealth: {},
      gpuMemory: gpuMemoryManager.getState(),

      refreshModels: async () => {
        try {
          const response = await listModels();
          const loadedModel = response.models.find((m) => m.is_loaded);
          const loadedLmModel = response.lm_models.find((m) => m.is_loaded);

          // Sync GPU memory tracker with server inventory
          gpuMemoryManager.syncFromInventory(response.models);

          set({
            availableModels: response.models,
            availableLmModels: response.lm_models,
            activeModelId: loadedModel?.name ?? response.default_model ?? null,
            activeLmModelId: loadedLmModel?.name ?? response.loaded_lm_model ?? null,
            connected: true,
            lastRefreshedAt: Date.now(),
            gpuMemory: gpuMemoryManager.getState(),
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

      // --- Category-aware getters ---

      getModelsByCategory: (category: ModelCategory) => {
        return get().availableModels.filter((m) => inferModelCategory(m) === category);
      },

      getActiveModelCategory: () => {
        const { availableModels, activeModelId } = get();
        if (!activeModelId) return null;
        const model = availableModels.find((m) => m.name === activeModelId);
        if (!model) return null;
        return inferModelCategory(model);
      },

      getDefaultModelForCategory: (category: ModelCategory) => {
        const { categoryModelOverrides } = get();
        // 1. User override
        if (categoryModelOverrides[category]) {
          const overrideExists = get().availableModels.some((m) => m.name === categoryModelOverrides[category]);
          if (overrideExists) return categoryModelOverrides[category]!;
        }
        // 2. Backend default for this category
        const modelsInCategory = get().getModelsByCategory(category);
        const defaultModel = modelsInCategory.find((m) => m.is_default);
        if (defaultModel) return defaultModel.name;
        // 3. First available in category
        if (modelsInCategory.length > 0) return modelsInCategory[0].name;
        return null;
      },

      getLoadedModelForCategory: (category: ModelCategory) => {
        const loaded = get().availableModels.filter(
          (m) => m.is_loaded && inferModelCategory(m) === category,
        );
        if (loaded.length > 0) return loaded[0].name;
        // Fallback to getDefaultModelForCategory (unloaded but available)
        return null;
      },

      // --- Intent-driven actions ---

      ensureModelForIntent: async (intent: GenerationIntent) => {
        const requiredCategory = intentToCategory(intent);
        const needsLm = intentNeedsLm(intent);
        const state = get();

        // If no specific category required (cover/repaint), just check LM
        if (requiredCategory === null) {
          // Cover/repaint work with either model — no switching needed
          return;
        }

        // Check if current model matches required category
        const currentCategory = state.getActiveModelCategory();
        if (currentCategory !== requiredCategory) {
          // Need to switch model
          const targetModel = state.getDefaultModelForCategory(requiredCategory);
          if (!targetModel) {
            throw new Error(`No ${requiredCategory} model available. Check backend model inventory.`);
          }
          await state.switchModel(targetModel);
        }

        // Ensure LM is loaded if needed
        if (needsLm) {
          const refreshedState = get();
          const lmLoaded = refreshedState.availableLmModels.some((m) => m.is_loaded);
          if (!lmLoaded && refreshedState.availableLmModels.length > 0) {
            const defaultLm = refreshedState.activeLmModelId ?? refreshedState.availableLmModels[0].name;
            await refreshedState.switchLmModel(defaultLm);
          }
        }
      },

      setCategoryModelOverride: (category: ModelCategory, modelName: string | null) => {
        const overrides = { ...get().categoryModelOverrides };
        if (modelName === null) {
          delete overrides[category];
        } else {
          overrides[category] = modelName;
        }
        set({ categoryModelOverrides: overrides });
      },

      // --- Unified multi-provider features (#741) ---

      checkProviderHealth: async (capability: ModelCapability) => {
        try {
          const result = await checkProviderHealthApi(capability);
          set({
            providerHealth: {
              ...get().providerHealth,
              [capability]: result,
            },
          });
        } catch (err) {
          set({
            providerHealth: {
              ...get().providerHealth,
              [capability]: {
                capability,
                status: 'error' as const,
                lastChecked: Date.now(),
                error: err instanceof Error ? err.message : String(err),
              },
            },
          });
        }
      },

      checkAllProviderHealth: async () => {
        const capabilities: ModelCapability[] = [
          'music_generation',
          'stem_separation',
          'ai_mixing',
          'midi_generation',
          'chord_generation',
        ];
        await Promise.allSettled(
          capabilities.map((cap) => get().checkProviderHealth(cap)),
        );
      },

      getProviderStatus: (capability: ModelCapability) => {
        const health = get().providerHealth[capability];
        return health?.status ?? 'unknown';
      },

      isProviderAvailable: (capability: ModelCapability) => {
        const status = get().getProviderStatus(capability);
        // Optimistic: treat unknown as available (not yet checked)
        return status === 'healthy' || status === 'unknown';
      },

      getCapabilityForTaskType: (taskType: AiTaskType) => {
        return TASK_TYPE_TO_CAPABILITY[taskType];
      },

      // --- GPU memory management (#741) ---

      getGpuMemoryState: () => {
        return gpuMemoryManager.getState();
      },

      canFitModel: (vramGb: number) => {
        return gpuMemoryManager.canFitModel(vramGb);
      },
    }),
    {
      name: 'ace-step-model-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        pinnedModelIds: state.pinnedModelIds,
        categoryModelOverrides: state.categoryModelOverrides,
      }),
    },
  ),
);
