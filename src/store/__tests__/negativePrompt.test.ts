import { describe, it, expect, beforeEach } from 'vitest';
import { useGenerationStore, createDefaultGenerationFormState } from '../generationStore';

describe('generationStore — negativePrompt', () => {
  beforeEach(() => {
    useGenerationStore.setState({
      generationForm: createDefaultGenerationFormState(),
    });
  });

  it('defaults negativePrompt to empty string', () => {
    const form = useGenerationStore.getState().generationForm;
    expect(form.negativePrompt).toBe('');
  });

  it('setGenerationNegativePrompt updates the value', () => {
    useGenerationStore.getState().setGenerationNegativePrompt('no autotune, no reverb');
    const form = useGenerationStore.getState().generationForm;
    expect(form.negativePrompt).toBe('no autotune, no reverb');
  });

  it('setGenerationNegativePrompt clears request error', () => {
    useGenerationStore.setState({
      generationForm: {
        ...createDefaultGenerationFormState(),
        requestError: 'some error',
      },
    });
    useGenerationStore.getState().setGenerationNegativePrompt('no distortion');
    const form = useGenerationStore.getState().generationForm;
    expect(form.requestError).toBeNull();
  });

  it('resetGenerationForm clears negativePrompt', () => {
    useGenerationStore.getState().setGenerationNegativePrompt('no reverb');
    useGenerationStore.getState().resetGenerationForm();
    const form = useGenerationStore.getState().generationForm;
    expect(form.negativePrompt).toBe('');
  });

  it('hydrateGenerationForm can set negativePrompt', () => {
    useGenerationStore.getState().hydrateGenerationForm({ negativePrompt: 'no falsetto' });
    const form = useGenerationStore.getState().generationForm;
    expect(form.negativePrompt).toBe('no falsetto');
  });
});
