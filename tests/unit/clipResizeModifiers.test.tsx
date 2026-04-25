import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
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
    <div style={{ position: 'relative', width: 800, height: 80 }}>
      <ClipBlock clip={clip} track={track} />
    </div>,
  );
}

describe('ClipBlock resize modifiers', () => {
  beforeEach(() => {
    localStorage.clear();
    useProjectStore.setState({ project: null });
    useUIStore.setState({
      pixelsPerSecond: 100,
      selectedClipIds: new Set(['clip-1']),
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
  });

  it('bypasses snap when Alt-resizing the right edge', () => {
    const { container } = renderClip();
    const clipBlock = container.querySelector('[data-clip-block]') as HTMLDivElement;
    clipBlock.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 400,
      bottom: 48,
      width: 400,
      height: 48,
      toJSON: () => ({}),
    });

    fireEvent.mouseDown(clipBlock, { button: 0, clientX: 398 });
    fireEvent.mouseMove(window, { clientX: 431, altKey: true });
    fireEvent.mouseUp(window, { altKey: true });

    expect(getClip().duration).toBeCloseTo(4.33, 2);
  });

  it('bypasses snap when Alt-resizing the left edge', () => {
    const { container } = renderClip();
    const clipBlock = container.querySelector('[data-clip-block]') as HTMLDivElement;
    clipBlock.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 400,
      bottom: 48,
      width: 400,
      height: 48,
      toJSON: () => ({}),
    });

    fireEvent.mouseDown(clipBlock, { button: 0, clientX: 2 });
    fireEvent.mouseMove(window, { clientX: 35, altKey: true });
    fireEvent.mouseUp(window, { altKey: true });

    expect(getClip().startTime).toBeCloseTo(1.33, 2);
    expect(getClip().duration).toBeCloseTo(3.67, 2);
    expect(getClip().audioOffset).toBeCloseTo(0.33, 2);
  });

  it('creates leading silence instead of shifting source audio when extending left', () => {
    const { container } = renderClip();
    const clipBlock = container.querySelector('[data-clip-block]') as HTMLDivElement;
    clipBlock.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 400,
      bottom: 48,
      width: 400,
      height: 48,
      toJSON: () => ({}),
    });

    fireEvent.mouseDown(clipBlock, { button: 0, clientX: 2 });
    fireEvent.mouseMove(window, { clientX: -48 });
    fireEvent.mouseUp(window);

    expect(getClip().startTime).toBeCloseTo(0.5, 2);
    expect(getClip().duration).toBeCloseTo(4.5, 2);
    expect(getClip().audioOffset ?? 0).toBe(0);
    expect(getClip().contentOffset).toBeCloseTo(0.5, 2);
  });

  it('uses Shift-resize to time-stretch the right edge', () => {
    const { container } = renderClip();
    const clipBlock = container.querySelector('[data-clip-block]') as HTMLDivElement;
    clipBlock.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 400,
      bottom: 48,
      width: 400,
      height: 48,
      toJSON: () => ({}),
    });

    fireEvent.mouseDown(clipBlock, { button: 0, clientX: 398, shiftKey: true });
    fireEvent.mouseMove(window, { clientX: 598, shiftKey: true });
    fireEvent.mouseUp(window, { shiftKey: true });

    expect(getClip().duration).toBeCloseTo(6, 2);
    expect(getClip().contentOffset).toBeUndefined();
    expect(getClip().stretchMode).toBe('complexPro');
    expect(getClip().timeStretchRate).toBeCloseTo(4 / 6, 2);
  });

  it('uses Shift-resize to time-stretch the left edge', () => {
    const { container } = renderClip();
    const clipBlock = container.querySelector('[data-clip-block]') as HTMLDivElement;
    clipBlock.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 400,
      bottom: 48,
      width: 400,
      height: 48,
      toJSON: () => ({}),
    });

    fireEvent.mouseDown(clipBlock, { button: 0, clientX: 2, shiftKey: true });
    fireEvent.mouseMove(window, { clientX: -98, shiftKey: true });
    fireEvent.mouseUp(window, { shiftKey: true });

    expect(getClip().startTime).toBe(0);
    expect(getClip().duration).toBeCloseTo(5, 2);
    expect(getClip().contentOffset).toBeUndefined();
    expect(getClip().stretchMode).toBe('complexPro');
    expect(getClip().timeStretchRate).toBeCloseTo(4 / 5, 2);
  });
});
