import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { GenerationSidePanel } from '../../src/components/generation/GenerationSidePanel';
import { useUIStore } from '../../src/store/uiStore';
import { useGenerationStore } from '../../src/store/generationStore';
import { useProjectStore } from '../../src/store/projectStore';

vi.mock('../../src/services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

// TODO: These tests targeted the old single-track prompt in GenerationSidePanel.
// The prompt is now in FullSongForm. Migrate tests there.
describe.skip('Prompt Autocomplete in GenerationSidePanel (legacy)', () => {
  beforeEach(() => {
    localStorage.clear();
    useUIStore.setState(useUIStore.getInitialState(), true);
    useGenerationStore.setState(useGenerationStore.getInitialState(), true);
    useProjectStore.setState(useProjectStore.getInitialState(), true);

    useProjectStore.getState().createProject({ name: 'Autocomplete Test', bpm: 120, keyScale: 'C major' });
    useProjectStore.getState().addTrack('drums');
    useUIStore.getState().setShowGenerationPanel(true);
  });

  function getPromptInput() {
    return screen.getByRole('combobox', { name: 'Generation prompt' }) as HTMLTextAreaElement;
  }

  function typeInPrompt(text: string) {
    const input = getPromptInput();
    fireEvent.change(input, { target: { value: text, selectionStart: text.length } });
  }

  it('shows autocomplete suggestions when typing a matching token', () => {
    render(<GenerationSidePanel />);
    typeInPrompt('pian');
    expect(screen.getByTestId('prompt-autocomplete-list')).toBeInTheDocument();
    expect(screen.getByText('piano')).toBeInTheDocument();
  });

  it('does not show suggestions for non-matching text', () => {
    render(<GenerationSidePanel />);
    typeInPrompt('xyzqqq');
    expect(screen.queryByTestId('prompt-autocomplete-list')).not.toBeInTheDocument();
  });

  it('shows category labels next to suggestions', () => {
    render(<GenerationSidePanel />);
    typeInPrompt('pian');
    const list = screen.getByTestId('prompt-autocomplete-list');
    expect(within(list).getAllByText('Instrument').length).toBeGreaterThan(0);
  });

  it('inserts selected suggestion into prompt on Enter', () => {
    render(<GenerationSidePanel />);
    const input = getPromptInput();
    typeInPrompt('pian');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(useGenerationStore.getState().generationForm.prompt).toBe('piano ');
  });

  it('navigates suggestions with ArrowDown and accepts', () => {
    render(<GenerationSidePanel />);
    const input = getPromptInput();
    typeInPrompt('pian');
    // First suggestion should be selected by default (index 0)
    const list = screen.getByTestId('prompt-autocomplete-list');
    const options = within(list).getAllByRole('option');
    expect(options[0]).toHaveAttribute('aria-selected', 'true');

    // Navigate down
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    const updatedOptions = within(screen.getByTestId('prompt-autocomplete-list')).getAllByRole('option');
    expect(updatedOptions.length).toBeGreaterThan(1);
    expect(updatedOptions[1]).toHaveAttribute('aria-selected', 'true');
  });

  it('dismisses autocomplete on Escape', () => {
    render(<GenerationSidePanel />);
    const input = getPromptInput();
    typeInPrompt('jazz');
    expect(screen.getByTestId('prompt-autocomplete-list')).toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByTestId('prompt-autocomplete-list')).not.toBeInTheDocument();
  });

  it('inserts suggestion by mouse click', () => {
    render(<GenerationSidePanel />);
    typeInPrompt('pian');
    const suggestion = screen.getByTestId('prompt-suggestion-0');
    fireEvent.click(suggestion);
    expect(useGenerationStore.getState().generationForm.prompt).toBe('piano ');
  });

  it('replaces only the current token when accepting in the middle of text', () => {
    render(<GenerationSidePanel />);
    const input = getPromptInput();
    // Type "warm pian" — "pian" is the current token
    fireEvent.change(input, { target: { value: 'warm pian', selectionStart: 9 } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(useGenerationStore.getState().generationForm.prompt).toBe('warm piano ');
  });

  it('has correct ARIA attributes on the textarea', () => {
    render(<GenerationSidePanel />);
    const input = getPromptInput();
    expect(input).toHaveAttribute('aria-autocomplete', 'list');
    expect(input).toHaveAttribute('aria-expanded', 'false');

    typeInPrompt('jazz');
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(input).toHaveAttribute('aria-controls', 'prompt-autocomplete-list');
  });

  it('does not interfere with normal text editing when no suggestions match', () => {
    render(<GenerationSidePanel />);
    const input = getPromptInput();
    typeInPrompt('my custom text that matches nothing xyz');
    expect(screen.queryByTestId('prompt-autocomplete-list')).not.toBeInTheDocument();
    expect(useGenerationStore.getState().generationForm.prompt).toBe(
      'my custom text that matches nothing xyz',
    );
  });

  it('suggestions list has correct role=listbox', () => {
    render(<GenerationSidePanel />);
    typeInPrompt('warm');
    const list = screen.getByTestId('prompt-autocomplete-list');
    expect(list).toHaveAttribute('role', 'listbox');
  });

  it('matches known acceptance criteria tokens: lof, warm, analog', () => {
    render(<GenerationSidePanel />);

    typeInPrompt('lof');
    expect(screen.getByTestId('prompt-autocomplete-list')).toBeInTheDocument();

    typeInPrompt('warm');
    const warmList = screen.getByTestId('prompt-autocomplete-list');
    expect(warmList).toBeInTheDocument();
    // "warm" should appear as a suggestion in the autocomplete list
    expect(within(warmList).getAllByRole('option').length).toBeGreaterThan(0);

    typeInPrompt('analog');
    const analogList = screen.getByTestId('prompt-autocomplete-list');
    expect(analogList).toBeInTheDocument();
    expect(within(analogList).getByText('analog')).toBeInTheDocument();
  });
});
