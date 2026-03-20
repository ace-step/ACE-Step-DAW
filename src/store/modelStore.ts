import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { getStats, initModel, listModels } from '../services/aceStepApi';
import { useProjectStore } from './projectStore';
import type { ModelEntry, StatsResponse } from '../types/api';

export type ModelLibraryTab = 'all' | 'pinned' | 'active';
export type ModelKind = 'dit' | 'lm';

export interface LibraryModel {
  id: string;
  name: string;
  kind: ModelKind;
  isLoaded: boolean;
  isDefault: boolean;
  supportedTaskTypes: string[];
}

interface ModelStoreState {
  models: LibraryModel[];
  activeModel: LibraryModel | null;
  activeLmModel: LibraryModel | null;
  pinnedModelIds: string[];
  activeTab: ModelLibraryTab;
  isRefreshing: boolean;
  isLoadingModel: boolean;
  loadingModelId: string | null;
  isRefreshingStats: boolean;
  statusMessage: string;
  errorMessage: string;
  stats: StatsResponse | null;
  llmInitialized: boolean;
  setActiveTab: (tab: ModelLibraryTab) => void;
  togglePinnedModel: (modelId: string) => void;
  refreshModels: () => Promise<void>;
  refreshStats: () => Promise<void>;
  loadModel: (modelId: string) => Promise<void>;
  clearMessages: () => void;
}

function sortModels(models: LibraryModel[]): LibraryModel[] {
  return [...models].sort((left, right) => {
    if (left.kind !== right.kind) {
      return left.kind === 'dit' ? -1 : 1;
    }
    if (left.isLoaded !== right.isLoaded) {
      return left.isLoaded ? -1 : 1;
    }
    if (left.isDefault !== right.isDefault) {
      return left.isDefault ? -1 : 1;
    }
    return left.name.localeCompare(right.name);
  });
}

function toLibraryModels(ditModels: ModelEntry[], lmModels: Array<{ name: string; is_loaded: boolean }>): LibraryModel[] {
  return sortModels([
    ...ditModels.map((model) => ({
      id: `dit:${model.name}`,
      name: model.name,
      kind: 'dit' as const,
      isLoaded: model.is_loaded,
      isDefault: model.is_default,
      supportedTaskTypes: [...(model.supported_task_types ?? [])],
    })),
    ...lmModels.map((model) => ({
      id: `lm:${model.name}`,
      name: model.name,
      kind: 'lm' as const,
      isLoaded: model.is_loaded,
      isDefault: false,
      supportedTaskTypes: [],
    })),
  ]);
}

function updateProjectGenerationModel(modelName: string) {
  const projectStore = useProjectStore.getState();
  const project = projectStore.project;
  if (!project) return;
  projectStore.setGenerationDefaults({ model: modelName });
}

export const useModelStore = create<ModelStoreState>()(
  persist(
    (set, get) => ({
      models: [],
      activeModel: null,
      activeLmModel: null,
      pinnedModelIds: [],
      activeTab: 'all',
      isRefreshing: false,
      isLoadingModel: false,
      loadingModelId: null,
      isRefreshingStats: false,
      statusMessage: '',
      errorMessage: '',
      stats: null,
      llmInitialized: false,

      setActiveTab: (tab) => set({ activeTab: tab }),

      togglePinnedModel: (modelId) => set((state) => ({
        pinnedModelIds: state.pinnedModelIds.includes(modelId)
          ? state.pinnedModelIds.filter((id) => id !== modelId)
          : [...state.pinnedModelIds, modelId],
      })),

      clearMessages: () => set({ statusMessage: '', errorMessage: '' }),

      refreshModels: async () => {
        set({ isRefreshing: true, errorMessage: '' });
        try {
          const response = await listModels();
          const nextModels = toLibraryModels(response.models ?? [], response.lm_models ?? []);
          set({
            models: nextModels,
            activeModel: nextModels.find((model) => model.kind === 'dit' && model.isLoaded) ?? null,
            activeLmModel: nextModels.find((model) => model.kind === 'lm' && model.isLoaded) ?? null,
            llmInitialized: Boolean(response.llm_initialized),
          });
        } catch (error) {
          set({
            models: [],
            activeModel: null,
            activeLmModel: null,
            llmInitialized: false,
            errorMessage: error instanceof Error ? error.message : 'Failed to refresh model inventory.',
          });
        } finally {
          set({ isRefreshing: false });
        }
      },

      refreshStats: async () => {
        set({ isRefreshingStats: true });
        try {
          const stats = await getStats();
          set({ stats, errorMessage: '' });
        } catch (error) {
          set({
            stats: null,
            errorMessage: error instanceof Error ? error.message : 'Failed to load backend stats.',
          });
        } finally {
          set({ isRefreshingStats: false });
        }
      },

      loadModel: async (modelId) => {
        const targetModel = get().models.find((model) => model.id === modelId);
        if (!targetModel) {
          set({ errorMessage: `Model "${modelId}" not found.` });
          return;
        }

        set({
          isLoadingModel: true,
          loadingModelId: modelId,
          errorMessage: '',
          statusMessage: '',
        });

        try {
          if (targetModel.kind === 'dit') {
            const response = await initModel({ model: targetModel.name });
            updateProjectGenerationModel(targetModel.name);
            set({ statusMessage: response.message || `Loaded ${targetModel.name}` });
          } else {
            const activeDitModel = get().models.find((model) => model.kind === 'dit' && model.isLoaded)
              ?? get().models.find((model) => model.kind === 'dit' && model.isDefault)
              ?? get().models.find((model) => model.kind === 'dit')
              ?? null;

            const projectModel = useProjectStore.getState().project?.generationDefaults.model ?? '';
            const ditModelName = activeDitModel?.name || projectModel;
            const response = await initModel({
              model: ditModelName,
              init_llm: true,
              lm_model_path: targetModel.name,
            });
            if (ditModelName) {
              updateProjectGenerationModel(ditModelName);
            }
            set({ statusMessage: response.message || `Loaded ${targetModel.name}` });
          }

          await get().refreshModels();
          await get().refreshStats();
        } catch (error) {
          set({
            errorMessage: error instanceof Error ? error.message : `Failed to load ${targetModel.name}.`,
          });
        } finally {
          set({ isLoadingModel: false, loadingModelId: null });
        }
      },
    }),
    {
      name: 'ace-step-daw-model-library',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        pinnedModelIds: state.pinnedModelIds,
        activeTab: state.activeTab,
      }),
    },
  ),
);
