import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { ModelLibraryPanel } from '../ModelLibraryPanel';
import { useModelStore } from '../../../store/modelStore';
import { useUIStore } from '../../../store/uiStore';

vi.mock('../../../services/aceStepApi', () => ({
  listModels: vi.fn().mockResolvedValue({ models: [], default_model: null, lm_models: [], loaded_lm_model: null, llm_initialized: false }),
  initModel: vi.fn(),
  getStats: vi.fn().mockResolvedValue({ jobs: { total: 0, succeeded: 0, failed: 0, running: 0, queued: 0 }, queue_size: 0, queue_maxsize: 10, avg_job_seconds: 0 }),
}));
vi.mock('../../../services/projectStorage', () => ({ saveProject: vi.fn() }));

function setup() {
  useUIStore.setState({ showModelLibrary: true });
  useModelStore.setState({
    availableModels: [
      { name: 'ace-step-v1', is_default: true, is_loaded: true, supported_task_types: ['lego', 'cover'] },
      { name: 'ace-step-v2', is_default: false, is_loaded: false, supported_task_types: ['lego', 'cover', 'repaint'] },
      { name: 'special-model', is_default: false, is_loaded: false, supported_task_types: ['lego'] },
    ],
    availableLmModels: [{ name: 'llm-v1', is_loaded: true }],
    activeModelId: 'ace-step-v1',
    activeLmModelId: 'llm-v1',
    pinnedModelIds: ['ace-step-v2'],
    modelLoadingState: 'idle',
    connected: true,
    lastRefreshedAt: Date.now(),
    stats: null,
    // Provide no-op implementations so useEffect cleanup works without act() warnings
    startPolling: () => () => {},
    fetchStats: vi.fn().mockResolvedValue(undefined),
  });
}

describe('ModelLibraryPanel', () => {
  beforeEach(() => { setup(); });

  it('renders nothing when false', () => {
    useUIStore.setState({ showModelLibrary: false });
    const { container } = render(<ModelLibraryPanel />);
    expect(container.innerHTML).toBe('');
  });

  it('renders when true', async () => {
    await act(async () => { render(<ModelLibraryPanel />); });
    expect(screen.getByTestId('model-library-panel')).toBeInTheDocument();
  });

  it('shows all models', async () => {
    await act(async () => { render(<ModelLibraryPanel />); });
    expect(screen.getByText('ace-step-v1')).toBeInTheDocument();
    expect(screen.getByText('ace-step-v2')).toBeInTheDocument();
    expect(screen.getByText('special-model')).toBeInTheDocument();
  });

  it('filters by search', async () => {
    await act(async () => { render(<ModelLibraryPanel />); });
    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'special' } });
    });
    expect(screen.getByText('special-model')).toBeInTheDocument();
    expect(screen.queryByText('ace-step-v1')).not.toBeInTheDocument();
  });

  it('shows pinned tab', async () => {
    await act(async () => { render(<ModelLibraryPanel />); });
    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: /pinned/i }));
    });
    expect(screen.getByText('ace-step-v2')).toBeInTheDocument();
    expect(screen.queryByText('ace-step-v1')).not.toBeInTheDocument();
  });

  it('shows active tab', async () => {
    await act(async () => { render(<ModelLibraryPanel />); });
    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: /active/i }));
    });
    await waitFor(() => {
      expect(screen.getByText('ace-step-v1')).toBeInTheDocument();
    });
    expect(screen.getByText('lego')).toBeInTheDocument();
  });

  it('shows LM in active tab', async () => {
    await act(async () => { render(<ModelLibraryPanel />); });
    await act(async () => {
      fireEvent.click(screen.getByRole('tab', { name: /active/i }));
    });
    await waitFor(() => {
      expect(screen.getByText('llm-v1')).toBeInTheDocument();
    });
  });

  it('closes panel', async () => {
    await act(async () => { render(<ModelLibraryPanel />); });
    await act(async () => {
      fireEvent.click(screen.getByTestId('model-library-close'));
    });
    expect(useUIStore.getState().showModelLibrary).toBe(false);
  });
});
