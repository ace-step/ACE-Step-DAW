import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectStore } from '../../src/store/projectStore';
import { useGenerationStore, type VariationSessionParams } from '../../src/store/generationStore';
import { generateVariationSession } from '../../src/services/generationPipeline';

vi.mock('../../src/services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

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
