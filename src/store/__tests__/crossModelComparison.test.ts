import { beforeEach, describe, expect, it } from 'vitest';
import { useGenerationStore, type VariationSessionParams, type ModelOverride } from '../generationStore';

describe('cross-model comparison', () => {
  beforeEach(() => {
    useGenerationStore.setState({
      variationSession: null,
      isGenerating: false,
      generationForm: useGenerationStore.getState().generationForm,
    });
  });

  describe('Variation type extensions', () => {
    it('stores modelName on a Variation when updated', () => {
      const params: VariationSessionParams = {
        prompt: 'test prompt',
        trackId: 'track-1',
        variationCount: 2,
        bpm: 120,
        keyScale: 'C major',
        duration: 30,
        guidanceScale: 7.0,
      };
      useGenerationStore.getState().startVariationSession(params);

      useGenerationStore.getState().updateVariation(0, {
        modelName: 'ace-step-v1',
        status: 'done',
      });

      const session = useGenerationStore.getState().variationSession;
      expect(session).not.toBeNull();
      expect(session!.variations[0].modelName).toBe('ace-step-v1');
    });

    it('stores per-variation inferenceSteps and guidanceScale', () => {
      const params: VariationSessionParams = {
        prompt: 'test',
        trackId: 'track-1',
        variationCount: 2,
        bpm: 120,
        keyScale: 'C major',
        duration: 30,
        guidanceScale: 7.0,
      };
      useGenerationStore.getState().startVariationSession(params);

      useGenerationStore.getState().updateVariation(0, {
        modelName: 'ace-step-v1',
        inferenceSteps: 100,
        guidanceScale: 5.0,
        status: 'done',
      });

      const v = useGenerationStore.getState().variationSession!.variations[0];
      expect(v.inferenceSteps).toBe(100);
      expect(v.guidanceScale).toBe(5.0);
    });
  });

  describe('VariationSessionParams extensions', () => {
    it('supports comparisonMode and modelOverrides in params', () => {
      const overrides: ModelOverride[] = [
        { modelName: 'ace-step-v1', inferenceSteps: 50 },
        { modelName: 'ace-step-v2', guidanceScale: 10.0 },
      ];
      const params: VariationSessionParams = {
        prompt: 'test',
        trackId: 'track-1',
        variationCount: 2,
        bpm: 120,
        keyScale: 'C major',
        duration: 30,
        guidanceScale: 7.0,
        comparisonMode: 'cross-model',
        modelOverrides: overrides,
      };

      useGenerationStore.getState().startVariationSession(params);
      const session = useGenerationStore.getState().variationSession;
      expect(session).not.toBeNull();
      expect(session!.params.comparisonMode).toBe('cross-model');
      expect(session!.params.modelOverrides).toHaveLength(2);
      expect(session!.params.modelOverrides![0].modelName).toBe('ace-step-v1');
      expect(session!.params.modelOverrides![1].guidanceScale).toBe(10.0);
    });

    it('defaults to same-model comparisonMode when not specified', () => {
      const params: VariationSessionParams = {
        prompt: 'test',
        trackId: 'track-1',
        variationCount: 2,
        bpm: 120,
        keyScale: 'C major',
        duration: 30,
        guidanceScale: 7.0,
      };

      useGenerationStore.getState().startVariationSession(params);
      const session = useGenerationStore.getState().variationSession;
      expect(session!.params.comparisonMode).toBeUndefined();
      expect(session!.params.modelOverrides).toBeUndefined();
    });
  });

  describe('GenerationFormState extensions', () => {
    it('setCrossModelEnabled toggles compareModels state', () => {
      expect(useGenerationStore.getState().generationForm.compareModelsEnabled).toBe(false);
      useGenerationStore.getState().setCompareModelsEnabled(true);
      expect(useGenerationStore.getState().generationForm.compareModelsEnabled).toBe(true);
    });

    it('setCompareModelOverrides stores per-slot model overrides', () => {
      const overrides: ModelOverride[] = [
        { modelName: 'ace-step-v1' },
        { modelName: 'ace-step-v2', inferenceSteps: 80, guidanceScale: 5.0 },
      ];
      useGenerationStore.getState().setCompareModelOverrides(overrides);
      expect(useGenerationStore.getState().generationForm.compareModelOverrides).toEqual(overrides);
    });

    it('submitGenerationRequest includes cross-model params when compareModelsEnabled', () => {
      // Set up a valid form
      useGenerationStore.getState().hydrateGenerationForm({
        prompt: 'test prompt',
        selectedTrackId: 'track-1',
        bpm: 120,
        keyScale: 'C major',
        lengthSeconds: 30,
        temperature: 0.7,
        variationCount: 2,
      });
      useGenerationStore.getState().setCompareModelsEnabled(true);
      const overrides: ModelOverride[] = [
        { modelName: 'model-a' },
        { modelName: 'model-b' },
      ];
      useGenerationStore.getState().setCompareModelOverrides(overrides);

      const params = useGenerationStore.getState().submitGenerationRequest();
      expect(params).not.toBeNull();
      expect(params!.comparisonMode).toBe('cross-model');
      expect(params!.modelOverrides).toHaveLength(2);
      expect(params!.modelOverrides![0].modelName).toBe('model-a');
    });

    it('submitGenerationRequest omits cross-model params when compareModelsEnabled is false', () => {
      useGenerationStore.getState().hydrateGenerationForm({
        prompt: 'test prompt',
        selectedTrackId: 'track-1',
        bpm: 120,
        keyScale: 'C major',
        lengthSeconds: 30,
        temperature: 0.7,
        variationCount: 2,
      });
      useGenerationStore.getState().setCompareModelsEnabled(false);

      const params = useGenerationStore.getState().submitGenerationRequest();
      expect(params).not.toBeNull();
      expect(params!.comparisonMode).toBeUndefined();
      expect(params!.modelOverrides).toBeUndefined();
    });
  });
});
