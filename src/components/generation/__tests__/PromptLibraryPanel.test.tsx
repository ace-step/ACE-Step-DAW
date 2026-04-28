import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PromptLibraryPanel } from '../PromptLibraryPanel';
import { useGenerationStore } from '../../../store/generationStore';

describe('PromptLibraryPanel', () => {
  beforeEach(() => {
    // Clear library
    const state = useGenerationStore.getState();
    for (const p of state.promptLibrary) {
      state.deleteFromPromptLibrary(p.id);
    }
  });

  it('shows empty state when no prompts saved', () => {
    render(<PromptLibraryPanel />);

    expect(screen.getByText('No saved prompts yet')).toBeInTheDocument();
    expect(screen.getByText(/Save a prompt from the generation form/)).toBeInTheDocument();
  });

  it('renders saved prompts', () => {
    const store = useGenerationStore.getState();
    store.saveToPromptLibrary({
      prompt: 'Funky bass groove with slap',
      title: 'Funk Bass',
      tags: ['funk', 'bass'],
      category: 'bass',
      metadata: { bpm: 120 },
    });

    render(<PromptLibraryPanel />);

    expect(screen.getByText('Funk Bass')).toBeInTheDocument();
    expect(screen.getByText(/Funky bass groove/)).toBeInTheDocument();
    // Tags rendered as pills
    const tags = screen.getAllByText(/^(funk|bass)$/);
    expect(tags.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('120 BPM')).toBeInTheDocument();
  });

  it('shows prompt count', () => {
    const store = useGenerationStore.getState();
    store.saveToPromptLibrary({ prompt: 'a', title: 'A', tags: [], category: '', metadata: {} });
    store.saveToPromptLibrary({ prompt: 'b', title: 'B', tags: [], category: '', metadata: {} });

    render(<PromptLibraryPanel />);

    expect(screen.getByText('2 prompts')).toBeInTheDocument();
  });

  it('filters prompts by search text', () => {
    const store = useGenerationStore.getState();
    store.saveToPromptLibrary({ prompt: 'Funky bass', title: 'Funk', tags: [], category: '', metadata: {} });
    store.saveToPromptLibrary({ prompt: 'Ambient pad', title: 'Ambient', tags: [], category: '', metadata: {} });

    render(<PromptLibraryPanel />);

    const searchInput = screen.getByPlaceholderText('Search saved prompts...');
    fireEvent.change(searchInput, { target: { value: 'funk' } });

    expect(screen.getByText('Funk')).toBeInTheDocument();
    expect(screen.queryByText('Ambient')).not.toBeInTheDocument();
    expect(screen.getByText('1 prompt')).toBeInTheDocument();
  });

  it('toggles favorites filter', () => {
    const store = useGenerationStore.getState();
    const saved = store.saveToPromptLibrary({
      prompt: 'Favorite prompt',
      title: 'Fav',
      tags: [],
      category: '',
      metadata: {},
    });
    store.saveToPromptLibrary({
      prompt: 'Regular prompt',
      title: 'Regular',
      tags: [],
      category: '',
      metadata: {},
    });
    store.togglePromptLibraryFavorite(saved.id);

    render(<PromptLibraryPanel />);

    // Both visible initially
    expect(screen.getByText('2 prompts')).toBeInTheDocument();

    // Toggle favorites only
    const favCheckbox = screen.getByLabelText('Favorites only');
    fireEvent.click(favCheckbox);

    expect(screen.getByText('1 prompt')).toBeInTheDocument();
    expect(screen.getByText('Fav')).toBeInTheDocument();
  });

  it('deletes a prompt after confirmation', () => {
    const store = useGenerationStore.getState();
    store.saveToPromptLibrary({
      prompt: 'To delete',
      title: 'Delete Me',
      tags: [],
      category: '',
      metadata: {},
    });

    render(<PromptLibraryPanel />);

    expect(screen.getByText('Delete Me')).toBeInTheDocument();

    // First click shows confirmation
    const deleteButton = screen.getByText('Delete');
    fireEvent.click(deleteButton);

    // Confirmation dialog should appear
    expect(screen.getByText(/Delete "Delete Me"\?/)).toBeInTheDocument();

    // Confirm the delete
    const confirmButton = screen.getByText('Confirm');
    fireEvent.click(confirmButton);

    expect(screen.getByText('No saved prompts yet')).toBeInTheDocument();
  });

  it('applies a prompt to the generation form', () => {
    const store = useGenerationStore.getState();
    store.saveToPromptLibrary({
      prompt: 'Apply this one',
      title: 'Apply Test',
      tags: [],
      category: '',
      metadata: { bpm: 140, keyScale: 'E minor' },
    });

    render(<PromptLibraryPanel />);

    const applyButton = screen.getByText('Apply');
    fireEvent.click(applyButton);

    const form = useGenerationStore.getState().generationForm;
    expect(form.prompt).toBe('Apply this one');
    expect(form.bpm).toBe(140);
    expect(form.keyScale).toBe('E minor');
  });

  it('shows no results message when search has no matches', () => {
    const store = useGenerationStore.getState();
    store.saveToPromptLibrary({ prompt: 'test', title: 'Test', tags: [], category: '', metadata: {} });

    render(<PromptLibraryPanel />);

    const searchInput = screen.getByPlaceholderText('Search saved prompts...');
    fireEvent.change(searchInput, { target: { value: 'nonexistent' } });

    expect(screen.getByText('No prompts match your filters')).toBeInTheDocument();
  });

  it('has export button disabled when library is empty', () => {
    render(<PromptLibraryPanel />);

    const exportButton = screen.getByText('Export');
    expect(exportButton).toBeDisabled();
  });

  it('has search input with correct aria label', () => {
    render(<PromptLibraryPanel />);
    expect(screen.getByLabelText('Search prompt library')).toBeInTheDocument();
  });
});
