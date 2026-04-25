import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VariationSessionParams, ModelOverride } from '../../src/store/generationStore';
import { useGenerationStore } from '../../src/store/generationStore';
import { useProjectStore } from '../../src/store/projectStore';
import { useModelStore } from '../../src/store/modelStore';

vi.mock('../../src/services/aceStepApi', () => ({
  initModel: vi.fn().mockResolvedValue({ message: 'OK', loaded_model: 'ace-step-v2' }),
  listModels: vi.fn().mockResolvedValue({ models: [], default_model: null, lm_models: [], loaded_lm_model: null, llm_initialized: false }),
  getStats: vi.fn().mockResolvedValue({ jobs: { total: 0, succeeded: 0, failed: 0, running: 0, queued: 0 }, queue_size: 0, queue_maxsize: 10, avg_job_seconds: 0 }),
}));

// Dynamically import after mock
const { initModel } = await import('../../src/services/aceStepApi');
const mockedInitModel = vi.mocked(initModel);

// Import generateVariationSession
const { generateVariationSession } = await import('../../src/services/generationPipeline');

describe('cross-model pipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useGenerationStore.setState({
      variationSession: null,
      isGenerating: false,
      jobs: [],
    });
    useModelStore.setState({
      activeModelId: 'ace-step-v1',
      availableModels: [
        { name: 'ace-step-v1', is_default: true, is_loaded: true },
        { name: 'ace-step-v2', is_default: false, is_loaded: false },
      ],
    });
  });

  it('calls initModel for each variation with different model in cross-model mode', async () => {
    // Set up project with a track
    const store = useProjectStore.getState();
    if (!store.project) {
      store.createProject({ name: 'Test Project' });
    }
    const track = store.addTrack('stems');

    const overrides: ModelOverride[] = [
      { modelName: 'ace-step-v1', inferenceSteps: 50 },
      { modelName: 'ace-step-v2', inferenceSteps: 100 },
    ];

    const params: VariationSessionParams = {
      prompt: 'test prompt',
      trackId: track.id,
      variationCount: 2,
      bpm: 120,
      keyScale: 'C major',
      duration: 30,
      guidanceScale: 7.0,
      comparisonMode: 'cross-model',
      modelOverrides: overrides,
    };

    // Start session before calling generateVariationSession
    useGenerationStore.getState().startVariationSession(params);

    // Generate with a mock clip generator to avoid real API calls
    let capturedOptions: Array<Record<string, unknown>> = [];
    const mockGenerateClip = vi.fn().mockImplementation(
      async (_clipId: string, _prev: Blob | null, options?: Record<string, unknown>) => {
        capturedOptions.push(options ?? {});
        return { cumulativeBlob: null, succeeded: true };
      },
    );

    await generateVariationSession(params, { generateClip: mockGenerateClip });

    // Should have been called twice (2 variations)
    expect(mockGenerateClip).toHaveBeenCalledTimes(2);

    // initModel should have been called for model switches
    // First variation uses ace-step-v1 (already loaded), second uses ace-step-v2 (needs switch)
    expect(mockedInitModel).toHaveBeenCalledWith({ model: 'ace-step-v2' });
  });

  it('does not call initModel in same-model mode', async () => {
    const store = useProjectStore.getState();
    if (!store.project) {
      store.createProject({ name: 'Test Project' });
    }
    const track = store.addTrack('stems');

    const params: VariationSessionParams = {
      prompt: 'test prompt',
      trackId: track.id,
      variationCount: 2,
      bpm: 120,
      keyScale: 'C major',
      duration: 30,
      guidanceScale: 7.0,
      // No comparisonMode — same-model
    };

    useGenerationStore.getState().startVariationSession(params);

    const mockGenerateClip = vi.fn().mockResolvedValue({
      cumulativeBlob: null,
      succeeded: true,
    });

    await generateVariationSession(params, { generateClip: mockGenerateClip });

    expect(mockedInitModel).not.toHaveBeenCalled();
  });

  it('records modelName on each variation after cross-model generation', async () => {
    const store = useProjectStore.getState();
    if (!store.project) {
      store.createProject({ name: 'Test Project' });
    }
    const track = store.addTrack('stems');

    const overrides: ModelOverride[] = [
      { modelName: 'ace-step-v1' },
      { modelName: 'ace-step-v2' },
    ];

    const params: VariationSessionParams = {
      prompt: 'test',
      trackId: track.id,
      variationCount: 2,
      bpm: 120,
      keyScale: 'C major',
      duration: 30,
      guidanceScale: 7.0,
      comparisonMode: 'cross-model',
      modelOverrides: overrides,
    };

    useGenerationStore.getState().startVariationSession(params);

    const mockGenerateClip = vi.fn().mockResolvedValue({
      cumulativeBlob: null,
      succeeded: true,
    });

    await generateVariationSession(params, { generateClip: mockGenerateClip });

    const session = useGenerationStore.getState().variationSession;
    expect(session).not.toBeNull();
    expect(session!.variations[0].modelName).toBe('ace-step-v1');
    expect(session!.variations[1].modelName).toBe('ace-step-v2');
  });

  it('reports errors on individual variations in cross-model mode (regression #1583)', async () => {
    const store = useProjectStore.getState();
    if (!store.project) {
      store.createProject({ name: 'Test Project' });
    }
    const track = store.addTrack('stems');

    const overrides: ModelOverride[] = [
      { modelName: 'ace-step-v1' },
      { modelName: 'ace-step-v2' },
    ];

    const params: VariationSessionParams = {
      prompt: 'test',
      trackId: track.id,
      variationCount: 2,
      bpm: 120,
      keyScale: 'C major',
      duration: 30,
      guidanceScale: 7.0,
      comparisonMode: 'cross-model',
      modelOverrides: overrides,
    };

    useGenerationStore.getState().startVariationSession(params);

    // First succeeds, second throws
    const mockGenerateClip = vi.fn()
      .mockResolvedValueOnce({ cumulativeBlob: null, succeeded: true })
      .mockRejectedValueOnce(new Error('Generation failed'));

    await generateVariationSession(params, { generateClip: mockGenerateClip });

    const session = useGenerationStore.getState().variationSession;
    expect(session).not.toBeNull();
    expect(session!.variations[1].status).toBe('error');
    expect(session!.variations[1].error).toBe('Generation failed: Generation failed');
    expect(session!.variations[1].completedAt).toBeGreaterThan(0);
  });
});
