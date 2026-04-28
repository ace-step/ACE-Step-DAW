import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SavePromptDialog } from '../SavePromptDialog';
import { useGenerationStore } from '../../../store/generationStore';

describe('SavePromptDialog', () => {
  const mockOnClose = vi.fn();

  beforeEach(() => {
    mockOnClose.mockClear();
    // Clear library
    const state = useGenerationStore.getState();
    for (const p of state.promptLibrary) {
      state.deleteFromPromptLibrary(p.id);
    }
  });

  it('renders nothing when closed', () => {
    const { container } = render(
      <SavePromptDialog open={false} onClose={mockOnClose} initialPrompt="test" />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders dialog when open', () => {
    render(
      <SavePromptDialog open={true} onClose={mockOnClose} initialPrompt="A funky bass line" />,
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Save to Prompt Library')).toBeInTheDocument();
  });

  it('pre-fills prompt from initialPrompt', () => {
    render(
      <SavePromptDialog open={true} onClose={mockOnClose} initialPrompt="Dreamy synth pad" />,
    );

    const textarea = screen.getByPlaceholderText('Describe the music...');
    expect(textarea).toHaveValue('Dreamy synth pad');
  });

  it('saves prompt to library on Save click', () => {
    render(
      <SavePromptDialog
        open={true}
        onClose={mockOnClose}
        initialPrompt="Rock guitar riff"
        initialMetadata={{ bpm: 140, keyScale: 'E minor' }}
      />,
    );

    // Click Save
    fireEvent.click(screen.getByText('Save'));

    // Check library
    const library = useGenerationStore.getState().promptLibrary;
    expect(library).toHaveLength(1);
    expect(library[0].prompt).toBe('Rock guitar riff');
    expect(library[0].metadata.bpm).toBe(140);

    // Dialog should close
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('disables Save when prompt is empty', () => {
    render(
      <SavePromptDialog open={true} onClose={mockOnClose} initialPrompt="" />,
    );

    const saveButton = screen.getByRole('button', { name: 'Save' });
    expect(saveButton).toBeDisabled();
  });

  it('adds and removes tags', () => {
    render(
      <SavePromptDialog open={true} onClose={mockOnClose} initialPrompt="test" />,
    );

    // Type a tag and press Enter
    const tagInput = screen.getByPlaceholderText('Type and press Enter to add tags');
    fireEvent.change(tagInput, { target: { value: 'funk' } });
    fireEvent.keyDown(tagInput, { key: 'Enter' });

    // Tag should appear
    expect(screen.getByText('funk')).toBeInTheDocument();

    // Remove tag
    const removeButton = screen.getByLabelText('Remove tag funk');
    fireEvent.click(removeButton);

    // Tag should be gone
    expect(screen.queryByText('funk')).not.toBeInTheDocument();
  });

  it('closes on Cancel', () => {
    render(
      <SavePromptDialog open={true} onClose={mockOnClose} initialPrompt="test" />,
    );

    fireEvent.click(screen.getByText('Cancel'));
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('shows suggested tags that can be clicked to add', () => {
    render(
      <SavePromptDialog open={true} onClose={mockOnClose} initialPrompt="test" />,
    );

    // Common tags should be visible as suggestions
    const rockButton = screen.getByText('+ rock');
    fireEvent.click(rockButton);

    // Tag should now be in the tag list
    expect(screen.getByText('rock')).toBeInTheDocument();
  });

  it('normalizes initial style tags before rendering and saving', () => {
    render(
      <SavePromptDialog
        open={true}
        onClose={mockOnClose}
        initialPrompt="Layered guitar hook"
        initialMetadata={{ styleTags: ['Rock', ' rock ', 'GUITAR'] }}
      />,
    );

    expect(screen.getByText('rock')).toBeInTheDocument();
    expect(screen.getByText('guitar')).toBeInTheDocument();
    expect(screen.queryByText('Rock')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Save'));
    const saved = useGenerationStore.getState().promptLibrary[0];
    expect(saved.tags).toEqual(['rock', 'guitar']);
    expect(saved.metadata.styleTags).toEqual(['rock', 'guitar']);
  });

  it('persists edited tags as reusable style metadata', () => {
    render(
      <SavePromptDialog
        open={true}
        onClose={mockOnClose}
        initialPrompt="Layered guitar hook"
        initialMetadata={{ styleTags: ['rock'] }}
      />,
    );

    fireEvent.click(screen.getByLabelText('Remove tag rock'));
    const tagInput = screen.getByPlaceholderText('Type and press Enter to add tags');
    fireEvent.change(tagInput, { target: { value: 'ambient' } });
    fireEvent.keyDown(tagInput, { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    const saved = useGenerationStore.getState().promptLibrary[0];
    expect(saved.tags).toEqual(['ambient']);
    expect(saved.metadata.styleTags).toEqual(['ambient']);
  });

  it('does not reset draft fields when metadata props change while open', () => {
    const { rerender } = render(
      <SavePromptDialog
        open={true}
        onClose={mockOnClose}
        initialPrompt="Layered guitar hook"
        initialMetadata={{ styleTags: ['rock'] }}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('Auto-generated from prompt if empty'), {
      target: { value: 'Draft title' },
    });
    fireEvent.change(screen.getByPlaceholderText('Type and press Enter to add tags'), {
      target: { value: 'ambient' },
    });

    rerender(
      <SavePromptDialog
        open={true}
        onClose={mockOnClose}
        initialPrompt="Layered guitar hook"
        initialMetadata={{ styleTags: ['rock', 'guitar'] }}
      />,
    );

    expect(screen.getByPlaceholderText('Auto-generated from prompt if empty')).toHaveValue('Draft title');
    expect(screen.getByPlaceholderText('Type and press Enter to add tags')).toHaveValue('ambient');
    expect(screen.queryByText('guitar')).not.toBeInTheDocument();
  });

  it('shows metadata summary when provided', () => {
    render(
      <SavePromptDialog
        open={true}
        onClose={mockOnClose}
        initialPrompt="test"
        initialMetadata={{ bpm: 120, keyScale: 'C major' }}
      />,
    );

    expect(screen.getByText(/BPM 120/)).toBeInTheDocument();
    expect(screen.getByText(/Key C major/)).toBeInTheDocument();
  });
});
