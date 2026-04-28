import { describe, it, expect, beforeEach } from 'vitest';
import { useGenerationStore } from '../generationStore';

describe('Generation Store — Negative Prompt', () => {
  beforeEach(() => {
    useGenerationStore.getState().resetGenerationForm();
  });

  it('initializes negativePrompt as empty string', () => {
    const form = useGenerationStore.getState().generationForm;
    expect(form.negativePrompt).toBe('');
  });

  it('setGenerationNegativePrompt updates the value', () => {
    useGenerationStore.getState().setGenerationNegativePrompt('distortion, noise');
    const form = useGenerationStore.getState().generationForm;
    expect(form.negativePrompt).toBe('distortion, noise');
  });

  it('retains negativePrompt after setting it in the store', () => {
    useGenerationStore.getState().setGenerationNegativePrompt('harsh vocals');
    const form = useGenerationStore.getState().generationForm;
    expect(form.negativePrompt).toBe('harsh vocals');
  });

  it('clears requestError when negativePrompt is set', () => {
    useGenerationStore.setState((s) => ({
      generationForm: { ...s.generationForm, requestError: 'some error' },
    }));
    useGenerationStore.getState().setGenerationNegativePrompt('noise');
    expect(useGenerationStore.getState().generationForm.requestError).toBeNull();
  });

  it('resetGenerationForm clears negativePrompt', () => {
    useGenerationStore.getState().setGenerationNegativePrompt('noise');
    useGenerationStore.getState().resetGenerationForm();
    const form = useGenerationStore.getState().generationForm;
    expect(form.negativePrompt).toBe('');
  });
});
