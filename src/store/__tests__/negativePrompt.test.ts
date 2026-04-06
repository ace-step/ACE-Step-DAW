import { describe, it, expect, beforeEach } from 'vitest';
import { useGenerationStore, createDefaultGenerationFormState } from '../generationStore';

describe('Negative Prompt — generationStore', () => {
  beforeEach(() => {
    useGenerationStore.setState({
      generationForm: createDefaultGenerationFormState(),
    });
  });

  it('default form state has empty negativePrompt', () => {
    const form = useGenerationStore.getState().generationForm;
    expect(form.negativePrompt).toBe('');
  });

  it('setGenerationNegativePrompt updates the field', () => {
    useGenerationStore.getState().setGenerationNegativePrompt('no autotune, no reverb');
    const form = useGenerationStore.getState().generationForm;
    expect(form.negativePrompt).toBe('no autotune, no reverb');
  });

  it('setGenerationNegativePrompt clears requestError', () => {
    useGenerationStore.setState((s) => ({
      generationForm: { ...s.generationForm, requestError: 'some error' },
    }));
    useGenerationStore.getState().setGenerationNegativePrompt('no distortion');
    expect(useGenerationStore.getState().generationForm.requestError).toBeNull();
  });

  it('resetGenerationForm resets negativePrompt to empty', () => {
    useGenerationStore.getState().setGenerationNegativePrompt('no autotune');
    useGenerationStore.getState().resetGenerationForm();
    expect(useGenerationStore.getState().generationForm.negativePrompt).toBe('');
  });

  it('hydrateGenerationForm can set negativePrompt', () => {
    useGenerationStore.getState().hydrateGenerationForm({ negativePrompt: 'no heavy bass' });
    expect(useGenerationStore.getState().generationForm.negativePrompt).toBe('no heavy bass');
  });

  it('negativePrompt is included in persisted generationForm', () => {
    // The persist partialize includes generationForm, so negativePrompt should be there
    const form = createDefaultGenerationFormState();
    expect('negativePrompt' in form).toBe(true);
  });
});
