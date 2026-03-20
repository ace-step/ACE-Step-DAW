import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ModelCard } from '../ModelCard';
import type { ModelEntry } from '../../../types/api';

describe('ModelCard', () => {
  const loaded: ModelEntry = { name: 'ace-step-v1', is_default: true, is_loaded: true, supported_task_types: ['lego', 'cover'] };
  const unloaded: ModelEntry = { name: 'ace-step-v2', is_default: false, is_loaded: false, supported_task_types: ['lego', 'cover', 'repaint'] };

  it('renders model name', () => { render(<ModelCard model={loaded} isPinned={false} isLoading={false} onLoad={vi.fn()} onTogglePin={vi.fn()} />); expect(screen.getByText('ace-step-v1')).toBeInTheDocument(); });
  it('shows green status dot for loaded model', () => { render(<ModelCard model={loaded} isPinned={false} isLoading={false} onLoad={vi.fn()} onTogglePin={vi.fn()} />); expect(screen.getByTestId('model-status-dot').className).toContain('bg-emerald'); });
  it('shows gray status dot for unloaded model', () => { render(<ModelCard model={unloaded} isPinned={false} isLoading={false} onLoad={vi.fn()} onTogglePin={vi.fn()} />); expect(screen.getByTestId('model-status-dot').className).toContain('bg-zinc'); });
  it('renders task type badges', () => { render(<ModelCard model={unloaded} isPinned={false} isLoading={false} onLoad={vi.fn()} onTogglePin={vi.fn()} />); expect(screen.getByText('lego')).toBeInTheDocument(); expect(screen.getByText('cover')).toBeInTheDocument(); expect(screen.getByText('repaint')).toBeInTheDocument(); });
  it('disables Load button when loaded', () => { render(<ModelCard model={loaded} isPinned={false} isLoading={false} onLoad={vi.fn()} onTogglePin={vi.fn()} />); expect(screen.getByRole('button', { name: /loaded/i })).toBeDisabled(); });
  it('calls onLoad when clicked', () => { const onLoad = vi.fn(); render(<ModelCard model={unloaded} isPinned={false} isLoading={false} onLoad={onLoad} onTogglePin={vi.fn()} />); fireEvent.click(screen.getByRole('button', { name: /load/i })); expect(onLoad).toHaveBeenCalledWith('ace-step-v2'); });
  it('shows spinner when loading', () => { render(<ModelCard model={unloaded} isPinned={false} isLoading={true} onLoad={vi.fn()} onTogglePin={vi.fn()} />); expect(screen.getByTestId('model-loading-spinner')).toBeInTheDocument(); });
  it('calls onTogglePin', () => { const fn = vi.fn(); render(<ModelCard model={loaded} isPinned={false} isLoading={false} onLoad={vi.fn()} onTogglePin={fn} />); fireEvent.click(screen.getByTestId('model-pin-button')); expect(fn).toHaveBeenCalledWith('ace-step-v1'); });
  it('shows filled star when pinned', () => { render(<ModelCard model={loaded} isPinned={true} isLoading={false} onLoad={vi.fn()} onTogglePin={vi.fn()} />); expect(screen.getByTestId('model-pin-button').textContent).toContain('\u2605'); });
  it('shows default badge', () => { render(<ModelCard model={loaded} isPinned={false} isLoading={false} onLoad={vi.fn()} onTogglePin={vi.fn()} />); expect(screen.getByText('default')).toBeInTheDocument(); });
});
