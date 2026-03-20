import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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

  it('does not interfere with selection ring when clip is selected', () => {
    const clip = makeClip();
    const track = makeTrack();

    // Select the clip
    useUIStore.getState().selectClip(clip.id, false);

    render(<ClipBlock clip={clip} track={track} />);

    const clipEl = screen.getByTestId(`clip-${clip.id}`);

    // Selected clip should still have ring-2
    expect(clipEl.className).toContain('ring-2');
    // And hover/active classes should still be present
    expect(clipEl.className).toMatch(/hover:/);
    expect(clipEl.className).toMatch(/active:/);
  });

  it('uses clip color override instead of track color when present', () => {
    const clip = makeClip({ color: '#22c55e' });
    const track = makeTrack({ color: '#4488ff' });

    render(<ClipBlock clip={clip} track={track} />);

    const clipEl = screen.getByTestId(`clip-${clip.id}`);
    expect(clipEl.style.borderLeft).toContain('rgb(34, 197, 94)');
    expect(clipEl.style.background).toContain('34, 197, 94');
  });

  it('falls back to the track color when no clip color override is set', () => {
    const clip = makeClip();
    const track = makeTrack({ color: '#4488ff' });

    render(<ClipBlock clip={clip} track={track} />);

    const clipEl = screen.getByTestId(`clip-${clip.id}`);
    expect(clipEl.style.borderLeft).toContain('rgb(68, 136, 255)');
    expect(clipEl.style.background).toContain('68, 136, 255');
  });
});
