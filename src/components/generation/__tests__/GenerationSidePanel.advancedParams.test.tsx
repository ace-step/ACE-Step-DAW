import { describe, it, expect, beforeEach } from 'vitest';
import { useProjectStore } from '../../../store/projectStore';
import { useGenerationStore, createDefaultGenerationFormState } from '../../../store/generationStore';

describe('GenerationStore — advanced param setters', () => {
  beforeEach(() => {
    useGenerationStore.setState({
      generationForm: createDefaultGenerationFormState(),
    });
  });

  it('setGenerationInferenceSteps clamps to 1-200', () => {
    useGenerationStore.getState().setGenerationInferenceSteps(250);
    expect(useGenerationStore.getState().generationForm.inferenceSteps).toBe(200);
    useGenerationStore.getState().setGenerationInferenceSteps(0);
    expect(useGenerationStore.getState().generationForm.inferenceSteps).toBe(1);
  });

  it('setGenerationGuidanceScale clamps to 0-20', () => {
    useGenerationStore.getState().setGenerationGuidanceScale(25);
    expect(useGenerationStore.getState().generationForm.guidanceScale).toBe(20);
    useGenerationStore.getState().setGenerationGuidanceScale(-1);
    expect(useGenerationStore.getState().generationForm.guidanceScale).toBe(0);
  });

  it('setGenerationShift clamps to 0-10', () => {
    useGenerationStore.getState().setGenerationShift(15);
    expect(useGenerationStore.getState().generationForm.shift).toBe(10);
    useGenerationStore.getState().setGenerationShift(-5);
    expect(useGenerationStore.getState().generationForm.shift).toBe(0);
  });

  it('setGenerationThinking toggles boolean', () => {
    useGenerationStore.getState().setGenerationThinking(true);
    expect(useGenerationStore.getState().generationForm.thinking).toBe(true);
    useGenerationStore.getState().setGenerationThinking(false);
    expect(useGenerationStore.getState().generationForm.thinking).toBe(false);
  });

  it('setGenerationSeed stores string value', () => {
    useGenerationStore.getState().setGenerationSeed('12345');
    expect(useGenerationStore.getState().generationForm.seed).toBe('12345');
  });

  it('setGenerationUseRandomSeed stores boolean value', () => {
    useGenerationStore.getState().setGenerationUseRandomSeed(false);
    expect(useGenerationStore.getState().generationForm.useRandomSeed).toBe(false);
  });

  it('advanced params are included in submitGenerationRequest output', () => {
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject();
    useProjectStore.getState().addTrack('stems');
    const track = useProjectStore.getState().project!.tracks[0];

    useGenerationStore.setState({
      generationForm: {
        ...createDefaultGenerationFormState(),
        prompt: 'test prompt',
        selectedTrackId: track.id,
        inferenceSteps: 75,
        guidanceScale: 10.0,
        shift: 5.0,
        thinking: true,
        seed: '42',
        useRandomSeed: false,
      },
    });

    const params = useGenerationStore.getState().submitGenerationRequest({ globalCaption: '' });
    expect(params).not.toBeNull();
    expect(params!.inferenceSteps).toBe(75);
    expect(params!.guidanceScale).toBe(10.0);
    expect(params!.shift).toBe(5.0);
    expect(params!.thinking).toBe(true);
    expect(params!.seed).toBe('42');
    expect(params!.useRandomSeed).toBe(false);
  });
});
