import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ModelLibraryPanel } from '../ModelLibraryPanel';
import { useModelStore } from '../../../store/modelStore';
import { useUIStore } from '../../../store/uiStore';

vi.mock('../../../services/aceStepApi', () => ({ listModels: vi.fn().mockResolvedValue({ models: [], default_model: null, lm_models: [], loaded_lm_model: null, llm_initialized: false }), initModel: vi.fn(), getStats: vi.fn() }));
vi.mock('../../../services/projectStorage', () => ({ saveProject: vi.fn() }));

function setup() {
  useUIStore.setState({ showModelLibrary: true });
  useModelStore.setState({ availableModels: [{ name: 'ace-step-v1', is_default: true, is_loaded: true, supported_task_types: ['lego', 'cover'] }, { name: 'ace-step-v2', is_default: false, is_loaded: false, supported_task_types: ['lego', 'cover', 'repaint'] }, { name: 'special-model', is_default: false, is_loaded: false, supported_task_types: ['lego'] }], availableLmModels: [{ name: 'llm-v1', is_loaded: true }], activeModelId: 'ace-step-v1', activeLmModelId: 'llm-v1', pinnedModelIds: ['ace-step-v2'], modelLoadingState: 'idle', connected: true, lastRefreshedAt: Date.now(), stats: null });
}

describe('ModelLibraryPanel', () => {
  beforeEach(() => { setup(); });
  it('renders nothing when false', () => { useUIStore.setState({ showModelLibrary: false }); const { container } = render(<ModelLibraryPanel />); expect(container.innerHTML).toBe(''); });
  it('renders when true', () => { render(<ModelLibraryPanel />); expect(screen.getByTestId('model-library-panel')).toBeInTheDocument(); });
  it('shows all models', () => { render(<ModelLibraryPanel />); expect(screen.getByText('ace-step-v1')).toBeInTheDocument(); expect(screen.getByText('ace-step-v2')).toBeInTheDocument(); expect(screen.getByText('special-model')).toBeInTheDocument(); });
  it('filters by search', () => { render(<ModelLibraryPanel />); fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'special' } }); expect(screen.getByText('special-model')).toBeInTheDocument(); expect(screen.queryByText('ace-step-v1')).not.toBeInTheDocument(); });
  it('shows pinned tab', () => { render(<ModelLibraryPanel />); fireEvent.click(screen.getByRole('tab', { name: /pinned/i })); expect(screen.getByText('ace-step-v2')).toBeInTheDocument(); expect(screen.queryByText('ace-step-v1')).not.toBeInTheDocument(); });
  it('shows active tab', () => { render(<ModelLibraryPanel />); fireEvent.click(screen.getByRole('tab', { name: /active/i })); expect(screen.getByText('ace-step-v1')).toBeInTheDocument(); expect(screen.getByText('lego')).toBeInTheDocument(); });
  it('shows LM in active tab', () => { render(<ModelLibraryPanel />); fireEvent.click(screen.getByRole('tab', { name: /active/i })); expect(screen.getByText('llm-v1')).toBeInTheDocument(); });
  it('closes panel', () => { render(<ModelLibraryPanel />); fireEvent.click(screen.getByTestId('model-library-close')); expect(useUIStore.getState().showModelLibrary).toBe(false); });
});
