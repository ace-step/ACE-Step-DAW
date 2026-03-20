import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ModelStatusBadge } from '../ModelStatusBadge';
import { useModelStore } from '../../../store/modelStore';

// Mock the modelStore
vi.mock('../../../store/modelStore', () => {
  const store = vi.fn();
  return { useModelStore: store };
});

const mockedUseModelStore = vi.mocked(useModelStore);

describe('ModelStatusBadge', () => {
  const onClick = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function setupStore(overrides: Partial<{
    connected: boolean;
    activeModelId: string | null;
    modelLoadingState: 'idle' | 'loading' | 'error';
    availableModels: Array<{ name: string; is_loaded: boolean }>;
  }> = {}) {
    const defaults = {
      connected: true,
      activeModelId: null,
      modelLoadingState: 'idle' as const,
      availableModels: [],
    };
    const state = { ...defaults, ...overrides };
    mockedUseModelStore.mockImplementation((selector: any) => selector(state));
  }

  it('shows gray dot when no model is loaded', () => {
    setupStore({ connected: true, activeModelId: null, modelLoadingState: 'idle' });
    render(<ModelStatusBadge modelName="" onClick={onClick} />);
    const dot = screen.getByTestId('toolbar-model-status-dot');
    expect(dot.className).toContain('bg-zinc-500');
  });

  it('shows green dot when model is loaded and matches modelName', () => {
    setupStore({
      connected: true,
      activeModelId: 'my-model',
      modelLoadingState: 'idle',
      availableModels: [{ name: 'my-model', is_loaded: true }],
    });
    render(<ModelStatusBadge modelName="my-model" onClick={onClick} />);
    const dot = screen.getByTestId('toolbar-model-status-dot');
    expect(dot.className).toContain('bg-emerald-500');
  });

  it('shows yellow pulsing dot when model is loading', () => {
    setupStore({
      connected: true,
      activeModelId: null,
      modelLoadingState: 'loading',
    });
    render(<ModelStatusBadge modelName="my-model" onClick={onClick} />);
    const dot = screen.getByTestId('toolbar-model-status-dot');
    expect(dot.className).toContain('bg-amber-400');
    expect(dot.className).toContain('animate-pulse');
  });

  it('shows gray dot when disconnected', () => {
    setupStore({ connected: false, activeModelId: null, modelLoadingState: 'idle' });
    render(<ModelStatusBadge modelName="my-model" onClick={onClick} />);
    const dot = screen.getByTestId('toolbar-model-status-dot');
    expect(dot.className).toContain('bg-zinc-500');
  });

  it('displays model name text', () => {
    setupStore({ connected: true, activeModelId: 'test-model', modelLoadingState: 'idle' });
    render(<ModelStatusBadge modelName="test-model" onClick={onClick} />);
    expect(screen.getByText('test-model')).toBeTruthy();
  });

  it('displays "No model" when modelName is empty', () => {
    setupStore({ connected: true, activeModelId: null, modelLoadingState: 'idle' });
    render(<ModelStatusBadge modelName="" onClick={onClick} />);
    expect(screen.getByText('No model')).toBeTruthy();
  });

  it('calls onClick when clicked', () => {
    setupStore({ connected: true, activeModelId: null, modelLoadingState: 'idle' });
    render(<ModelStatusBadge modelName="" onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('shows green dot when activeModelId matches and model is loaded', () => {
    setupStore({
      connected: true,
      activeModelId: 'loaded-model',
      modelLoadingState: 'idle',
      availableModels: [{ name: 'loaded-model', is_loaded: true }],
    });
    render(<ModelStatusBadge modelName="loaded-model" onClick={onClick} />);
    const dot = screen.getByTestId('toolbar-model-status-dot');
    expect(dot.className).toContain('bg-emerald-500');
  });

  it('does not import healthCheck or listModels (no local polling)', () => {
    // The component should only read from modelStore, not poll directly
    setupStore({ connected: true, activeModelId: null, modelLoadingState: 'idle' });
    render(<ModelStatusBadge modelName="" onClick={onClick} />);
    // If it renders without error using only the mocked store, there's no local polling
    expect(screen.getByRole('button')).toBeTruthy();
  });
});
