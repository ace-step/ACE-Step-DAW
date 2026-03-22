import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { StatusBar } from '../../src/components/layout/StatusBar';
import { useModelStore } from '../../src/store/modelStore';
import { useProjectStore } from '../../src/store/projectStore';
import { useUIStore } from '../../src/store/uiStore';
import { useGenerationStore } from '../../src/store/generationStore';
import { TIMELINE_ZOOM_LEVELS } from '../../src/utils/timelineZoom';

vi.mock('../../src/services/aceStepApi', () => ({
  healthCheck: vi.fn().mockResolvedValue(false),
}));

describe('StatusBar controls', () => {
  beforeEach(() => {
    localStorage.clear();
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    useGenerationStore.setState(useGenerationStore.getInitialState(), true);
    useModelStore.setState({
      availableModels: [],
      availableLmModels: [],
      activeModelId: null,
      activeLmModelId: null,
      pinnedModelIds: [],
      modelLoadingState: 'idle',
      connected: false,
      lastRefreshedAt: 0,
      stats: null,
    });
    useProjectStore.getState().createProject({ name: 'Status Bar Test' });
  });

  it('opens keyboard shortcuts from the bottom-right launcher', () => {
    render(<StatusBar />);

    fireEvent.click(screen.getByTestId('status-shortcuts-trigger'));

    expect(useUIStore.getState().showKeyboardShortcutsDialog).toBe(true);
  });

  it('updates timeline zoom from the bottom-right slider', () => {
    render(<StatusBar />);

    fireEvent.change(screen.getByTestId('status-zoom-slider'), { target: { value: '12' } });

    expect(useUIStore.getState().pixelsPerSecond).toBe(TIMELINE_ZOOM_LEVELS[12]);
  });

  it('collapses to a single meta row when there are no active generation jobs', () => {
    render(<StatusBar />);

    expect(screen.queryByTestId('status-bar-job-row')).not.toBeInTheDocument();
    expect(screen.getByTestId('status-bar-meta-row')).toBeInTheDocument();
    expect(screen.getByTestId('status-connection-indicator')).toBeInTheDocument();
  });

  it('shows a separate job row only when generation is active', () => {
    useGenerationStore.setState({
      jobs: [
        {
          id: 'job-1',
          clipId: 'clip-1',
          trackName: 'Drums',
          status: 'generating',
          progress: 'Generating',
          stage: 'Diffusion',
          progressPercent: 42,
          lastUpdatedAt: Date.now(),
        },
      ],
    });

    render(<StatusBar />);

    expect(screen.getByTestId('status-bar-job-row')).toHaveTextContent('Generating: Drums');
    expect(screen.getByTestId('status-bar-meta-row')).toBeInTheDocument();
  });

  it('falls back to the active loaded model when the project model is empty', () => {
    useModelStore.setState({ activeModelId: 'acestep-v15-base-lego' });

    render(<StatusBar />);

    expect(screen.getByTestId('status-model-name')).toHaveTextContent('acestep-v15-base-lego');
  });
});
