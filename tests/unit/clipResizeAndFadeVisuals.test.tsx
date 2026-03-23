import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
    expect(leftHandle.className).toContain('cursor-w-resize');
    expect(rightHandle.className).toContain('cursor-e-resize');
  });

  it('renders a dedicated header rail and an ivory selected body surface', () => {
    const { container } = renderClip();
    const headerRail = container.querySelector('[data-testid="clip-header-rail"]') as HTMLElement;
    const bodySurface = container.querySelector('[data-testid="clip-body-surface"]') as HTMLElement;

    expect(headerRail).toBeTruthy();
    expect(headerRail.getAttribute('aria-label')).toBe('Move clip clip-1');
    expect(bodySurface).toBeTruthy();
    expect(bodySurface.style.background).toContain('253, 251, 246');
  });

  it('keeps the selected clip surface regardless of track selection', () => {
    useUIStore.setState({ selectedTrackIds: new Set(['other-track']) });

    const { container } = renderClip();
    const bodySurface = container.querySelector('[data-testid="clip-body-surface"]') as HTMLElement;
    const clipEl = container.querySelector('[data-testid="clip-clip-1"]') as HTMLElement;

    // Clip selection is independent of track selection
    expect(bodySurface.style.background).toContain('253, 251, 246');
    expect(clipEl.className).toContain('ring-2');
  });

  it('does not render fade controls or overlays for zero-fade clips', () => {
    const { container } = renderClip();

    expect(container.querySelector('[data-testid="fade-in-overlay"]')).toBeNull();
    expect(container.querySelector('[data-testid="fade-out-overlay"]')).toBeNull();
    expect(screen.queryByLabelText('Fade in handle for clip clip-1')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Fade out handle for clip clip-1')).not.toBeInTheDocument();
  });

  it('fade-in triangle uses correct clip path (upper-left triangle)', () => {
    useProjectStore.getState().setClipFade('clip-1', { fadeInDuration: 1 });
    const { container } = renderClip();
    const fadeIn = container.querySelector('[data-testid="fade-in-overlay"]') as HTMLElement;
    expect(fadeIn).toBeTruthy();
    expect(fadeIn.style.clipPath).toBe('polygon(0 0, 100% 0, 0 100%)');
  });

  it('fade-out triangle uses correct clip path (upper-right triangle)', () => {
    useProjectStore.getState().setClipFade('clip-1', { fadeOutDuration: 1 });
    const { container } = renderClip();
    const fadeOut = container.querySelector('[data-testid="fade-out-overlay"]') as HTMLElement;
    expect(fadeOut).toBeTruthy();
    expect(fadeOut.style.clipPath).toBe('polygon(0 0, 100% 0, 100% 100%)');
  });

  it('fade overlays use reduced opacity', () => {
    useProjectStore.getState().setClipFade('clip-1', { fadeInDuration: 1, fadeOutDuration: 1 });
    const { container } = renderClip();
    const fadeIn = container.querySelector('[data-testid="fade-in-overlay"]') as HTMLElement;
    const fadeOut = container.querySelector('[data-testid="fade-out-overlay"]') as HTMLElement;
    expect(fadeIn.style.background).toContain('0.35');
    expect(fadeIn.style.background).not.toContain('0.72');
    expect(fadeOut.style.background).toContain('0.35');
    expect(fadeOut.style.background).not.toContain('0.72');
  });
});
