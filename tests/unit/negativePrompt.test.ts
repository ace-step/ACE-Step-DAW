import { beforeEach, describe, expect, it } from 'vitest';
import { useGenerationStore, createDefaultGenerationFormState } from '../../src/store/generationStore';

describe('negative prompt — generationStore', () => {
  beforeEach(() => {
    useGenerationStore.setState(useGenerationStore.getInitialState(), true);
  });

  it('defaults negativePrompt to empty string', () => {
    const form = useGenerationStore.getState().generationForm;
    expect(form.negativePrompt).toBe('');
  });

  it('sets and retrieves negativePrompt', () => {
    useGenerationStore.getState().setGenerationNegativePrompt('no autotune, no heavy reverb');
    const form = useGenerationStore.getState().generationForm;
    expect(form.negativePrompt).toBe('no autotune, no heavy reverb');
  });

  it('clears requestError when setting negativePrompt', () => {
    useGenerationStore.getState().setGenerationRequestError('some error');
    expect(useGenerationStore.getState().generationForm.requestError).toBe('some error');

    useGenerationStore.getState().setGenerationNegativePrompt('no distortion');
    expect(useGenerationStore.getState().generationForm.requestError).toBeNull();
  });

  it('resetGenerationForm clears negativePrompt', () => {
    useGenerationStore.getState().setGenerationNegativePrompt('no falsetto');
    expect(useGenerationStore.getState().generationForm.negativePrompt).toBe('no falsetto');

    useGenerationStore.getState().resetGenerationForm();
    expect(useGenerationStore.getState().generationForm.negativePrompt).toBe('');
  });

  it('createDefaultGenerationFormState includes empty negativePrompt', () => {
    const defaults = createDefaultGenerationFormState();
    expect(defaults.negativePrompt).toBe('');
  });
});
