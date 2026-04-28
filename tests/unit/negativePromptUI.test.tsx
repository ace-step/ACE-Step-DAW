import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { FullSongForm } from '../../src/components/generation/FullSongForm';
import { useGenerationStore } from '../../src/store/generationStore';
import { useProjectStore } from '../../src/store/projectStore';
import { useUIStore } from '../../src/store/uiStore';

vi.mock('../../src/services/generationPipeline', () => ({
  generateText2Music: vi.fn(() => Promise.resolve({ succeeded: true })),
  regenerateClip: vi.fn(() => Promise.resolve()),
}));

vi.mock('../../src/services/aceStepApi', () => ({
  formatInput: vi.fn(() => Promise.resolve({})),
  createRandomSample: vi.fn(() => Promise.resolve({})),
}));

describe('FullSongForm — negative prompt UI', () => {
  const noop = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useGenerationStore.setState(useGenerationStore.getInitialState(), true);
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);

    useProjectStore.getState().createProject({ name: 'Test', bpm: 120, keyScale: 'C major' });
  });

  it('renders the negative prompt toggle button', () => {
    render(<FullSongForm onFooterChange={noop} />);
    expect(screen.getByTestId('negative-prompt-toggle')).toBeInTheDocument();
  });

  it('hides negative prompt textarea by default', () => {
    render(<FullSongForm onFooterChange={noop} />);
    expect(screen.queryByTestId('negative-prompt-input')).not.toBeInTheDocument();
  });

  it('shows negative prompt textarea when toggle is clicked', () => {
    render(<FullSongForm onFooterChange={noop} />);
    fireEvent.click(screen.getByTestId('negative-prompt-toggle'));
    expect(screen.getByTestId('negative-prompt-input')).toBeInTheDocument();
  });

  it('updates store when typing in negative prompt', () => {
    render(<FullSongForm onFooterChange={noop} />);
    fireEvent.click(screen.getByTestId('negative-prompt-toggle'));

    const textarea = screen.getByTestId('negative-prompt-input');
    fireEvent.change(textarea, { target: { value: 'no reverb' } });

    expect(useGenerationStore.getState().generationForm.negativePrompt).toBe('no reverb');
  });

  it('shows "active" badge when negative prompt has content but section is collapsed', () => {
    useGenerationStore.getState().setGenerationNegativePrompt('no autotune');

    // Re-render with pre-filled negative prompt — section auto-expands
    const { unmount } = render(<FullSongForm onFooterChange={noop} />);
    // The section should be expanded since negativePrompt is non-empty
    expect(screen.getByTestId('negative-prompt-input')).toBeInTheDocument();

    // Collapse it
    fireEvent.click(screen.getByTestId('negative-prompt-toggle'));
    expect(screen.queryByTestId('negative-prompt-input')).not.toBeInTheDocument();

    // Active badge should appear
    expect(screen.getByText(/active/)).toBeInTheDocument();

    unmount();
  });

  it('auto-expands negative prompt section when store has content', () => {
    useGenerationStore.getState().setGenerationNegativePrompt('no distortion');
    render(<FullSongForm onFooterChange={noop} />);
    expect(screen.getByTestId('negative-prompt-input')).toBeInTheDocument();
    expect(screen.getByTestId('negative-prompt-input')).toHaveValue('no distortion');
  });
});
