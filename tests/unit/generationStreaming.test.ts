import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectStore } from '../../src/store/projectStore';
import { useGenerationStore, type VariationSessionParams } from '../../src/store/generationStore';
import {
  generateVariationSession,
  streamGenerationVariations,
  type VariationGenerationDependencies,
} from '../../src/services/generationPipeline';

vi.mock('../../src/services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('generateVariationSession', () => {
  beforeEach(() => {
    localStorage.clear();
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useGenerationStore.setState(useGenerationStore.getInitialState(), true);

    useProjectStore.getState().createProject({ name: 'Streaming Variations Test', bpm: 124, keyScale: 'A minor' });
    useProjectStore.getState().addTrack('drums');
  });

  it('streams variation completions into the shared store before the full batch finishes', async () => {
    const params: VariationSessionParams = {
      prompt: 'syncopated warehouse drums',
      trackId: useProjectStore.getState().project!.tracks[0].id,
      variationCount: 3,
      bpm: 124,
      keyScale: 'A minor',
      duration: 12,
      guidanceScale: 0.7,
      temperature: 0.7,
      globalCaption: 'dark warehouse groove',
    };

    useGenerationStore.getState().startVariationSession(params);

    let resolveFirst: (() => void) | null = null;
    let resolveSecond: (() => void) | null = null;
    let rejectThird: ((error?: unknown) => void) | null = null;

    const generationPromise = generateVariationSession(params, {
      generateClip: vi.fn((clipId, _previousCumulativeBlob, options) => {
        const variationIndex = options.variationIndex;
        useGenerationStore.getState().updateVariation(variationIndex, {
          clipId,
          status: 'generating',
          progress: `Generating variation ${variationIndex + 1}`,
        });

        if (variationIndex === 0) {
          return new Promise((resolve) => {
            resolveFirst = () => {
              useGenerationStore.getState().updateVariation(variationIndex, {
                status: 'done',
                progress: 'Ready',
                resultAudioPath: `/audio/${clipId}.wav`,
              });
              resolve({ cumulativeBlob: null, succeeded: true });
            };
          });
        }

        if (variationIndex === 1) {
          return new Promise((resolve) => {
            resolveSecond = () => {
              useGenerationStore.getState().updateVariation(variationIndex, {
                status: 'done',
                progress: 'Ready',
                resultAudioPath: `/audio/${clipId}.wav`,
              });
              resolve({ cumulativeBlob: null, succeeded: true });
            };
          });
        }

        return new Promise((_resolve, reject) => {
          rejectThird = (error?: unknown) => {
            useGenerationStore.getState().updateVariation(variationIndex, {
              status: 'error',
              progress: 'Generation failed',
              error: error instanceof Error ? error.message : 'Generation failed',
            });
            reject(error);
          };
        });
      }),
    });

    expect(useGenerationStore.getState().variationSession?.variations).toHaveLength(3);
    expect(
      useGenerationStore.getState().variationSession?.variations.every((variation) => variation.clipId),
    ).toBe(true);

    resolveFirst?.();
    await Promise.resolve();

    expect(useGenerationStore.getState().variationSession?.variations.map((variation) => variation.status)).toEqual([
      'done',
      'generating',
      'generating',
    ]);
    expect(useGenerationStore.getState().variationSession?.status).toBe('generating');

    rejectThird?.(new Error('Backend timeout for variation 3'));
    await Promise.resolve();

    expect(useGenerationStore.getState().variationSession?.variations[2]).toMatchObject({
      status: 'error',
      error: 'Backend timeout for variation 3',
    });
    expect(useGenerationStore.getState().variationSession?.variations[1].status).toBe('generating');

    resolveSecond?.();
    await generationPromise;

    expect(useGenerationStore.getState().variationSession?.variations.map((variation) => variation.status)).toEqual([
      'done',
      'done',
      'error',
    ]);
    expect(useGenerationStore.getState().variationSession?.status).toBe('done');
    expect(useGenerationStore.getState().isGenerating).toBe(false);
  });
});

describe('streamGenerationVariations', () => {
  beforeEach(() => {
    localStorage.clear();
    useGenerationStore.setState(useGenerationStore.getInitialState(), true);
    useProjectStore.setState(useProjectStore.getInitialState(), true);
  });

  it('reveals completed variations incrementally and preserves successes when siblings fail', async () => {
    useProjectStore.getState().createProject();
    const trackId = useProjectStore.getState().addTrack('drums').id;

    const first = createDeferred<{ succeeded: boolean; errorMessage?: string }>();
    const second = createDeferred<{ succeeded: boolean; errorMessage?: string }>();
    const runVariationClip = vi.fn<
      VariationGenerationDependencies['runVariationClip']
    >((clipId, index, report) => {
      report({
        status: 'generating',
        progress: `Submitting variation ${index + 1}`,
      });
      return index === 0 ? first.promise : second.promise;
    });

    const batchPromise = streamGenerationVariations(
      {
        prompt: 'glass piano with soft pulses',
        trackId,
        variationCount: 2,
        bpm: 124,
        keyScale: 'D minor',
        duration: 16,
        guidanceScale: 0.6,
        temperature: 0.6,
      },
      {
        createVariationClip: (_params, index) => `clip-${index + 1}`,
        runVariationClip,
        saveVariationClipVersion: vi.fn(),
      },
    );

    await Promise.resolve();

    let session = useGenerationStore.getState().variationSession;
    expect(session).not.toBeNull();
    expect(session?.variations.map((variation) => variation.status)).toEqual(['generating', 'generating']);
    expect(session?.variations.map((variation) => variation.clipId)).toEqual(['clip-1', 'clip-2']);

    first.resolve({ succeeded: true });
    await Promise.resolve();
    await Promise.resolve();

    session = useGenerationStore.getState().variationSession;
    expect(session?.status).toBe('generating');
    expect(session?.variations[0]).toMatchObject({
      status: 'done',
      clipId: 'clip-1',
      progress: 'Ready to review',
    });
    expect(session?.variations[1]).toMatchObject({
      status: 'generating',
      clipId: 'clip-2',
    });
    expect(useGenerationStore.getState().isGenerating).toBe(true);

    second.resolve({
      succeeded: false,
      errorMessage: 'Generation failed: choose a shorter length or retry this variation.',
    });
    await batchPromise;

    session = useGenerationStore.getState().variationSession;
    expect(session?.status).toBe('done');
    expect(session?.variations[0]).toMatchObject({
      status: 'done',
      clipId: 'clip-1',
    });
    expect(session?.variations[1]).toMatchObject({
      status: 'error',
      clipId: 'clip-2',
      error: 'Generation failed: choose a shorter length or retry this variation.',
    });
    expect(useGenerationStore.getState().isGenerating).toBe(false);
    expect(runVariationClip).toHaveBeenCalledTimes(2);
  });
});
