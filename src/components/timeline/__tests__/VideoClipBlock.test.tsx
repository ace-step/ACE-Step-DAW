import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VideoClipBlock } from '../VideoClipBlock';
import type { Clip, Track } from '../../../types/project';
import { useUIStore } from '../../../store/uiStore';
import { useProjectStore } from '../../../store/projectStore';

vi.mock('../../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

const makeTrack = (overrides?: Partial<Track>): Track => ({
  id: 'track-1',
  trackType: 'video',
  trackName: 'custom',
  displayName: 'Video',
  color: '#64748b',
  order: 1,
  volume: 0.8,
  muted: false,
  soloed: false,
  clips: [],
  videoSettings: {
    previewSize: 'medium',
    previewDock: 'top',
    showFilmstrip: true,
    filmstripOpacity: 0.8,
    showTimecodeOverlay: false,
    videoFollowsEdit: true,
  },
  ...overrides,
});

const makeClip = (overrides?: Partial<Clip>): Clip => ({
  id: 'clip-1',
  trackId: 'track-1',
  startTime: 0,
  duration: 30,
  prompt: 'Test Video',
  lyrics: '',
  generationStatus: 'empty',
  generationJobId: null,
  cumulativeMixKey: null,
  isolatedAudioKey: null,
  waveformPeaks: null,
  videoMeta: {
    codec: 'h264',
    width: 1920,
    height: 1080,
    frameRate: 30,
    fileDuration: 30,
    sourceOffset: 0,
    indexedDbKey: 'video-1',
    hasAudioStream: true,
    gopSize: 30,
    isIntraOnly: false,
  },
  ...overrides,
});

describe('VideoClipBlock', () => {
  beforeEach(() => {
    useUIStore.setState({ pixelsPerSecond: 50, selectedClipIds: new Set<string>() });
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject();
  });

  it('renders with data-testid', () => {
    render(<VideoClipBlock clip={makeClip()} track={makeTrack()} />);
    expect(screen.getByTestId('video-clip-block')).toBeDefined();
  });

  it('displays clip prompt as title', () => {
    render(<VideoClipBlock clip={makeClip({ prompt: 'My Video' })} track={makeTrack()} />);
    expect(screen.getByText('My Video')).toBeDefined();
  });

  it('shows codec metadata when clip is wide enough', () => {
    // 30s * 50px/s = 1500px wide — plenty of room for metadata
    render(<VideoClipBlock clip={makeClip()} track={makeTrack()} />);
    expect(screen.getByText('h264')).toBeDefined();
    expect(screen.getByText('1920×1080')).toBeDefined();
    expect(screen.getByText('30fps')).toBeDefined();
  });

  it('applies selected styling when clip is selected', () => {
    useUIStore.setState({ selectedClipIds: new Set(['clip-1']) });
    render(<VideoClipBlock clip={makeClip()} track={makeTrack()} />);
    const block = screen.getByTestId('video-clip-block');
    expect(block.className).toContain('daw-accent');
  });
});
