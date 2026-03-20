import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { GenerationHistoryPanel } from '../../src/components/generation/GenerationHistoryPanel';
import { useGenerationStore } from '../../src/store/generationStore';
import { useProjectStore } from '../../src/store/projectStore';
import { useUIStore } from '../../src/store/uiStore';

describe('GenerationHistoryPanel', () => {
  beforeEach(() => {
    localStorage.clear();
    useGenerationStore.setState(useGenerationStore.getInitialState(), true);
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    useProjectStore.getState().createProject({ name: 'History Panel Test' });
    useUIStore.getState().setShowGenerationHistoryPanel(true);

    const now = Date.now();
    useGenerationStore.getState().upsertGenerationHistoryRecord({
      clipId: 'clip-1',
      trackId: 'track-1',
      trackName: 'Drums',
      prompt: 'Dusty boom bap drums',
      model: 'ace-v1',
      duration: 16,
      status: 'done',
      createdAt: now,
      updatedAt: now,
      completedAt: now,
      audioKey: 'audio-1',
    });
    useGenerationStore.getState().upsertGenerationHistoryRecord({
      clipId: 'clip-2',
      trackId: 'track-2',
      trackName: 'Bass',
      prompt: 'Sub bass glide test',
      model: 'ace-v2',
      duration: 12,
      status: 'error',
      createdAt: now - (10 * 24 * 60 * 60 * 1000),
      updatedAt: now - (10 * 24 * 60 * 60 * 1000),
      error: 'Timed out',
    });
  });

  it('filters history entries by search query, model, and time range', () => {
    render(<GenerationHistoryPanel />);

    expect(screen.getByText('Dusty boom bap drums')).toBeInTheDocument();
    expect(screen.getByText('Sub bass glide test')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search generation history' }), {
      target: { value: 'dusty' },
    });
    expect(screen.getByText('Dusty boom bap drums')).toBeInTheDocument();
    expect(screen.queryByText('Sub bass glide test')).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search generation history' }), {
      target: { value: '' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter history by model' }), {
      target: { value: 'ace-v2' },
    });
    expect(screen.queryByText('Dusty boom bap drums')).not.toBeInTheDocument();
    expect(screen.getByText('Sub bass glide test')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox', { name: 'Filter history by model' }), {
      target: { value: 'all' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter history by time range' }), {
      target: { value: '7d' },
    });
    expect(screen.getByText('Dusty boom bap drums')).toBeInTheDocument();
    expect(screen.queryByText('Sub bass glide test')).not.toBeInTheDocument();
  });

  it('routes preview clicks through the store action', () => {
    const previewGenerationHistory = vi.fn(async () => true);
    useGenerationStore.setState({ previewGenerationHistory });

    render(<GenerationHistoryPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Preview generation Dusty boom bap drums' }));

    expect(previewGenerationHistory).toHaveBeenCalledWith(
      useGenerationStore.getState().generationHistory[0].id,
    );
  });

  it('marks completed entries as draggable timeline sources', () => {
    render(<GenerationHistoryPanel />);

    const entry = screen.getByTestId(`generation-history-entry-${useGenerationStore.getState().generationHistory[0].id}`);
    const setData = vi.fn();
    const dataTransfer = {
      setData,
      effectAllowed: '',
    };

    fireEvent.dragStart(entry, { dataTransfer });

    expect(setData).toHaveBeenCalledWith(
      'application/x-generation-history-id',
      useGenerationStore.getState().generationHistory[0].id,
    );
  });

  it('shows preview and drag affordances only for completed generations with audio', () => {
    render(<GenerationHistoryPanel />);

    const doneEntry = within(screen.getByTestId(
      `generation-history-entry-${useGenerationStore.getState().generationHistory.find((entry) => entry.status === 'done')?.id}`,
    ));
    const errorEntry = within(screen.getByTestId(
      `generation-history-entry-${useGenerationStore.getState().generationHistory.find((entry) => entry.status === 'error')?.id}`,
    ));

    expect(doneEntry.getByRole('button', { name: /Preview generation/i })).toBeInTheDocument();
    expect(errorEntry.queryByRole('button', { name: /Preview generation/i })).not.toBeInTheDocument();
  });
});
