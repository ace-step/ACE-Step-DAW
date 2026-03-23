import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ClipBlock } from '../../src/components/timeline/ClipBlock';
import { useProjectStore } from '../../src/store/projectStore';
import { useUIStore } from '../../src/store/uiStore';
import type { Clip, Track } from '../../src/types/project';

// Mock heavy child components to keep the test fast
vi.mock('../../src/components/timeline/ClipContextMenu', () => ({
  ClipContextMenu: () => null,
}));
vi.mock('../../src/components/timeline/ClipWaveform', () => ({
  ClipWaveform: () => <div data-testid="clip-waveform" />,
  ClipMidiThumbnail: () => <div data-testid="clip-midi-thumbnail" />,
}));
vi.mock('../../src/components/timeline/ClipGainEnvelope', () => ({
  ClipGainEnvelope: () => null,
}));
vi.mock('../../src/components/timeline/ClipWarpMarkers', () => ({
  ClipWarpMarkers: () => null,
}));
vi.mock('../../src/components/timeline/ClipStatusOverlay', () => ({
  ClipStatusOverlay: () => null,
}));
vi.mock('../../src/components/generation/AddLayerModal', () => ({
  AddLayerModal: () => null,
}));
vi.mock('../../src/services/generationPipeline', () => ({
  regenerateClip: vi.fn(),
}));
vi.mock('../../src/hooks/useGeneration', () => ({
  useGeneration: () => ({ generateClip: vi.fn() }),
}));
vi.mock('../../src/services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

const makeClip = (overrides?: Partial<Clip>): Clip => ({
  id: 'clip-1',
  trackId: 'track-1',
  startTime: 0,
  duration: 4,
  prompt: 'Test clip',
  lyrics: '',
  generationStatus: 'ready',
  generationJobId: null,
  cumulativeMixKey: null,
  isolatedAudioKey: 'some-audio-key',
  waveformPeaks: [0.1, 0.5, 0.3],
  ...overrides,
});

const makeTrack = (overrides?: Partial<Track>): Track => ({
  id: 'track-1',
  displayName: 'Track 1',
  trackName: 'guitar',
  trackType: 'stems',
  color: '#4488ff',
  volume: 0.8,
  pan: 0,
  mute: false,
  solo: false,
  clips: [],
  effects: [],
  sends: [],
  armed: false,
  inputMonitoring: 'off',
  ...overrides,
} as Track);

describe('ClipBlock hover and active feedback', () => {
  beforeEach(() => {
    localStorage.clear();
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    useProjectStore.getState().createProject({ name: 'Hover Test' });
  });

  it('renders clip container with hover and active transition classes', () => {
    const clip = makeClip();
    const track = makeTrack();

    render(<ClipBlock clip={clip} track={track} />);

    const clipEl = screen.getByTestId(`clip-${clip.id}`);
    const classList = clipEl.className;

    // Hover state: brightness boost or ring
    expect(classList).toMatch(/hover:/);
    // Active state: brightness change
    expect(classList).toMatch(/active:/);
    // Smooth CSS transition
    expect(classList).toMatch(/transition/);
  });

  it('renders resize edge handles with visual indicator elements', () => {
    const clip = makeClip();
    const track = makeTrack();

    render(<ClipBlock clip={clip} track={track} />);

    // There should be resize edge handle elements with visual indicators
    const leftHandle = screen.getByTestId('resize-handle-left');
    const rightHandle = screen.getByTestId('resize-handle-right');

    expect(leftHandle).toBeInTheDocument();
    expect(rightHandle).toBeInTheDocument();

    // Each handle should contain a visual line indicator
    const leftLine = leftHandle.querySelector('[data-testid="resize-indicator-left"]');
    const rightLine = rightHandle.querySelector('[data-testid="resize-indicator-right"]');

    expect(leftLine).toBeInTheDocument();
    expect(rightLine).toBeInTheDocument();
  });

  it('forces a resize cursor and visible edge feedback on hover', () => {
    const clip = makeClip();
    const track = makeTrack();

    render(<ClipBlock clip={clip} track={track} />);

    const leftHandle = screen.getByTestId('resize-handle-left');
    const clipEl = screen.getByTestId(`clip-${clip.id}`) as HTMLElement;
    const leftIndicator = screen.getByTestId('resize-indicator-left') as HTMLElement;
    const leftHoverZone = screen.getByTestId('resize-hover-zone-left') as HTMLElement;

    fireEvent.mouseEnter(leftHandle);

    expect(leftHandle.style.cursor).toBe('w-resize');
    expect(clipEl.style.cursor).toBe('w-resize');
    expect(document.body.style.cursor).toBe('w-resize');
    expect(document.documentElement.style.cursor).toBe('w-resize');
    expect(leftIndicator.style.backgroundColor).toContain('255, 255, 255');
    expect(leftHoverZone.style.background).toContain('linear-gradient');

    fireEvent.mouseLeave(leftHandle);

    expect(clipEl.style.cursor).toBe('');
    expect(document.body.style.cursor).toBe('');
    expect(document.documentElement.style.cursor).toBe('');
  });

  it('switches to resize cursor immediately when entering the clip at the edge', () => {
    const clip = makeClip();
    const track = makeTrack();

    render(<ClipBlock clip={clip} track={track} />);

    const clipEl = screen.getByTestId(`clip-${clip.id}`) as HTMLElement;
    vi.spyOn(clipEl, 'getBoundingClientRect').mockReturnValue({
      x: 100,
      y: 20,
      width: 160,
      height: 40,
      top: 20,
      right: 260,
      bottom: 60,
      left: 100,
      toJSON: () => ({}),
    });

    fireEvent.mouseEnter(clipEl, { clientX: 103, clientY: 24 });

    expect(clipEl.style.cursor).toBe('w-resize');
    expect(document.body.style.cursor).toBe('w-resize');
    expect(document.documentElement.style.cursor).toBe('w-resize');
  });

  it('uses a right-edge resize cursor when hovering the clip end', () => {
    const clip = makeClip();
    const track = makeTrack();

    render(<ClipBlock clip={clip} track={track} />);

    const clipEl = screen.getByTestId(`clip-${clip.id}`) as HTMLElement;
    vi.spyOn(clipEl, 'getBoundingClientRect').mockReturnValue({
      x: 100,
      y: 20,
      width: 160,
      height: 40,
      top: 20,
      right: 260,
      bottom: 60,
      left: 100,
      toJSON: () => ({}),
    });

    fireEvent.mouseEnter(clipEl, { clientX: 257, clientY: 24 });

    expect(clipEl.style.cursor).toBe('e-resize');
    expect(document.body.style.cursor).toBe('e-resize');
    expect(document.documentElement.style.cursor).toBe('e-resize');
  });

  it('does not interfere with selection ring when clip is selected', () => {
    const clip = makeClip();
    const track = makeTrack();

    // Select the clip
    useUIStore.getState().selectClip(clip.id, false);
    useUIStore.getState().selectTrack(track.id, false);

    render(<ClipBlock clip={clip} track={track} />);

    const clipEl = screen.getByTestId(`clip-${clip.id}`);

    // Selected clip should still have ring-2
    expect(clipEl.className).toContain('ring-2');
    // And hover/active classes should still be present
    expect(clipEl.className).toMatch(/hover:/);
    expect(clipEl.className).toMatch(/active:/);
  });

  it('keeps the visual selected state when another track becomes selected', () => {
    const clip = makeClip();
    const track = makeTrack();

    useUIStore.getState().selectClip(clip.id, false);
    useUIStore.getState().selectTrack('track-2', false);

    render(<ClipBlock clip={clip} track={track} />);

    const clipEl = screen.getByTestId(`clip-${clip.id}`);
    const bodySurface = screen.getByTestId('clip-body-surface') as HTMLElement;

    // Clip selection is independent of track selection
    expect(clipEl.className).toContain('ring-2');
    expect(bodySurface.style.background).toContain('253, 251, 246');
  });

  it('exposes a dedicated header rail move handle with grab affordance', () => {
    const clip = makeClip();
    const track = makeTrack();

    render(<ClipBlock clip={clip} track={track} />);

    const headerRail = screen.getByTestId('clip-header-rail') as HTMLElement;
    expect(headerRail).toBeInTheDocument();
    expect(headerRail.getAttribute('aria-label')).toBe(`Move clip ${clip.id}`);

    const clipEl = screen.getByTestId(`clip-${clip.id}`) as HTMLElement;
    vi.spyOn(clipEl, 'getBoundingClientRect').mockReturnValue({
      x: 100,
      y: 20,
      width: 160,
      height: 48,
      top: 20,
      right: 260,
      bottom: 68,
      left: 100,
      toJSON: () => ({}),
    });

    fireEvent.mouseMove(clipEl, { clientX: 140, clientY: 28 });
    expect(clipEl.style.cursor).toBe('grab');
  });

  it('uses clip color override instead of track color when present', () => {
    const clip = makeClip({ color: '#22c55e' });
    const track = makeTrack({ color: '#4488ff' });

    render(<ClipBlock clip={clip} track={track} />);

    const clipEl = screen.getByTestId(`clip-${clip.id}`);
    const headerRail = screen.getByTestId('clip-header-rail') as HTMLElement;
    // Color strip is now a child overlay div (not borderLeft) for waveform alignment
    const stripEl = clipEl.querySelector('.w-\\[3px\\]') as HTMLElement;
    expect(stripEl).toBeTruthy();
    expect(stripEl!.style.backgroundColor).toContain('rgb(34, 197, 94)');
    expect(headerRail.style.background).toContain('34, 197, 94');
  });

  it('falls back to the track color when no clip color override is set', () => {
    const clip = makeClip();
    const track = makeTrack({ color: '#4488ff' });

    render(<ClipBlock clip={clip} track={track} />);

    const clipEl = screen.getByTestId(`clip-${clip.id}`);
    const headerRail = screen.getByTestId('clip-header-rail') as HTMLElement;
    // Color strip is now a child overlay div (not borderLeft) for waveform alignment
    const stripEl = clipEl.querySelector('.w-\\[3px\\]') as HTMLElement;
    expect(stripEl).toBeTruthy();
    expect(stripEl!.style.backgroundColor).toContain('rgb(68, 136, 255)');
    expect(headerRail.style.background).toContain('68, 136, 255');
  });
});
