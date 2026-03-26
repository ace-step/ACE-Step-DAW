import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useGenerationStore } from '../../../store/generationStore';
import { useProjectStore } from '../../../store/projectStore';
import { useModelStore } from '../../../store/modelStore';
import { useUIStore } from '../../../store/uiStore';
import { GenerationSidePanel } from '../GenerationSidePanel';

vi.mock('../../../services/generationPipeline', () => ({
  generateVariationSession: vi.fn(),
}));

// TODO: Cross-model comparison was part of the old single-track form. Migrate.
describe.skip('Cross-model UI in GenerationSidePanel (legacy)', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Ensure project and a stems track exist
    useProjectStore.getState().createProject('Test');
    const pStore = useProjectStore.getState();
    const tracks = pStore.project!.tracks.filter((t) => t.trackType === 'stems');
    const trackId = tracks.length > 0 ? tracks[0].id : useProjectStore.getState().addTrack('stems').id;

    useGenerationStore.setState({
      variationSession: null,
      isGenerating: false,
      generationForm: {
        ...useGenerationStore.getState().generationForm,
        prompt: 'test prompt',
        selectedTrackId: trackId,
        variationCount: 2,
        compareModelsEnabled: false,
        compareModelOverrides: [],
      },
    });

    useModelStore.setState({
      availableModels: [
        { name: 'ace-step-v1', is_default: true, is_loaded: true },
        { name: 'ace-step-v2', is_default: false, is_loaded: false },
        { name: 'ace-step-v3', is_default: false, is_loaded: false },
      ],
      activeModelId: 'ace-step-v1',
    });

    useUIStore.getState().setShowGenerationPanel(true);
  });

  it('renders the Compare Models toggle', () => {
    render(<GenerationSidePanel />);
    const toggle = screen.getByTestId('compare-models-toggle');
    expect(toggle).toBeDefined();
  });

  it('shows model selectors when Compare Models is enabled', () => {
    useGenerationStore.getState().setCompareModelsEnabled(true);
    render(<GenerationSidePanel />);
    const selectors = screen.getAllByTestId(/^compare-model-select-/);
    expect(selectors.length).toBe(2); // variationCount = 2
  });

  it('hides model selectors when Compare Models is disabled', () => {
    useGenerationStore.getState().setCompareModelsEnabled(false);
    render(<GenerationSidePanel />);
    const selectors = screen.queryAllByTestId(/^compare-model-select-/);
    expect(selectors.length).toBe(0);
  });

  it('shows model name badge on variation cards in cross-model session', () => {
    // Set up a completed cross-model session
    useGenerationStore.setState({
      variationSession: {
        id: 'session-1',
        prompt: 'test',
        trackId: 'track-1',
        variations: [
          { index: 0, status: 'done', clipId: 'clip-1', progress: '', modelName: 'ace-step-v1' },
          { index: 1, status: 'done', clipId: 'clip-2', progress: '', modelName: 'ace-step-v2' },
        ],
        activeVariationIndex: 0,
        status: 'done',
        params: {
          prompt: 'test',
          trackId: 'track-1',
          variationCount: 2,
          bpm: 120,
          keyScale: 'C major',
          duration: 30,
          guidanceScale: 7.0,
          comparisonMode: 'cross-model',
          modelOverrides: [
            { modelName: 'ace-step-v1' },
            { modelName: 'ace-step-v2' },
          ],
        },
        createdAt: Date.now(),
      },
    });

    render(<GenerationSidePanel />);
    const badges = screen.getAllByTestId(/^variation-model-badge-/);
    expect(badges.length).toBe(2);
    expect(badges[0].textContent).toContain('ace-step-v1');
    expect(badges[1].textContent).toContain('ace-step-v2');
  });
});
