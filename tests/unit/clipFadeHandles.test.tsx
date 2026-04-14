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

  it('hides fade handles by default — handles are strictly hover-only', () => {
    renderClip();

    expect(screen.queryByLabelText('Fade in handle for clip clip-1')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Fade out handle for clip clip-1')).not.toBeInTheDocument();
  });

  it('reveals fade handles on pointer enter', () => {
    const { container } = renderClip();
    const clipBlock = container.querySelector('[data-clip-block]') as HTMLDivElement;

    fireEvent.mouseEnter(clipBlock);

    expect(screen.getByLabelText('Fade in handle for clip clip-1')).toBeInTheDocument();
    expect(screen.getByLabelText('Fade out handle for clip clip-1')).toBeInTheDocument();
  });

  it('hides fade handles again after pointer leaves', () => {
    const { container } = renderClip();
    const clipBlock = container.querySelector('[data-clip-block]') as HTMLDivElement;

    fireEvent.mouseEnter(clipBlock);
    fireEvent.mouseLeave(clipBlock);

    expect(screen.queryByLabelText('Fade in handle for clip clip-1')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Fade out handle for clip clip-1')).not.toBeInTheDocument();
  });

  it('hides fade handles even when a fade exists, until the pointer enters', () => {
    useProjectStore.getState().setClipFade('clip-1', { fadeInDuration: 0.4 });
    renderClip();

    expect(screen.queryByLabelText('Fade in handle for clip clip-1')).not.toBeInTheDocument();
  });

  it('adjusts fade in with keyboard input', () => {
    useProjectStore.getState().setClipFade('clip-1', { fadeInDuration: 0.2 });
    const { container } = renderClip();
    const clipBlock = container.querySelector('[data-clip-block]') as HTMLDivElement;
    fireEvent.mouseEnter(clipBlock);

    fireEvent.keyDown(screen.getByLabelText('Fade in handle for clip clip-1'), { key: 'ArrowRight' });

    expect(getClip().fadeInDuration).toBe(0.3);
  });

  it('drags fade out from the clip edge — pixel-level, no snap', () => {
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

    fireEvent.mouseEnter(clipBlock);
    const handle = screen.getByLabelText('Fade out handle for clip clip-1');
    // pps = 50, rect.right = 200, clientX = 195 → fadeOut = (200 - 195) / 50 = 0.1
    fireEvent.mouseDown(handle, { button: 0, clientX: 195 });
    fireEvent.mouseUp(window);

    expect(getClip().fadeOutDuration).toBeCloseTo(0.1, 2);
  });

  it('resets fade handle on double click', () => {
    useProjectStore.getState().setClipFade('clip-1', { fadeOutDuration: 0.8 });
    const { container } = renderClip();
    const clipBlock = container.querySelector('[data-clip-block]') as HTMLDivElement;
    fireEvent.mouseEnter(clipBlock);

    fireEvent.doubleClick(screen.getByLabelText('Fade out handle for clip clip-1'));

    expect(getClip().fadeOutDuration).toBe(0);
  });

  it('renders a draggable curve point on the fade-in curve when hovering a faded clip', () => {
    useProjectStore.getState().setClipFade('clip-1', { fadeInDuration: 1 });
    const { container } = renderClip();
    const clipBlock = container.querySelector('[data-clip-block]') as HTMLDivElement;
    fireEvent.mouseEnter(clipBlock);

    expect(container.querySelector('[data-fade-curve-point="in"]')).not.toBeNull();
  });

  it('hides the curve point when the pointer leaves', () => {
    useProjectStore.getState().setClipFade('clip-1', { fadeInDuration: 1 });
    const { container } = renderClip();
    const clipBlock = container.querySelector('[data-clip-block]') as HTMLDivElement;
    fireEvent.mouseEnter(clipBlock);
    fireEvent.mouseLeave(clipBlock);

    expect(container.querySelector('[data-fade-curve-point="in"]')).toBeNull();
  });

  it('drags the fade-in curve point and commits a fadeInCurvePoint to the store', () => {
    useProjectStore.getState().setClipFade('clip-1', { fadeInDuration: 2 });
    const { container } = renderClip();
    const clipBlock = container.querySelector('[data-clip-block]') as HTMLDivElement;
    clipBlock.getBoundingClientRect = () => ({
      x: 0, y: 0, left: 0, top: 0,
      right: 200, bottom: 80,
      width: 200, height: 80,
      toJSON: () => ({}),
    });
    fireEvent.mouseEnter(clipBlock);

    const point = container.querySelector('[data-fade-curve-point="in"]') as HTMLButtonElement;
    expect(point).not.toBeNull();

    // Drag to the middle of the fade-in region (50px), high up (y=30)
    fireEvent.mouseDown(point, { button: 0, clientX: 50, clientY: 30 });
    fireEvent.mouseUp(window);

    const stored = getClip().fadeInCurvePoint;
    expect(stored).toBeDefined();
    expect(stored!.x).toBeGreaterThan(0);
    expect(stored!.x).toBeLessThan(1);
    expect(stored!.y).toBeGreaterThan(0);
    expect(stored!.y).toBeLessThan(1);
  });

  it('resets the curve point on double click', () => {
    useProjectStore.getState().setClipFade('clip-1', {
      fadeInDuration: 1,
      fadeInCurvePoint: { x: 0.7, y: 0.4 },
    });
    const { container } = renderClip();
    const clipBlock = container.querySelector('[data-clip-block]') as HTMLDivElement;
    fireEvent.mouseEnter(clipBlock);

    const point = container.querySelector('[data-fade-curve-point="in"]') as HTMLButtonElement;
    fireEvent.doubleClick(point);

    expect(getClip().fadeInCurvePoint).toBeUndefined();
  });
});
