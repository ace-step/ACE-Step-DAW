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
}));

vi.mock('../../../hooks/useAudioEngine', () => ({
  getAudioEngine: () => ({
    previewMetronomeClick: vi.fn(),
  }),
}));

describe('GenerationSidePanel settings entrypoints', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject({ name: 'Settings Tab Test' });
    useProjectStore.getState().addTrack('stems');
    const track = useProjectStore.getState().project!.tracks[0];
    useGenerationStore.setState({
      generationForm: {
        ...createDefaultGenerationFormState(),
        selectedTrackId: track.id,
        prompt: 'test prompt',
      },
      isGenerating: false,
      variationSession: null,
    });
    useUIStore.setState({
      showGenerationPanel: true,
      generationPanelView: 'textToMusic',
    });
  });

  it('opens settings from the header gear inside the unified generate panel', () => {
    render(<GenerationSidePanel />);

    fireEvent.click(screen.getByTestId('generation-panel-settings-trigger'));

    expect(screen.getByTestId('generation-settings-section')).toBeInTheDocument();
    expect(screen.getByText('Model & Backend')).toBeInTheDocument();
    expect(screen.getByText('Generation Defaults')).toBeInTheDocument();
    expect(screen.queryByText('Song Defaults')).not.toBeInTheDocument();
  });

  it('reopens the panel from the dock launcher after collapsing', () => {
    render(<GenerationSidePanel />);

    fireEvent.click(screen.getByTestId('generation-panel-collapse'));
    expect(useUIStore.getState().showGenerationPanel).toBe(false);

    fireEvent.click(screen.getByTestId('generation-dock-app-generate'));
    expect(useUIStore.getState().showGenerationPanel).toBe(true);
  });
});
