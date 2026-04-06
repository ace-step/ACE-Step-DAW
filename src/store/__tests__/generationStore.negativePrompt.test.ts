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

  it('negativePrompt persists across panel toggles (state survives)', () => {
    useGenerationStore.getState().setGenerationNegativePrompt('harsh vocals');
    // Simulate panel reopen — store state should persist
    const form = useGenerationStore.getState().generationForm;
    expect(form.negativePrompt).toBe('harsh vocals');
  });

  it('resetGenerationForm clears negativePrompt', () => {
    useGenerationStore.getState().setGenerationNegativePrompt('noise');
    useGenerationStore.getState().resetGenerationForm();
    const form = useGenerationStore.getState().generationForm;
    expect(form.negativePrompt).toBe('');
  });
});
