import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { GenerationSidePanel } from '../GenerationSidePanel';
import { useProjectStore } from '../../../store/projectStore';
import { useUIStore } from '../../../store/uiStore';
import { useGenerationStore, createDefaultGenerationFormState } from '../../../store/generationStore';

vi.mock('../../../services/generationPipeline', () => ({
  generateVariationSession: vi.fn().mockResolvedValue(true),
  generateFromGenerationPanel: vi.fn().mockResolvedValue(undefined),
  generateText2Music: vi.fn().mockResolvedValue({ succeeded: true }),
  regenerateClip: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../services/lazyContextAudioExtractor', () => ({
  extractContextAudioLazy: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

vi.mock('../../../services/aceStepApi', () => ({
  listModels: vi.fn().mockResolvedValue({ models: [], lm_models: [], default_model: null, loaded_lm_model: null, llm_initialized: false }),
  initModel: vi.fn().mockResolvedValue({ message: 'ok' }),
  getBackendUrl: vi.fn().mockReturnValue(''),
  setBackendUrl: vi.fn(),
  formatInput: vi.fn().mockResolvedValue({}),
  createRandomSample: vi.fn().mockResolvedValue({}),
}));

vi.mock('../../../hooks/useAudioEngine', () => ({
  getAudioEngine: () => ({
    previewMetronomeClick: vi.fn(),
  }),
}));

function setupStoreAndRender() {
  useProjectStore.setState({ project: null });
  useProjectStore.getState().createProject({ name: 'Negative Prompt Test' });
  useGenerationStore.setState({
    generationForm: createDefaultGenerationFormState(),
    isGenerating: false,
    variationSession: null,
  });
  useUIStore.setState({
    showGenerationPanel: true,
    generationPanelView: 'fullSong',
    mainView: 'arrangement',
    activeBottomPanel: null,
    showMixer: false,
    showSettingsDialog: false,
    showSmartControls: false,
    batchGenerateMode: null,
  });

  render(<GenerationSidePanel />);

  // Switch from Simple to Custom mode to render FullSongForm
  const customBtn = screen.getByTestId('mix-submode-custom');
  fireEvent.click(customBtn);
}

describe('Negative Prompt — FullSongForm UI', () => {
  beforeEach(() => {
    setupStoreAndRender();
  });

  it('renders the negative prompt toggle button', () => {
    expect(screen.getByText('Negative Prompt')).toBeInTheDocument();
  });

  it('negative prompt section is collapsed by default', () => {
    expect(screen.queryByTestId('negative-prompt-input')).not.toBeInTheDocument();
  });

  it('expands negative prompt section on click', () => {
    fireEvent.click(screen.getByText('Negative Prompt'));
    expect(screen.getByTestId('negative-prompt-input')).toBeInTheDocument();
  });

  it('typing in negative prompt updates the store', () => {
    fireEvent.click(screen.getByText('Negative Prompt'));
    const input = screen.getByTestId('negative-prompt-input');
    fireEvent.change(input, { target: { value: 'no autotune, no reverb' } });
    expect(useGenerationStore.getState().generationForm.negativePrompt).toBe('no autotune, no reverb');
  });

  it('suggestion chips are visible when section is expanded', () => {
    fireEvent.click(screen.getByText('Negative Prompt'));
    expect(screen.getByText('no autotune')).toBeInTheDocument();
    expect(screen.getByText('no reverb')).toBeInTheDocument();
    expect(screen.getByText('no distortion')).toBeInTheDocument();
    expect(screen.getByText('no falsetto')).toBeInTheDocument();
    expect(screen.getByText('no guitar solo')).toBeInTheDocument();
    expect(screen.getByText('no background vocals')).toBeInTheDocument();
  });

  it('clicking a suggestion chip adds it to the negative prompt', () => {
    fireEvent.click(screen.getByText('Negative Prompt'));
    fireEvent.click(screen.getByText('no autotune'));
    expect(useGenerationStore.getState().generationForm.negativePrompt).toBe('no autotune');
  });

  it('clicking an active chip removes it from the negative prompt', () => {
    // Pre-set negative prompt via store
    useGenerationStore.getState().setGenerationNegativePrompt('no distortion');
    // Expand section
    fireEvent.click(screen.getByText('Negative Prompt'));
    // Verify the section expanded and chips are visible
    expect(screen.getByTestId('negative-prompt-input')).toBeInTheDocument();
    // Find the "no distortion" chip button (not the textarea text)
    const chipButtons = screen.getAllByRole('button').filter((btn) => btn.textContent === 'no distortion');
    expect(chipButtons.length).toBeGreaterThan(0);
    fireEvent.click(chipButtons[0]);
    expect(useGenerationStore.getState().generationForm.negativePrompt.trim()).toBe('');
  });
});

describe('Negative Prompt — collapsed indicator', () => {
  it('shows "active" indicator when section is collapsed after adding content', () => {
    // Render with default (empty) negative prompt
    setupStoreAndRender();
    // Expand and add content
    fireEvent.click(screen.getByText('Negative Prompt'));
    const input = screen.getByTestId('negative-prompt-input');
    fireEvent.change(input, { target: { value: 'no reverb' } });
    // Collapse the section
    fireEvent.click(screen.getByText('Negative Prompt'));
    // "active" indicator should be visible
    expect(screen.getByText('active')).toBeInTheDocument();
  });
});
