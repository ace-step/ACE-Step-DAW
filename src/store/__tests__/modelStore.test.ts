import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ModelsListResponse, InitModelResponse, StatsResponse } from '../../types/api';
vi.mock('../../services/aceStepApi', () => ({ listModels: vi.fn(), initModel: vi.fn(), getStats: vi.fn() }));
import { useModelStore } from '../modelStore';
import { listModels, initModel, getStats } from '../../services/aceStepApi';
const mockedListModels = vi.mocked(listModels);
const mockedInitModel = vi.mocked(initModel);
const mockedGetStats = vi.mocked(getStats);
const MOCK_MODELS_RESPONSE: ModelsListResponse = { models: [{ name: 'ace-step-v1', is_default: true, is_loaded: true, supported_task_types: ['lego', 'cover'] }, { name: 'ace-step-v2', is_default: false, is_loaded: false, supported_task_types: ['lego', 'cover', 'repaint'] }], default_model: 'ace-step-v1', lm_models: [{ name: 'llm-v1', is_loaded: true }, { name: 'llm-v2', is_loaded: false }], loaded_lm_model: 'llm-v1', llm_initialized: true };
const MOCK_INIT_RESPONSE: InitModelResponse = { message: 'Model loaded successfully', loaded_model: 'ace-step-v2', loaded_lm_model: 'llm-v1', models: [{ name: 'ace-step-v1', is_default: true, is_loaded: false, supported_task_types: ['lego', 'cover'] }, { name: 'ace-step-v2', is_default: false, is_loaded: true, supported_task_types: ['lego', 'cover', 'repaint'] }], lm_models: [{ name: 'llm-v1', is_loaded: true }, { name: 'llm-v2', is_loaded: false }], llm_initialized: true };
const MOCK_STATS_RESPONSE: StatsResponse = { jobs: { total: 100, succeeded: 90, failed: 5, running: 3, queued: 2 }, queue_size: 5, queue_maxsize: 50, avg_job_seconds: 12.5 };

describe('modelStore', () => {
  beforeEach(() => { vi.clearAllMocks(); useModelStore.setState({ availableModels: [], availableLmModels: [], activeModelId: null, activeLmModelId: null, pinnedModelIds: [], modelLoadingState: 'idle', connected: false, lastRefreshedAt: 0, stats: null }); });

  describe('refreshModels', () => {
    it('fetches models from API and updates store', async () => { mockedListModels.mockResolvedValue(MOCK_MODELS_RESPONSE); await useModelStore.getState().refreshModels(); const state = useModelStore.getState(); expect(state.availableModels).toHaveLength(2); expect(state.availableModels[0].name).toBe('ace-step-v1'); expect(state.availableLmModels).toHaveLength(2); expect(state.activeModelId).toBe('ace-step-v1'); expect(state.activeLmModelId).toBe('llm-v1'); expect(state.connected).toBe(true); expect(state.lastRefreshedAt).toBeGreaterThan(0); });
    it('sets connected to false on API error', async () => { mockedListModels.mockRejectedValue(new Error('Network error')); await useModelStore.getState().refreshModels(); const state = useModelStore.getState(); expect(state.connected).toBe(false); expect(state.availableModels).toHaveLength(0); });
  });

  describe('switchModel', () => {
    it('calls initModel and refreshes the model list', async () => { mockedListModels.mockResolvedValue(MOCK_MODELS_RESPONSE); mockedInitModel.mockResolvedValue(MOCK_INIT_RESPONSE); await useModelStore.getState().refreshModels(); const r: ModelsListResponse = { ...MOCK_MODELS_RESPONSE, models: MOCK_INIT_RESPONSE.models! }; mockedListModels.mockResolvedValue(r); await useModelStore.getState().switchModel('ace-step-v2'); expect(mockedInitModel).toHaveBeenCalledWith({ model: 'ace-step-v2' }); const state = useModelStore.getState(); expect(state.activeModelId).toBe('ace-step-v2'); expect(state.modelLoadingState).toBe('idle'); });
    it('sets error on failure', async () => { mockedListModels.mockResolvedValue(MOCK_MODELS_RESPONSE); await useModelStore.getState().refreshModels(); mockedInitModel.mockRejectedValue(new Error('Init failed')); await useModelStore.getState().switchModel('bad'); expect(useModelStore.getState().modelLoadingState).toBe('error'); });
  });

  describe('switchLmModel', () => {
    it('calls initModel with lm_model_path', async () => { mockedListModels.mockResolvedValue(MOCK_MODELS_RESPONSE); mockedInitModel.mockResolvedValue(MOCK_INIT_RESPONSE); await useModelStore.getState().refreshModels(); const r: ModelsListResponse = { ...MOCK_MODELS_RESPONSE, loaded_lm_model: 'llm-v2', lm_models: [{ name: 'llm-v1', is_loaded: false }, { name: 'llm-v2', is_loaded: true }] }; mockedListModels.mockResolvedValue(r); await useModelStore.getState().switchLmModel('llm-v2'); expect(mockedInitModel).toHaveBeenCalledWith({ init_llm: true, lm_model_path: 'llm-v2' }); expect(useModelStore.getState().activeLmModelId).toBe('llm-v2'); });
  });

  describe('pin/unpin', () => {
    it('pins a model', () => { useModelStore.getState().pinModel('ace-step-v1'); expect(useModelStore.getState().pinnedModelIds).toContain('ace-step-v1'); });
    it('does not duplicate pins', () => { useModelStore.getState().pinModel('a'); useModelStore.getState().pinModel('a'); expect(useModelStore.getState().pinnedModelIds.filter((id) => id === 'a')).toHaveLength(1); });
    it('unpins a model', () => { useModelStore.getState().pinModel('a'); useModelStore.getState().pinModel('b'); useModelStore.getState().unpinModel('a'); expect(useModelStore.getState().pinnedModelIds).not.toContain('a'); expect(useModelStore.getState().pinnedModelIds).toContain('b'); });
  });

  describe('fetchStats', () => {
    it('fetches stats', async () => { mockedGetStats.mockResolvedValue(MOCK_STATS_RESPONSE); await useModelStore.getState().fetchStats(); expect(useModelStore.getState().stats).toEqual(MOCK_STATS_RESPONSE); });
    it('sets null on error', async () => { mockedGetStats.mockRejectedValue(new Error('fail')); useModelStore.setState({ stats: MOCK_STATS_RESPONSE }); await useModelStore.getState().fetchStats(); expect(useModelStore.getState().stats).toBeNull(); });
  });

  describe('startPolling', () => {
    it('returns a cleanup function', () => { mockedListModels.mockResolvedValue(MOCK_MODELS_RESPONSE); const cleanup = useModelStore.getState().startPolling(); expect(typeof cleanup).toBe('function'); cleanup(); });
  });
});
