import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ModelsListResponse, InitModelResponse } from '../../types/api';

vi.mock('../../services/aceStepApi', () => ({
  listModels: vi.fn(),
  initModel: vi.fn(),
  getStats: vi.fn(),
  inferModelCategory: vi.fn(),
}));

import { useModelStore, intentToCategory, intentNeedsLm } from '../modelStore';
import { listModels, initModel, inferModelCategory } from '../../services/aceStepApi';

const mockedListModels = vi.mocked(listModels);
const mockedInitModel = vi.mocked(initModel);
const mockedInferModelCategory = vi.mocked(inferModelCategory);

// Two model families: text2music and lego
const DUAL_MODEL_RESPONSE: ModelsListResponse = {
  models: [
    { name: 'ace-t2m-v1', is_default: true, is_loaded: true, supported_task_types: ['text2music', 'cover', 'repaint'], category: 'text2music' },
    { name: 'ace-lego-v1', is_default: false, is_loaded: false, supported_task_types: ['lego', 'cover', 'repaint'], category: 'lego' },
  ],
  default_model: 'ace-t2m-v1',
  lm_models: [{ name: 'llm-v1', is_loaded: false }],
  loaded_lm_model: null,
  llm_initialized: false,
};

const LEGO_LOADED_RESPONSE: ModelsListResponse = {
  models: [
    { name: 'ace-t2m-v1', is_default: true, is_loaded: false, supported_task_types: ['text2music', 'cover', 'repaint'], category: 'text2music' },
    { name: 'ace-lego-v1', is_default: false, is_loaded: true, supported_task_types: ['lego', 'cover', 'repaint'], category: 'lego' },
  ],
  default_model: 'ace-t2m-v1',
  lm_models: [{ name: 'llm-v1', is_loaded: false }],
  loaded_lm_model: null,
  llm_initialized: false,
};

const LM_LOADED_RESPONSE: ModelsListResponse = {
  ...DUAL_MODEL_RESPONSE,
  lm_models: [{ name: 'llm-v1', is_loaded: true }],
  loaded_lm_model: 'llm-v1',
  llm_initialized: true,
};

const INIT_OK: InitModelResponse = { message: 'OK' };

describe('intentToCategory', () => {
  it('maps full-song to text2music', () => {
    expect(intentToCategory('full-song')).toBe('text2music');
  });

  it('maps single-track to lego', () => {
    expect(intentToCategory('single-track')).toBe('lego');
  });

  it('maps all-tracks to lego', () => {
    expect(intentToCategory('all-tracks')).toBe('lego');
  });

  it('returns null for cover (either model works)', () => {
    expect(intentToCategory('cover')).toBeNull();
  });

  it('returns null for repaint (either model works)', () => {
    expect(intentToCategory('repaint')).toBeNull();
  });
});

describe('intentNeedsLm', () => {
  it('full-song needs LM', () => {
    expect(intentNeedsLm('full-song')).toBe(true);
  });

  it('single-track does not need LM', () => {
    expect(intentNeedsLm('single-track')).toBe(false);
  });

  it('cover does not need LM', () => {
    expect(intentNeedsLm('cover')).toBe(false);
  });
});

describe('modelStore category-aware features', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useModelStore.setState({
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
    });
    // Default: inferModelCategory delegates to model.category
    mockedInferModelCategory.mockImplementation((m) => m.category ?? 'text2music');
  });

  describe('getModelsByCategory', () => {
    it('filters models by category', async () => {
      mockedListModels.mockResolvedValue(DUAL_MODEL_RESPONSE);
      await useModelStore.getState().refreshModels();

      const t2mModels = useModelStore.getState().getModelsByCategory('text2music');
      expect(t2mModels).toHaveLength(1);
      expect(t2mModels[0].name).toBe('ace-t2m-v1');

      const legoModels = useModelStore.getState().getModelsByCategory('lego');
      expect(legoModels).toHaveLength(1);
      expect(legoModels[0].name).toBe('ace-lego-v1');
    });
  });

  describe('getActiveModelCategory', () => {
    it('returns category of currently loaded model', async () => {
      mockedListModels.mockResolvedValue(DUAL_MODEL_RESPONSE);
      await useModelStore.getState().refreshModels();

      expect(useModelStore.getState().getActiveModelCategory()).toBe('text2music');
    });

    it('returns null when no model is active', () => {
      expect(useModelStore.getState().getActiveModelCategory()).toBeNull();
    });
  });

  describe('getDefaultModelForCategory', () => {
    it('returns default model for a category', async () => {
      mockedListModels.mockResolvedValue(DUAL_MODEL_RESPONSE);
      await useModelStore.getState().refreshModels();

      expect(useModelStore.getState().getDefaultModelForCategory('text2music')).toBe('ace-t2m-v1');
      expect(useModelStore.getState().getDefaultModelForCategory('lego')).toBe('ace-lego-v1');
    });

    it('respects user category overrides', async () => {
      mockedListModels.mockResolvedValue(DUAL_MODEL_RESPONSE);
      await useModelStore.getState().refreshModels();

      useModelStore.getState().setCategoryModelOverride('text2music', 'ace-t2m-v1');
      expect(useModelStore.getState().getDefaultModelForCategory('text2music')).toBe('ace-t2m-v1');
    });
  });

  describe('ensureModelForIntent', () => {
    it('does nothing for cover intent (no model switch needed)', async () => {
      mockedListModels.mockResolvedValue(DUAL_MODEL_RESPONSE);
      await useModelStore.getState().refreshModels();

      await useModelStore.getState().ensureModelForIntent('cover');
      // initModel should NOT have been called (model already loaded)
      expect(mockedInitModel).not.toHaveBeenCalled();
    });

    it('does not switch model when correct category already loaded', async () => {
      mockedListModels.mockResolvedValue(DUAL_MODEL_RESPONSE);
      await useModelStore.getState().refreshModels();

      // text2music model is already loaded, full-song needs text2music
      await useModelStore.getState().ensureModelForIntent('full-song');
      // No model switch needed, but LM init will be called since llm is not loaded
      expect(mockedInitModel).toHaveBeenCalledWith(
        expect.objectContaining({ init_llm: true }),
      );
    });

    it('switches model when wrong category loaded for single-track', async () => {
      // text2music model loaded, but need lego for single-track
      mockedListModels.mockResolvedValue(DUAL_MODEL_RESPONSE);
      await useModelStore.getState().refreshModels();

      // After switchModel, backend now has lego loaded
      mockedInitModel.mockResolvedValue(INIT_OK);
      mockedListModels.mockResolvedValue(LEGO_LOADED_RESPONSE);

      await useModelStore.getState().ensureModelForIntent('single-track');

      expect(mockedInitModel).toHaveBeenCalledWith({ model: 'ace-lego-v1' });
    });

    it('auto-loads LM for full-song when not initialized', async () => {
      // LM not loaded initially
      mockedListModels.mockResolvedValue(DUAL_MODEL_RESPONSE);
      await useModelStore.getState().refreshModels();

      mockedInitModel.mockResolvedValue(INIT_OK);
      // After LM init, refresh returns LM loaded
      mockedListModels.mockResolvedValue(LM_LOADED_RESPONSE);

      await useModelStore.getState().ensureModelForIntent('full-song');

      // Should init LLM (no model switch needed since t2m already loaded)
      expect(mockedInitModel).toHaveBeenCalledWith(
        expect.objectContaining({ init_llm: true, lm_model_path: 'llm-v1' }),
      );
    });

    it('throws when no model available for required category', async () => {
      // Only text2music models available, need lego
      const onlyT2m: ModelsListResponse = {
        ...DUAL_MODEL_RESPONSE,
        models: [DUAL_MODEL_RESPONSE.models[0]], // only text2music
      };
      mockedListModels.mockResolvedValue(onlyT2m);
      await useModelStore.getState().refreshModels();

      await expect(
        useModelStore.getState().ensureModelForIntent('single-track'),
      ).rejects.toThrow('No lego model available');
    });
  });

  describe('setCategoryModelOverride', () => {
    it('sets and clears category overrides', () => {
      useModelStore.getState().setCategoryModelOverride('lego', 'custom-lego');
      expect(useModelStore.getState().categoryModelOverrides).toEqual({ lego: 'custom-lego' });

      useModelStore.getState().setCategoryModelOverride('lego', null);
      expect(useModelStore.getState().categoryModelOverrides).toEqual({});
    });
  });
});
