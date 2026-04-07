import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ModelCapability, AiTaskType } from '../../types/api';

// Mock fetch globally
const mockFetch = vi.fn();

// Mock aceStepApi
vi.mock('../aceStepApi', () => ({
  getBackendUrl: vi.fn(() => ''),
}));

import {
  checkProviderHealth,
  getApiBaseUrl,
  getEndpointForTaskType,
  submitAiTask,
  ProviderUnavailableError,
  TASK_TYPE_TO_CAPABILITY,
} from '../unifiedTaskRouter';

describe('unifiedTaskRouter', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('TASK_TYPE_TO_CAPABILITY mapping', () => {
    it('maps all known task types to capabilities', () => {
      expect(TASK_TYPE_TO_CAPABILITY['lego']).toBe('music_generation');
      expect(TASK_TYPE_TO_CAPABILITY['text2music']).toBe('music_generation');
      expect(TASK_TYPE_TO_CAPABILITY['cover']).toBe('music_generation');
      expect(TASK_TYPE_TO_CAPABILITY['repaint']).toBe('music_generation');
      expect(TASK_TYPE_TO_CAPABILITY['stem_separation']).toBe('stem_separation');
      expect(TASK_TYPE_TO_CAPABILITY['ai_mix']).toBe('ai_mixing');
      expect(TASK_TYPE_TO_CAPABILITY['midi_generate']).toBe('midi_generation');
      expect(TASK_TYPE_TO_CAPABILITY['chord_generate']).toBe('chord_generation');
    });
  });

  describe('getEndpointForTaskType', () => {
    it('routes music generation tasks to /release_task', () => {
      expect(getEndpointForTaskType('lego')).toBe('/release_task');
      expect(getEndpointForTaskType('text2music')).toBe('/release_task');
      expect(getEndpointForTaskType('cover')).toBe('/release_task');
      expect(getEndpointForTaskType('repaint')).toBe('/release_task');
    });

    it('routes stem separation to /release_task', () => {
      expect(getEndpointForTaskType('stem_separation')).toBe('/release_task');
    });

    it('routes AI mix to /v1/ai-mix/analyze', () => {
      expect(getEndpointForTaskType('ai_mix')).toBe('/v1/ai-mix/analyze');
    });

    it('routes MIDI generation to /v1/midi/generate', () => {
      expect(getEndpointForTaskType('midi_generate')).toBe('/v1/midi/generate');
    });

    it('routes chord generation to /v1/chords/generate', () => {
      expect(getEndpointForTaskType('chord_generate')).toBe('/v1/chords/generate');
    });
  });

  describe('getApiBaseUrl', () => {
    it('returns /api when no custom backend configured', () => {
      expect(getApiBaseUrl()).toBe('/api');
    });
  });

  describe('checkProviderHealth', () => {
    it('returns healthy status on successful health check', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'ok' }),
      });

      const result = await checkProviderHealth('music_generation');

      expect(result.capability).toBe('music_generation');
      expect(result.status).toBe('healthy');
      expect(result.lastChecked).toBeGreaterThan(0);
    });

    it('returns unavailable on non-ok response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
      });

      const result = await checkProviderHealth('ai_mixing');

      expect(result.capability).toBe('ai_mixing');
      expect(result.status).toBe('unavailable');
      expect(result.error).toBeDefined();
    });

    it('returns error on network failure', async () => {
      mockFetch.mockRejectedValue(new Error('Failed to fetch'));

      const result = await checkProviderHealth('stem_separation');

      expect(result.capability).toBe('stem_separation');
      expect(result.status).toBe('error');
      expect(result.error).toContain('Failed to fetch');
    });
  });

  describe('ProviderUnavailableError', () => {
    it('includes capability and task type in the error', () => {
      const err = new ProviderUnavailableError('ai_mixing', 'ai_mix', 'Model not loaded');
      expect(err.capability).toBe('ai_mixing');
      expect(err.taskType).toBe('ai_mix');
      expect(err.message).toContain('ai_mixing');
      expect(err.message).toContain('Model not loaded');
      expect(err.name).toBe('ProviderUnavailableError');
    });

    it('provides a default message when no reason given', () => {
      const err = new ProviderUnavailableError('midi_generation', 'midi_generate');
      expect(err.message).toContain('Ensure the backend model is loaded');
    });
  });

  describe('submitAiTask', () => {
    it('routes JSON-body tasks (ai_mix) to the correct endpoint via POST', async () => {
      // ai_mix returns raw JSON (no ApiEnvelope wrapper)
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ task_id: 'task-123' }),
      });

      const result = await submitAiTask({
        task_type: 'ai_mix',
        mode: 'auto',
      });

      expect(result).toEqual({ task_id: 'task-123' });
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v1/ai-mix/analyze',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });

    it('routes FormData tasks (lego) with src_audio to /release_task', async () => {
      // release_task returns ApiEnvelope with code + data
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ code: 0, data: { task_id: 'task-456', status: 'queued' }, error: null, timestamp: 0, extra: null }),
      });

      const blob = new Blob(['test'], { type: 'audio/wav' });
      const result = await submitAiTask(
        {
          task_type: 'lego',
          track_name: 'vocals',
          prompt: 'test',
          global_caption: '',
          lyrics: '',
          instruction: 'Generate',
          repainting_start: 0,
          repainting_end: 10,
          audio_duration: 10,
          bpm: 120,
          key_scale: 'C major',
          time_signature: '4/4',
          inference_steps: 100,
          guidance_scale: 5,
          shift: 5,
          batch_size: 1,
          audio_format: 'wav',
          thinking: false,
          model: 'ace-step-v1',
        },
        blob,
      );

      expect(result).toEqual({ task_id: 'task-456', status: 'queued' });
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/release_task',
        expect.objectContaining({
          method: 'POST',
        }),
      );
      // Should use FormData (not JSON) for music gen tasks
      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[1].body).toBeInstanceOf(FormData);
    });

    it('throws on non-ok response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      });

      await expect(
        submitAiTask({ task_type: 'ai_mix', mode: 'auto' }),
      ).rejects.toThrow('submitAiTask failed: 500');
    });

    it('routes chord_generate tasks as JSON', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { chords: [] } }),
      });

      await submitAiTask({
        task_type: 'chord_generate',
        mode: 'suggest',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v1/chords/generate',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });

    it('routes midi_generate tasks as JSON', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: { task_id: 'midi-1' } }),
      });

      await submitAiTask({
        task_type: 'midi_generate',
        mode: 'continue',
        context_midi: 'base64data',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v1/midi/generate',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });
  });
});
