import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ClipBlock } from '../../src/components/timeline/ClipBlock';
import { useProjectStore } from '../../src/store/projectStore';
import { useUIStore } from '../../src/store/uiStore';
import type { Track } from '../../src/types/project';

vi.mock('../../src/services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

vi.mock('../../src/hooks/useGeneration', () => ({
  useGeneration: () => ({
    generateClip: vi.fn(),
  }),
}));

vi.mock('../../src/services/generationPipeline', () => ({
  regenerateClip: vi.fn(),
}));

describe('ClipBlock range slicing', () => {
  const mockSliceClipToRange = vi.fn().mockResolvedValue('clip-1');

  function getTrack(): Track {
    return useProjectStore.getState().project!.tracks[0];
  }

  function getClip() {
    return getTrack().clips[0];
  }

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    useProjectStore.setState({ project: null });
    useUIStore.setState({
      pixelsPerSecond: 100,
      selectedClipIds: new Set(),
      editingClipId: null,
      contextWindow: null,
      selectWindow: null,
    });

    useProjectStore.getState().createProject();
    const track = useProjectStore.getState().addTrack('vocals');
    const clip = useProjectStore.getState().addClip(track.id, {
      startTime: 1,
      duration: 4,
      prompt: 'vox',
      lyrics: '',
      source: 'uploaded',
    });
    useProjectStore.getState().updateClipStatus(clip.id, 'ready', {
      isolatedAudioKey: 'audio-1',
      waveformPeaks: [0.2, 0.6, 0.4, 0.8],
      audioDuration: 8,
    });

    const readyClip = useProjectStore.getState().project!.tracks[0].clips[0];
    useProjectStore.getState().updateClip(readyClip.id, { id: 'clip-1' });
    useProjectStore.setState({ sliceClipToRange: mockSliceClipToRange });
  });

  it('shows a body-range preview and commits the slice on mouse-up', async () => {
    const track = getTrack();
    const clip = getClip();
    const { container } = render(
      <div style={{ position: 'relative', width: 800, height: 80 }}>
        <ClipBlock clip={clip} track={track} />
      </div>,
    );

    const clipEl = container.querySelector('[data-clip-block]') as HTMLDivElement;
    clipEl.getBoundingClientRect = () => ({
      x: 100,
      y: 0,
      left: 100,
      top: 0,
      right: 500,
      bottom: 48,
      width: 400,
      height: 48,
      toJSON: () => ({}),
    });

    fireEvent.mouseDown(clipEl, { button: 0, clientX: 180, clientY: 28 });
    fireEvent.mouseMove(window, { clientX: 280, clientY: 28 });

    expect(screen.getByTestId('clip-range-preview')).toBeInTheDocument();

    fireEvent.mouseUp(window, { clientX: 280, clientY: 28 });

    await waitFor(() => {
      expect(mockSliceClipToRange).toHaveBeenCalledTimes(1);
    });

    expect(mockSliceClipToRange).toHaveBeenCalledWith('clip-1', 1.8, 2.8);
    expect(screen.queryByTestId('clip-range-preview')).not.toBeInTheDocument();
    expect(useUIStore.getState().selectedClipIds.has('clip-1')).toBe(true);
  });
});
