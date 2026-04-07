import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ModelsListResponse, ModelCapability } from '../../types/api';

vi.mock('../../services/aceStepApi', () => ({
  listModels: vi.fn(),
  initModel: vi.fn(),
  getStats: vi.fn(),
  inferModelCategory: vi.fn((m: { category?: string }) => m.category ?? 'text2music'),
  healthCheck: vi.fn(),
}));

vi.mock('../../services/unifiedTaskRouter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/unifiedTaskRouter')>();
  return {
    ...actual,
    checkProviderHealth: vi.fn(),
  };
});

import { useModelStore } from '../modelStore';
import { listModels } from '../../services/aceStepApi';
import { checkProviderHealth } from '../../services/unifiedTaskRouter';

const mockedListModels = vi.mocked(listModels);
const mockedCheckProviderHealth = vi.mocked(checkProviderHealth);

const MULTI_PROVIDER_RESPONSE: ModelsListResponse = {
  models: [
    { name: 'ace-step-v1', is_default: true, is_loaded: true, supported_task_types: ['lego', 'text2music', 'cover', 'repaint'] },
  ],
  default_model: 'ace-step-v1',
  lm_models: [],
  loaded_lm_model: null,
  llm_initialized: false,
};

describe('modelStore — unified multi-provider features (#741)', () => {
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
      providerHealth: {},
    });
  });

  describe('providerHealth tracking', () => {
    it('initializes with empty provider health map', () => {
      expect(useModelStore.getState().providerHealth).toEqual({});
    });

    it('updates provider health after check', async () => {
      mockedCheckProviderHealth.mockResolvedValue({
        capability: 'music_generation',
        status: 'healthy',
        lastChecked: Date.now(),
      });

      await useModelStore.getState().checkProviderHealth('music_generation');
      const health = useModelStore.getState().providerHealth['music_generation'];

      expect(health).toBeDefined();
      expect(health!.status).toBe('healthy');
      expect(health!.lastChecked).toBeGreaterThan(0);
    });

    it('marks provider as unavailable on health check failure', async () => {
      mockedCheckProviderHealth.mockResolvedValue({
        capability: 'ai_mixing',
        status: 'unavailable',
        lastChecked: Date.now(),
        error: 'Model not loaded',
      });

      await useModelStore.getState().checkProviderHealth('ai_mixing');
      const health = useModelStore.getState().providerHealth['ai_mixing'];

      expect(health!.status).toBe('unavailable');
      expect(health!.error).toBe('Model not loaded');
    });

    it('handles health check network errors gracefully', async () => {
      mockedCheckProviderHealth.mockRejectedValue(new Error('Network error'));

      await useModelStore.getState().checkProviderHealth('stem_separation');
      const health = useModelStore.getState().providerHealth['stem_separation'];

      expect(health!.status).toBe('error');
      expect(health!.error).toContain('Network error');
    });
  });

  describe('getProviderStatus', () => {
    it('returns unknown for unchecked providers', () => {
      expect(useModelStore.getState().getProviderStatus('midi_generation')).toBe('unknown');
    });

    it('returns the tracked status for checked providers', async () => {
      mockedCheckProviderHealth.mockResolvedValue({
        capability: 'music_generation',
        status: 'healthy',
        lastChecked: Date.now(),
      });

      await useModelStore.getState().checkProviderHealth('music_generation');
      expect(useModelStore.getState().getProviderStatus('music_generation')).toBe('healthy');
    });
  });

  describe('checkAllProviderHealth', () => {
    it('checks health for all known capabilities', async () => {
      mockedListModels.mockResolvedValue(MULTI_PROVIDER_RESPONSE);
      await useModelStore.getState().refreshModels();

      mockedCheckProviderHealth.mockResolvedValue({
        capability: 'music_generation',
        status: 'healthy',
        lastChecked: Date.now(),
      });

      await useModelStore.getState().checkAllProviderHealth();
      // Should have checked at least music_generation (from the loaded model)
      expect(mockedCheckProviderHealth).toHaveBeenCalled();
    });
  });

  describe('getCapabilitiesFromTaskType', () => {
    it('maps lego/text2music/cover/repaint to music_generation', () => {
      const fn = useModelStore.getState().getCapabilityForTaskType;
      expect(fn('lego')).toBe('music_generation');
      expect(fn('text2music')).toBe('music_generation');
      expect(fn('cover')).toBe('music_generation');
      expect(fn('repaint')).toBe('music_generation');
    });

    it('maps stem_separation to stem_separation', () => {
      expect(useModelStore.getState().getCapabilityForTaskType('stem_separation')).toBe('stem_separation');
    });

    it('maps ai_mix to ai_mixing', () => {
      expect(useModelStore.getState().getCapabilityForTaskType('ai_mix')).toBe('ai_mixing');
    });

    it('maps midi_generate to midi_generation', () => {
      expect(useModelStore.getState().getCapabilityForTaskType('midi_generate')).toBe('midi_generation');
    });

    it('maps chord_generate to chord_generation', () => {
      expect(useModelStore.getState().getCapabilityForTaskType('chord_generate')).toBe('chord_generation');
    });
  });

  describe('isProviderAvailable', () => {
    it('returns true for healthy providers', async () => {
      mockedCheckProviderHealth.mockResolvedValue({
        capability: 'music_generation',
        status: 'healthy',
        lastChecked: Date.now(),
      });
      await useModelStore.getState().checkProviderHealth('music_generation');

      expect(useModelStore.getState().isProviderAvailable('music_generation')).toBe(true);
    });

    it('returns false for unavailable providers', async () => {
      mockedCheckProviderHealth.mockResolvedValue({
        capability: 'ai_mixing',
        status: 'unavailable',
        lastChecked: Date.now(),
      });
      await useModelStore.getState().checkProviderHealth('ai_mixing');

      expect(useModelStore.getState().isProviderAvailable('ai_mixing')).toBe(false);
    });

    it('returns true for unknown providers (optimistic)', () => {
      expect(useModelStore.getState().isProviderAvailable('chord_generation')).toBe(true);
    });
  });
});
