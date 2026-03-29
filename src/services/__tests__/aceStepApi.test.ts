import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('healthCheck', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-20T00:00:00.000Z'));
    vi.resetModules();
    vi.stubGlobal('fetch', vi.fn());
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('returns true when the backend responds successfully', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({ ok: true } as Response);

    const { healthCheck } = await import('../aceStepApi');

    await expect(healthCheck()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('backs off after a failure so repeated checks do not keep hitting the proxy', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    const { healthCheck } = await import('../aceStepApi');

    await expect(healthCheck()).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await expect(healthCheck()).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(29_999);
    await expect(healthCheck()).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    await expect(healthCheck()).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('resets the backoff after a successful probe', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ ok: true } as Response)
      .mockResolvedValue({ ok: true } as Response);

    const { healthCheck } = await import('../aceStepApi');

    await expect(healthCheck()).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(30_000);
    await expect(healthCheck()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await expect(healthCheck()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('stops polling after 5 consecutive failures', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    const { healthCheck, isHealthCheckStopped } = await import('../aceStepApi');

    // Failures 1-4: should keep retrying after backoff
    for (let i = 0; i < 4; i++) {
      await expect(healthCheck()).resolves.toBe(false);
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000); // advance past max backoff
    }

    expect(isHealthCheckStopped()).toBe(false);

    // Failure 5: should stop
    await expect(healthCheck()).resolves.toBe(false);
    expect(isHealthCheckStopped()).toBe(true);

    // After stopped, healthCheck returns false without calling fetch
    const callsBefore = fetchMock.mock.calls.length;
    await expect(healthCheck()).resolves.toBe(false);
    expect(fetchMock.mock.calls.length).toBe(callsBefore);
  });

  it('resumes polling after setBackendUrl resets stopped state', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    const { healthCheck, isHealthCheckStopped, setBackendUrl } = await import('../aceStepApi');

    // Exhaust 5 failures
    for (let i = 0; i < 5; i++) {
      await healthCheck();
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    }
    expect(isHealthCheckStopped()).toBe(true);

    // Changing URL resets the stopped state
    fetchMock.mockResolvedValueOnce({ ok: true } as Response);
    setBackendUrl('http://127.0.0.1:9999');
    expect(isHealthCheckStopped()).toBe(false);
    await expect(healthCheck()).resolves.toBe(true);
  });

  it('resets the backoff immediately when the backend URL changes', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ ok: true } as Response);

    const { healthCheck, setBackendUrl } = await import('../aceStepApi');

    await expect(healthCheck()).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    setBackendUrl('http://127.0.0.1:9000');

    await expect(healthCheck()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith('http://127.0.0.1:9000/health');
  });
});

describe('modelSupportsTaskType / isModelInventoryLoaded / isModelReady', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('fetch', vi.fn());
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('returns false when no inventory is cached', async () => {
    const { modelSupportsTaskType, isModelInventoryLoaded, isModelReady } = await import('../aceStepApi');
    expect(isModelInventoryLoaded()).toBe(false);
    expect(isModelReady()).toBe(false);
    expect(modelSupportsTaskType('cover')).toBe(false);
    expect(modelSupportsTaskType('repaint')).toBe(false);
  });

  it('returns false when inventory exists but no model is loaded', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        data: {
          models: [{ name: 'test-model', is_loaded: false, supported_task_types: ['cover'] }],
          default_model: null,
          lm_models: [],
        },
      }),
    } as Response);

    const { listModels, modelSupportsTaskType, isModelInventoryLoaded, isModelReady } = await import('../aceStepApi');
    await listModels();

    expect(isModelInventoryLoaded()).toBe(true);
    expect(isModelReady()).toBe(false);
    expect(modelSupportsTaskType('cover')).toBe(false);
  });

  it('returns true for supported task types when model is loaded', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        data: {
          models: [{ name: 'test-model', is_loaded: true, supported_task_types: ['cover', 'repaint'] }],
          default_model: 'test-model',
          lm_models: [],
        },
      }),
    } as Response);

    const { listModels, modelSupportsTaskType, isModelReady } = await import('../aceStepApi');
    await listModels();

    expect(isModelReady()).toBe(true);
    expect(modelSupportsTaskType('cover')).toBe(true);
    expect(modelSupportsTaskType('repaint')).toBe(true);
    expect(modelSupportsTaskType('unknown')).toBe(false);
  });

  it('returns true for any task when model has no supported_task_types metadata', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        data: {
          models: [{ name: 'old-model', is_loaded: true }],
          default_model: 'old-model',
          lm_models: [],
        },
      }),
    } as Response);

    const { listModels, modelSupportsTaskType } = await import('../aceStepApi');
    await listModels();

    // Backward compat: no task type metadata → assume all supported
    expect(modelSupportsTaskType('cover')).toBe(true);
    expect(modelSupportsTaskType('repaint')).toBe(true);
  });
});
