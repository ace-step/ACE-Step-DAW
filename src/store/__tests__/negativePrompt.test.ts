import { describe, it, expect, beforeEach } from 'vitest';
import { useGenerationStore, createDefaultGenerationFormState } from '../generationStore';

describe('Negative Prompt — generationStore', () => {
  beforeEach(() => {
    useGenerationStore.setState({
      generationForm: createDefaultGenerationFormState(),
    });
  });

  it('default generationForm has empty negativePrompt', () => {
    const form = useGenerationStore.getState().generationForm;
    expect(form.negativePrompt).toBe('');
  });

  it('setGenerationNegativePrompt updates the form state', () => {
    useGenerationStore.getState().setGenerationNegativePrompt('no autotune, no reverb');
    const form = useGenerationStore.getState().generationForm;
    expect(form.negativePrompt).toBe('no autotune, no reverb');
  });

  it('resetGenerationForm clears negativePrompt', () => {
    useGenerationStore.getState().setGenerationNegativePrompt('no distortion');
    useGenerationStore.getState().resetGenerationForm();
    const form = useGenerationStore.getState().generationForm;
    expect(form.negativePrompt).toBe('');
  });

  it('negativePrompt persists across multiple updates', () => {
    const store = useGenerationStore.getState();
    store.setGenerationNegativePrompt('no autotune');
    store.setGenerationPrompt('upbeat pop song');
    // negativePrompt should not be affected by prompt changes
    expect(useGenerationStore.getState().generationForm.negativePrompt).toBe('no autotune');
    expect(useGenerationStore.getState().generationForm.prompt).toBe('upbeat pop song');
  });

  it('hydrateGenerationForm can set negativePrompt', () => {
    useGenerationStore.getState().hydrateGenerationForm({ negativePrompt: 'no falsetto' });
    expect(useGenerationStore.getState().generationForm.negativePrompt).toBe('no falsetto');
  });
});
