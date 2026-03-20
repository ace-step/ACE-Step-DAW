import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useProjectStore } from '../../src/store/projectStore';
import { useUIStore } from '../../src/store/uiStore';

const apiMocks = vi.hoisted(() => ({
  listModels: vi.fn(),
  initModel: vi.fn(),
  getStats: vi.fn(),
}));

vi.mock('../../src/services/aceStepApi', () => apiMocks);

describe('ModelLibraryPanel', () => {
  beforeEach(async () => {
    localStorage.clear();
    vi.clearAllMocks();
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    useProjectStore.getState().createProject({ name: 'Model Library Test' });

    const { useModelStore } = await import('../../src/store/modelStore');
    useModelStore.setState(useModelStore.getInitialState(), true);

    apiMocks.listModels.mockResolvedValue({
      models: [
        {
          name: 'ace-step-dit-a',
          is_default: true,
          is_loaded: true,
          supported_task_types: ['lego', 'cover'],
        },
      ],
      default_model: 'ace-step-dit-a',
      lm_models: [
        { name: 'ace-step-lm-a', is_loaded: false },
      ],
      loaded_lm_model: null,
      llm_initialized: false,
    });
    apiMocks.getStats.mockResolvedValue({
      jobs: { total: 5, succeeded: 4, failed: 0, running: 1, queued: 0 },
      queue_size: 0,
      queue_maxsize: 8,
      avg_job_seconds: 10,
    });
    apiMocks.initModel.mockResolvedValue({ message: 'Loaded ace-step-lm-a', loaded_lm_model: 'ace-step-lm-a' });
  });

  it('renders all models, supports pinning, and shows active stats', async () => {
    useUIStore.getState().setShowModelLibrary(true);
    const { ModelLibraryPanel } = await import('../../src/components/models/ModelLibraryPanel');

    render(<ModelLibraryPanel />);

    expect(await screen.findByText('Model Library')).toBeInTheDocument();
    expect(await screen.findByText('ace-step-dit-a')).toBeInTheDocument();
    expect(screen.getByText('ace-step-lm-a')).toBeInTheDocument();
    expect(screen.getByText('lego')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Pin ace-step-lm-a'));
    fireEvent.click(screen.getByRole('tab', { name: 'Pinned' }));
    expect(await screen.findByText('ace-step-lm-a')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Active' }));
    expect(await screen.findByText('Average Job Time')).toBeInTheDocument();
    expect(screen.getByText('10s')).toBeInTheDocument();
  });

  it('loads a model from its card action', async () => {
    useUIStore.getState().setShowModelLibrary(true);
    const { ModelLibraryPanel } = await import('../../src/components/models/ModelLibraryPanel');

    render(<ModelLibraryPanel />);

    fireEvent.click(await screen.findByRole('button', { name: 'Load ace-step-lm-a' }));

    await waitFor(() => {
      expect(apiMocks.initModel).toHaveBeenCalledWith({
        model: 'ace-step-dit-a',
        init_llm: true,
        lm_model_path: 'ace-step-lm-a',
      });
    });
  });
});
