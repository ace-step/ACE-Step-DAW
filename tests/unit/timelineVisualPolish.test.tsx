import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ClipBlock } from '../../src/components/timeline/ClipBlock';
import { Playhead } from '../../src/components/timeline/Playhead';
import { useProjectStore } from '../../src/store/projectStore';
import { useUIStore } from '../../src/store/uiStore';
import { useTransportStore } from '../../src/store/transportStore';
import type { Clip, Track } from '../../src/types/project';

// Mock heavy child components
vi.mock('../../src/components/timeline/ClipContextMenu', () => ({
  ClipContextMenu: () => null,
}));
vi.mock('../../src/components/timeline/CanvasClipWaveform', () => ({
  CanvasClipWaveform: () => <div data-testid="clip-waveform" />,
}));
vi.mock('../../src/components/timeline/CanvasClipMidiThumbnail', () => ({
  CanvasClipMidiThumbnail: () => <div data-testid="clip-midi-thumbnail" />,
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

beforeEach(() => {
  localStorage.clear();
  useProjectStore.setState(useProjectStore.getInitialState(), true);
  useUIStore.setState(useUIStore.getInitialState(), true);
  useTransportStore.setState(useTransportStore.getInitialState(), true);
  useProjectStore.getState().createProject({ name: 'Visual Polish Test' });
});

// ── 1. Playhead Glow ──
describe('Playhead glow effect', () => {
  it('transport line uses playhead-glow CSS class', () => {
    useTransportStore.setState({ currentTime: 2, playStartTime: 0 });
    useUIStore.setState({ pixelsPerSecond: 100 });

    const { container } = render(<Playhead />);
    const playheadLine = container.querySelector('.playhead-glow');
    expect(playheadLine).toBeTruthy();
  });
});

// ── 2. AI Clip Visual Distinction ──
describe('AI-generated clip visual indicator', () => {
  it('shows AI indicator badge when clip source is "generated"', () => {
    const clip = makeClip({ source: 'generated' });
    const track = makeTrack();
    render(<ClipBlock clip={clip} track={track} />);

    const indicator = screen.getByTestId('ai-generated-badge');
    expect(indicator).toBeInTheDocument();
    expect(indicator).toHaveAttribute('aria-hidden', 'true');
  });

  it('does NOT show AI indicator for uploaded clips', () => {
    const clip = makeClip({ source: 'uploaded' });
    const track = makeTrack();
    render(<ClipBlock clip={clip} track={track} />);

    expect(screen.queryByTestId('ai-generated-badge')).not.toBeInTheDocument();
  });

  it('shows AI indicator for stems clips without source metadata', () => {
    const clip = makeClip({ source: undefined });
    const track = makeTrack();
    render(<ClipBlock clip={clip} track={track} />);

    expect(screen.getByTestId('ai-generated-badge')).toBeInTheDocument();
  });

  it('does NOT show AI indicator when source is undefined on a non-stems track', () => {
    const clip = makeClip({ source: undefined });
    const track = makeTrack({ trackType: 'audio' });
    render(<ClipBlock clip={clip} track={track} />);

    expect(screen.queryByTestId('ai-generated-badge')).not.toBeInTheDocument();
  });
});

// ── 3. Clip Mount Animation ──
describe('Clip mount animation', () => {
  it('mount animation wrapper has clip-mount-fade animation', () => {
    const clip = makeClip();
    const track = makeTrack();
    render(<ClipBlock clip={clip} track={track} />);

    const wrapper = screen.getByTestId(`clip-mount-wrapper-${clip.id}`);
    const style = wrapper.getAttribute('style') ?? '';
    expect(style).toMatch(/clip-mount-fade/);
  });

  it('animate-pulse on generating clips is NOT overridden by mount animation (separate elements)', () => {
    const clip = makeClip({ generationStatus: 'generating' });
    const track = makeTrack();
    render(<ClipBlock clip={clip} track={track} />);

    // animate-pulse is on the inner clip div, mount animation is on the outer wrapper
    const clipEl = screen.getByTestId(`clip-${clip.id}`);
    expect(clipEl.className).toContain('animate-pulse');
    // The inner clip div should NOT have clip-mount-fade inline animation
    const clipStyle = clipEl.getAttribute('style') ?? '';
    expect(clipStyle).not.toMatch(/clip-mount-fade/);
  });
});
