import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StatsResponse } from '../../src/types/api';
import { useProjectStore } from '../../src/store/projectStore';

const apiMocks = vi.hoisted(() => ({
  listModels: vi.fn(),
  initModel: vi.fn(),
  getStats: vi.fn(),
}));

vi.mock('../../src/services/aceStepApi', () => apiMocks);

describe('modelStore', () => {
  beforeEach(async () => {
    localStorage.clear();
    vi.clearAllMocks();
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useProjectStore.getState().createProject({ name: 'Model Store Test' });
    const { useModelStore } = await import('../../src/store/modelStore');
    useModelStore.setState(useModelStore.getInitialState(), true);
  });

  it('hydrates the combined inventory and resolves active loaded models', async () => {
    apiMocks.listModels.mockResolvedValue({
      models: [
        {
          name: 'ace-step-dit-a',
          is_default: true,
          is_loaded: true,
          supported_task_types: ['lego', 'repaint'],
        },
      ],
      default_model: 'ace-step-dit-a',
      lm_models: [
        { name: 'ace-step-lm-a', is_loaded: true },
      ],
      loaded_lm_model: 'ace-step-lm-a',
      llm_initialized: true,
    });

    const { useModelStore } = await import('../../src/store/modelStore');
    await useModelStore.getState().refreshModels();

    const state = useModelStore.getState();
    expect(state.models).toHaveLength(2);
    expect(state.activeModel?.name).toBe('ace-step-dit-a');
    expect(state.activeLmModel?.name).toBe('ace-step-lm-a');
    expect(state.models[0]?.supportedTaskTypes).toEqual(['lego', 'repaint']);
  });

  it('loads a DIT model, updates project defaults, and refreshes backend stats', async () => {
    apiMocks.listModels
      .mockResolvedValueOnce({
        models: [
          { name: 'ace-step-dit-a', is_default: true, is_loaded: false, supported_task_types: ['lego'] },
          { name: 'ace-step-dit-b', is_default: false, is_loaded: true, supported_task_types: ['cover'] },
        ],
        default_model: 'ace-step-dit-a',
        lm_models: [],
        loaded_lm_model: null,
        llm_initialized: false,
      })
      .mockResolvedValueOnce({
        models: [
          { name: 'ace-step-dit-a', is_default: true, is_loaded: false, supported_task_types: ['lego'] },
          { name: 'ace-step-dit-b', is_default: false, is_loaded: true, supported_task_types: ['cover'] },
        ],
        default_model: 'ace-step-dit-a',
        lm_models: [],
        loaded_lm_model: null,
        llm_initialized: false,
      });
    apiMocks.initModel.mockResolvedValue({
      message: 'Loaded ace-step-dit-b',
      loaded_model: 'ace-step-dit-b',
    });
    const stats: StatsResponse = {
      jobs: { total: 4, succeeded: 3, failed: 0, running: 1, queued: 0 },
      queue_size: 0,
      queue_maxsize: 8,
      avg_job_seconds: 12,
    };
    apiMocks.getStats.mockResolvedValue(stats);

    const { useModelStore } = await import('../../src/store/modelStore');
    await useModelStore.getState().refreshModels();
    await useModelStore.getState().loadModel('dit:ace-step-dit-b');

    expect(apiMocks.initModel).toHaveBeenCalledWith({ model: 'ace-step-dit-b' });
    expect(useProjectStore.getState().project?.generationDefaults.model).toBe('ace-step-dit-b');
    expect(useModelStore.getState().stats).toEqual(stats);
    expect(useModelStore.getState().statusMessage).toContain('Loaded ace-step-dit-b');
  });

  it('pins and unpins models for the pinned tab', async () => {
    const { useModelStore } = await import('../../src/store/modelStore');

    useModelStore.getState().togglePinnedModel('dit:ace-step-dit-a');
    expect(useModelStore.getState().pinnedModelIds).toContain('dit:ace-step-dit-a');

    useModelStore.getState().togglePinnedModel('dit:ace-step-dit-a');
    expect(useModelStore.getState().pinnedModelIds).not.toContain('dit:ace-step-dit-a');
  });
});
