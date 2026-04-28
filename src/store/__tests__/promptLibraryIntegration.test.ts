import { describe, it, expect, beforeEach } from 'vitest';
import { useGenerationStore } from '../generationStore';

describe('generationStore prompt library integration', () => {
  beforeEach(() => {
    // Reset the store between tests
    const { promptLibrary, ...rest } = useGenerationStore.getState();
    // Clear any saved prompts by deleting each
    for (const p of promptLibrary) {
      useGenerationStore.getState().deleteFromPromptLibrary(p.id);
    }
  });

  it('saveToPromptLibrary adds a prompt and updates state', () => {
    const store = useGenerationStore.getState();
    const saved = store.saveToPromptLibrary({
      prompt: 'Dreamy synth pad',
      title: 'Synth Pad',
      tags: ['ambient', 'synth'],
      category: 'synth',
      metadata: { bpm: 80, keyScale: 'D major' },
    });

    expect(saved.id).toBeTruthy();
    expect(saved.prompt).toBe('Dreamy synth pad');
    expect(useGenerationStore.getState().promptLibrary).toHaveLength(1);
  });

  it('deleteFromPromptLibrary removes a prompt', () => {
    const store = useGenerationStore.getState();
    const saved = store.saveToPromptLibrary({
      prompt: 'To delete',
      title: 'Delete',
      tags: [],
      category: '',
      metadata: {},
    });

    expect(useGenerationStore.getState().promptLibrary).toHaveLength(1);
    useGenerationStore.getState().deleteFromPromptLibrary(saved.id);
    expect(useGenerationStore.getState().promptLibrary).toHaveLength(0);
  });

  it('togglePromptLibraryFavorite toggles isFavorite', () => {
    const saved = useGenerationStore.getState().saveToPromptLibrary({
      prompt: 'Fav test',
      title: 'Fav',
      tags: [],
      category: '',
      metadata: {},
    });

    const toggled = useGenerationStore.getState().togglePromptLibraryFavorite(saved.id);
    expect(toggled?.isFavorite).toBe(true);
    expect(useGenerationStore.getState().promptLibrary[0].isFavorite).toBe(true);
  });

  it('applyPromptFromLibrary sets generation form and records use', () => {
    const saved = useGenerationStore.getState().saveToPromptLibrary({
      prompt: 'Apply this prompt',
      title: 'Apply Test',
      tags: ['test'],
      category: '',
      metadata: { bpm: 140, keyScale: 'E minor', styleTags: ['rock', 'guitar'] },
    });

    const applied = useGenerationStore.getState().applyPromptFromLibrary(saved.id);
    expect(applied).toBe(true);

    const form = useGenerationStore.getState().generationForm;
    expect(form.prompt).toBe('Apply this prompt');
    expect(form.bpm).toBe(140);
    expect(form.keyScale).toBe('E minor');
    expect(form.styleTags).toEqual(['rock', 'guitar']);

    // Use count should increment
    const updated = useGenerationStore.getState().promptLibrary.find((p) => p.id === saved.id);
    expect(updated?.useCount).toBe(1);
  });

  it('normalizes prompt metadata before applying it to the generation form', () => {
    const saved = useGenerationStore.getState().saveToPromptLibrary({
      prompt: 'Apply imported prompt',
      title: 'Imported',
      tags: ['test'],
      category: '',
      metadata: {
        bpm: 999,
        keyScale: '  D minor  ',
        styleTags: ['Rock', 'rock', 'GUITAR', 'ambient', 'lo-fi', 'warm', 'extra'],
        lengthSeconds: 9999,
      },
    });

    const applied = useGenerationStore.getState().applyPromptFromLibrary(saved.id);
    expect(applied).toBe(true);

    const form = useGenerationStore.getState().generationForm;
    expect(form.bpm).toBe(300);
    expect(form.keyScale).toBe('D minor');
    expect(form.styleTags).toEqual(['Rock', 'GUITAR', 'ambient', 'lo-fi', 'warm', 'extra']);
    expect(form.lengthSeconds).toBe(600);
  });

  it('applyPromptFromLibrary returns false for non-existent id', () => {
    const result = useGenerationStore.getState().applyPromptFromLibrary('does-not-exist');
    expect(result).toBe(false);
  });

  it('searchPromptLibrary filters by text', () => {
    const store = useGenerationStore.getState();
    store.saveToPromptLibrary({ prompt: 'funky bass groove', title: 'Funk', tags: [], category: '', metadata: {} });
    store.saveToPromptLibrary({ prompt: 'ambient pad', title: 'Ambient', tags: [], category: '', metadata: {} });

    const results = useGenerationStore.getState().searchPromptLibrary({ search: 'funk' });
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Funk');
  });

  it('getPromptLibraryTags returns all unique tags', () => {
    const store = useGenerationStore.getState();
    store.saveToPromptLibrary({ prompt: 'a', title: 'A', tags: ['rock', 'guitar'], category: '', metadata: {} });
    store.saveToPromptLibrary({ prompt: 'b', title: 'B', tags: ['rock', 'bass'], category: '', metadata: {} });

    const tags = useGenerationStore.getState().getPromptLibraryTags();
    expect(tags.sort()).toEqual(['bass', 'guitar', 'rock']);
  });

  it('exportPromptLibrary produces valid export data', () => {
    useGenerationStore.getState().saveToPromptLibrary({
      prompt: 'test',
      title: 'Test',
      tags: ['tag'],
      category: 'cat',
      metadata: { bpm: 100 },
    });

    const exported = useGenerationStore.getState().exportPromptLibrary();
    expect(exported.version).toBe(1);
    expect(exported.prompts).toHaveLength(1);
    expect(exported.prompts[0].prompt).toBe('test');
  });

  it('importPromptLibrary adds new prompts', () => {
    const importData = {
      version: 1 as const,
      exportedAt: Date.now(),
      prompts: [
        {
          id: 'imp-1',
          prompt: 'imported prompt',
          title: 'Imported',
          tags: ['import'],
          category: 'test',
          isFavorite: false,
          createdAt: Date.now(),
          lastUsedAt: Date.now(),
          useCount: 0,
          metadata: { bpm: 90 },
        },
      ],
    };

    const count = useGenerationStore.getState().importPromptLibrary(importData);
    expect(count).toBe(1);
    expect(useGenerationStore.getState().promptLibrary).toHaveLength(1);
  });
});
