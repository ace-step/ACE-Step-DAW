import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { GenerationHistoryPanel } from '../GenerationHistoryPanel';
import { useGenerationStore, type GenerationHistoryRecord } from '../../../store/generationStore';
import { useUIStore } from '../../../store/uiStore';
import { Z } from '../../../utils/zIndex';

vi.mock('../../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

function makeHistoryRecord(overrides: Partial<GenerationHistoryRecord> = {}): GenerationHistoryRecord {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    clipId: overrides.clipId ?? null,
    trackId: overrides.trackId ?? null,
    trackName: overrides.trackName ?? 'Lead Vocal',
    prompt: overrides.prompt ?? 'warm chorus',
    model: overrides.model ?? 'ace-step',
    duration: overrides.duration ?? 8,
    status: overrides.status ?? 'done',
    createdAt: overrides.createdAt ?? Date.now(),
    updatedAt: overrides.updatedAt ?? Date.now(),
    startedAt: overrides.startedAt ?? null,
    completedAt: overrides.completedAt ?? null,
    taskId: overrides.taskId,
    audioKey: overrides.audioKey ?? 'audio-key',
    audioDuration: overrides.audioDuration ?? 8,
    error: overrides.error,
  };
}

describe('GenerationHistoryPanel', () => {
  beforeEach(() => {
    useUIStore.setState({
      ...useUIStore.getInitialState(),
      showGenerationHistoryPanel: true,
    }, true);
    useGenerationStore.setState({
      ...useGenerationStore.getInitialState(),
      generationHistory: [],
      previewingHistoryId: null,
    }, true);
  });

  it('refreshes visible entries when generation history changes', async () => {
    useGenerationStore.setState({
      generationHistory: [makeHistoryRecord({ id: 'first', prompt: 'first pass' })],
    });

    render(<GenerationHistoryPanel />);
    expect(screen.getByText('first pass')).toBeDefined();

    await act(async () => {
      useGenerationStore.setState({
        generationHistory: [
          makeHistoryRecord({ id: 'second', prompt: 'new idea', updatedAt: Date.now() + 1 }),
          makeHistoryRecord({ id: 'first', prompt: 'first pass', updatedAt: Date.now() }),
        ],
      });
    });

    expect(screen.getByText('new idea')).toBeDefined();
  });

  it('stops preview when the panel is hidden externally', async () => {
    const stopPreview = vi.fn();
    useGenerationStore.setState({
      stopGenerationHistoryPreview: stopPreview,
      generationHistory: [makeHistoryRecord({ id: 'previewing' })],
      previewingHistoryId: 'previewing',
    });

    render(<GenerationHistoryPanel />);

    await act(async () => {
      useUIStore.getState().setShowGenerationHistoryPanel(false);
    });

    expect(stopPreview).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText('Generation history panel')).toBeNull();
  });

  it('uses the panel z-index token', () => {
    useGenerationStore.setState({
      generationHistory: [makeHistoryRecord()],
    });

    render(<GenerationHistoryPanel />);
    expect(screen.getByLabelText('Generation history panel')).toHaveStyle({ zIndex: `${Z.panel}` });
  });
});
