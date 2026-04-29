import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useUIStore } from '../../../store/uiStore';
import { HumToSongModal } from '../HumToSongModal';

// Mock the dependencies
vi.mock('../../../engine/RecordingEngine', () => ({
  recordingEngine: {
    requestPermission: vi.fn().mockResolvedValue(true),
    startRecording: vi.fn().mockResolvedValue(true),
    stopRecording: vi.fn().mockResolvedValue(null),
    getInputLevelLinear: vi.fn().mockReturnValue(0),
    setMonitoring: vi.fn(),
    hasPermission: false,
  },
}));

vi.mock('../../../services/generationPipeline', () => ({
  generateCoverClip: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../services/audioFileManager', () => ({
  saveAudioBlob: vi.fn().mockResolvedValue('audio-key-123'),
}));

vi.mock('../../../utils/wav', () => ({
  audioBufferToWavBlob: vi.fn().mockReturnValue(new Blob()),
}));

vi.mock('../../../utils/waveformPeaks', () => ({
  computeWaveformWithMipmap: vi.fn().mockResolvedValue([]),
}));

// Mock projectStore
vi.mock('../../../store/projectStore', () => ({
  useProjectStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) => {
      const state = {
        project: { id: 'proj-1', bpm: 120, timeSignature: 4 },
        addTrack: vi.fn().mockReturnValue({ id: 'track-1', clips: [] }),
        addClip: vi.fn().mockReturnValue({ id: 'clip-1' }),
        renameTrack: vi.fn(),
        updateClipStatus: vi.fn(),
      };
      return selector(state);
    },
    {
      getState: () => ({
        project: { id: 'proj-1', bpm: 120 },
        addTrack: vi.fn().mockReturnValue({ id: 'track-1', clips: [] }),
        addClip: vi.fn().mockReturnValue({ id: 'clip-1' }),
        renameTrack: vi.fn(),
        updateClipStatus: vi.fn(),
      }),
    },
  ),
}));

describe('HumToSongModal', () => {
  beforeEach(() => {
    useUIStore.setState({ showHumToSongModal: false });
  });

  it('does not render when showHumToSongModal is false', () => {
    const { container } = render(<HumToSongModal />);
    expect(container.innerHTML).toBe('');
  });

  it('renders the modal when showHumToSongModal is true', () => {
    useUIStore.setState({ showHumToSongModal: true });
    render(<HumToSongModal />);

    expect(screen.getByText('Hum to Song')).toBeInTheDocument();
    expect(screen.getByTestId('hum-to-song-modal')).toBeInTheDocument();
  });

  it('shows the record step initially', () => {
    useUIStore.setState({ showHumToSongModal: true });
    render(<HumToSongModal />);

    expect(screen.getByTestId('hum-record-button')).toBeInTheDocument();
    expect(screen.getByText(/Record a melody/)).toBeInTheDocument();
  });

  it('shows step indicators (1. Record, 2. Preview, 3. Generate)', () => {
    useUIStore.setState({ showHumToSongModal: true });
    render(<HumToSongModal />);

    expect(screen.getByText('Record')).toBeInTheDocument();
    expect(screen.getByText('Preview')).toBeInTheDocument();
    expect(screen.getByText('Generate')).toBeInTheDocument();
  });

  it('shows recording tips', () => {
    useUIStore.setState({ showHumToSongModal: true });
    render(<HumToSongModal />);

    expect(screen.getByText('Tips for best results:')).toBeInTheDocument();
    expect(screen.getByText(/clear, single-note melody/)).toBeInTheDocument();
  });

  it('closes when cancel button is clicked', async () => {
    useUIStore.setState({ showHumToSongModal: true });
    render(<HumToSongModal />);

    const cancelButton = screen.getByText('Cancel');
    cancelButton.click();

    expect(useUIStore.getState().showHumToSongModal).toBe(false);
  });

  it('closes when close (×) button is clicked', () => {
    useUIStore.setState({ showHumToSongModal: true });
    render(<HumToSongModal />);

    const closeButton = screen.getByLabelText('Close hum to song modal');
    closeButton.click();

    expect(useUIStore.getState().showHumToSongModal).toBe(false);
  });

  it('shows the record button with start label', () => {
    useUIStore.setState({ showHumToSongModal: true });
    render(<HumToSongModal />);

    expect(screen.getByLabelText('Start recording')).toBeInTheDocument();
  });
});
