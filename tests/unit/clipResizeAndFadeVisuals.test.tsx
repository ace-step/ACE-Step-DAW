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

describe('Clip resize handle width and fade visuals', () => {
  beforeEach(() => {
    localStorage.clear();
    useProjectStore.setState({ project: null });
    useUIStore.setState({
      pixelsPerSecond: 50,
      selectedClipIds: new Set(),
      selectedTrackIds: new Set(),
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
      audioDuration: 8,
    });

    const readyClip = useProjectStore.getState().project!.tracks[0].clips[0];
    useProjectStore.getState().updateClip(readyClip.id, { id: 'clip-1' });
    useUIStore.setState({
      selectedClipIds: new Set(['clip-1']),
      selectedTrackIds: new Set([track.id]),
    });
  });

  it('resize handle divs are 16px wide', () => {
    renderClip();
    const leftHandle = screen.getByTestId('resize-handle-left');
    const rightHandle = screen.getByTestId('resize-handle-right');

    expect(leftHandle.className).toContain('w-[16px]');
    expect(rightHandle.className).toContain('w-[16px]');
    // Custom bracket cursors set via inline style (SVG data URL)
    expect(leftHandle.style.cursor).toContain('data:image/svg+xml');
    expect(rightHandle.style.cursor).toContain('data:image/svg+xml');
  });

  it('renders a dedicated header rail and a selected body surface', () => {
    const { container } = renderClip();
    const headerRail = container.querySelector('[data-testid="clip-header-rail"]') as HTMLElement;
    const bodySurface = container.querySelector('[data-testid="clip-body-surface"]') as HTMLElement;

    expect(headerRail).not.toBeNull();
    expect(headerRail.getAttribute('aria-label')).toBe('Move clip clip-1');
    expect(bodySurface).not.toBeNull();
    expect(bodySurface.style.background).toBeTruthy();
  });

  it('keeps the selected clip surface regardless of track selection', () => {
    useUIStore.setState({ selectedTrackIds: new Set(['other-track']) });

    const { container } = renderClip();
    const bodySurface = container.querySelector('[data-testid="clip-body-surface"]') as HTMLElement;
    const clipEl = container.querySelector('[data-testid="clip-clip-1"]') as HTMLElement;

    // Clip selection is independent of track selection
    expect(bodySurface.style.background).toBeTruthy();
    // Selected clip has selection ring via boxShadow
    expect(clipEl.style.boxShadow).toBeTruthy();
  });

  it('renders a translucent fade mask SVG when a fade exists', () => {
    useProjectStore.getState().setClipFade('clip-1', { fadeInDuration: 1, fadeOutDuration: 1 });
    const { container } = renderClip();
    const fadeIn = container.querySelector('[data-testid="fade-in-overlay"]');
    const fadeOut = container.querySelector('[data-testid="fade-out-overlay"]');
    expect(fadeIn).not.toBeNull();
    expect(fadeOut).not.toBeNull();
    // Mask path is always present; line path only appears on hover.
    const fadeInMask = fadeIn!.querySelector('path[fill]');
    expect(fadeInMask).not.toBeNull();
    expect(fadeInMask!.getAttribute('fill')).toMatch(/rgba\(/);
  });

  it('reveals the black curve line only during an active drag', () => {
    useProjectStore.getState().setClipFade('clip-1', { fadeInDuration: 1 });
    const { container } = renderClip();
    const clipBlock = container.querySelector('[data-clip-block]') as HTMLDivElement;
    clipBlock.getBoundingClientRect = () => ({
      x: 0, y: 0, left: 0, top: 0,
      right: 200, bottom: 80,
      width: 200, height: 80,
      toJSON: () => ({}),
    });

    // Hover alone: only the mask is rendered, no stroked line
    fireEvent.mouseEnter(clipBlock);
    let fadeIn = container.querySelector('[data-testid="fade-in-overlay"]')!;
    expect(fadeIn.querySelector('path[stroke]')).toBeNull();

    // Active drag of the fade-in handle: line appears
    const handle = screen.getByLabelText('Fade in handle for clip clip-1');
    fireEvent.mouseDown(handle, { button: 0, clientX: 50 });
    fadeIn = container.querySelector('[data-testid="fade-in-overlay"]')!;
    const linePath = fadeIn.querySelector('path[stroke]');
    expect(linePath).not.toBeNull();
    expect(linePath!.getAttribute('stroke')).toBe('#000');

    // After mouseup the line is hidden again
    fireEvent.mouseUp(window);
    fadeIn = container.querySelector('[data-testid="fade-in-overlay"]')!;
    expect(fadeIn.querySelector('path[stroke]')).toBeNull();
  });
});
