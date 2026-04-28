import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VideoPreviewPanel } from '../VideoPreviewPanel';
import type { Track } from '../../../types/project';
import { useTransportStore } from '../../../store/transportStore';

vi.mock('../../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

const makeVideoTrack = (overrides?: Partial<Track>): Track => ({
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

describe('VideoPreviewPanel', () => {
  beforeEach(() => {
    useTransportStore.setState({ currentTime: 0, isPlaying: false });
  });

  it('renders with data-testid', () => {
    render(<VideoPreviewPanel track={makeVideoTrack()} />);
    expect(screen.getByTestId('video-preview-panel')).toBeDefined();
  });

  it('shows empty state when no clips', () => {
    render(<VideoPreviewPanel track={makeVideoTrack()} />);
    expect(screen.getByText('No video at playhead')).toBeDefined();
  });

  it('shows empty state when transport is outside all clips', () => {
    useTransportStore.setState({ currentTime: 100 });
    const track = makeVideoTrack({
      clips: [{
        id: 'c1',
        trackId: 'track-1',
        startTime: 0,
        duration: 30,
        prompt: '',
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
          indexedDbKey: 'v1',
          hasAudioStream: false,
          gopSize: 30,
          isIntraOnly: false,
        },
      }],
    });
    render(<VideoPreviewPanel track={track} />);
    expect(screen.getByText('No video at playhead')).toBeDefined();
  });

  it('renders video element when transport is within a video clip', () => {
    useTransportStore.setState({ currentTime: 10 });
    const track = makeVideoTrack({
      clips: [{
        id: 'c1',
        trackId: 'track-1',
        startTime: 0,
        duration: 30,
        prompt: '',
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
          indexedDbKey: 'v1',
          hasAudioStream: false,
          gopSize: 30,
          isIntraOnly: false,
        },
      }],
    });
    render(<VideoPreviewPanel track={track} />);
    // Should render video element, not empty state
    expect(screen.queryByText('No video at playhead')).toBeNull();
  });
});
