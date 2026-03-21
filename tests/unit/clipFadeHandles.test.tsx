import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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

function getTrack(): Track {
  return useProjectStore.getState().project!.tracks[0];
}

function getClip() {
  return getTrack().clips[0];
}

function renderClip() {
  const track = getTrack();
  const clip = getClip();
  return render(
    <div style={{ position: 'relative', width: 400, height: 80 }}>
      <ClipBlock clip={clip} track={track} />
    </div>,
  );
}

describe('ClipBlock fade handles', () => {
  beforeEach(() => {
    localStorage.clear();
    useProjectStore.setState({ project: null });
    useUIStore.setState({
      pixelsPerSecond: 50,
      selectedClipIds: new Set(['clip-1']),
      editingClipId: null,
      contextWindow: null,
      selectWindow: null,
    });

    useProjectStore.getState().createProject();
    const track = useProjectStore.getState().addTrack('vocals');
    const clip = useProjectStore.getState().addClip(track.id, {
      startTime: 0,
      duration: 4,
      prompt: 'vox',
      lyrics: '',
      source: 'uploaded',
    });
    useProjectStore.getState().updateClipStatus(clip.id, 'ready', {
      isolatedAudioKey: 'audio-1',
      waveformPeaks: [0.2, 0.6, 0.4, 0.8],
    });

    const readyClip = useProjectStore.getState().project!.tracks[0].clips[0];
    useProjectStore.getState().updateClip(readyClip.id, { id: 'clip-1' });
  });

  it('hides fade handles for zero-fade audio clips', () => {
    renderClip();

    expect(screen.queryByLabelText('Fade in handle for clip clip-1')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Fade out handle for clip clip-1')).not.toBeInTheDocument();
  });

  it('adjusts fade in with keyboard input', () => {
    useProjectStore.getState().setClipFade('clip-1', { fadeInDuration: 0.2 });
    renderClip();

    fireEvent.keyDown(screen.getByLabelText('Fade in handle for clip clip-1'), { key: 'ArrowRight' });

    expect(getClip().fadeInDuration).toBe(0.3);
  });

  it('drags fade out from the clip edge', () => {
    useProjectStore.getState().setClipFade('clip-1', { fadeOutDuration: 0.8 });
    const { container } = renderClip();
    const clipBlock = container.querySelector('[data-clip-block]') as HTMLDivElement;
    clipBlock.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 200,
      bottom: 48,
      width: 200,
      height: 48,
      toJSON: () => ({}),
    });

    const handle = screen.getByLabelText('Fade out handle for clip clip-1');
    fireEvent.mouseDown(handle, { button: 0, clientX: 195 });
    fireEvent.mouseMove(window, { clientX: 150 });
    fireEvent.mouseUp(window);

    expect(getClip().fadeOutDuration).toBe(1);
  });

  it('resets fade handle on double click', () => {
    useProjectStore.getState().setClipFade('clip-1', { fadeOutDuration: 0.8 });
    renderClip();

    fireEvent.doubleClick(screen.getByLabelText('Fade out handle for clip clip-1'));

    expect(getClip().fadeOutDuration).toBe(0);
  });
});
