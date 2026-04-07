import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { VoiceProfile } from '../../../types/voice';

// Mock voiceProfileService before store import
vi.mock('../../../services/voiceProfileService', () => ({
  listVoiceProfiles: vi.fn().mockResolvedValue([]),
  saveVoiceProfile: vi.fn().mockResolvedValue(undefined),
  deleteVoiceProfile: vi.fn().mockResolvedValue(undefined),
  updateVoiceProfileName: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('uuid', () => ({ v4: () => 'test-uuid' }));
vi.mock('../../../utils/waveformPeaks', () => ({
  computeWaveformPeaks: vi.fn(() => [0.5]),
}));

import { useVoiceStore } from '../../../store/voiceStore';
import { VoiceLibrary } from '../VoiceLibrary';

function makeProfile(overrides: Partial<VoiceProfile> = {}): VoiceProfile {
  return {
    id: 'v1',
    name: 'Test Voice',
    source: 'upload',
    mimeType: 'audio/wav',
    duration: 30,
    fileSize: 1024,
    waveformPeaks: [0.2, 0.5, 0.8, 0.3],
    defaultAudioInfluence: 0.4,
    defaultStyleInfluence: 0.6,
    createdAt: 1000,
    updatedAt: 2000,
    ...overrides,
  };
}

// Sentinel profile to prevent auto-loadProfiles from firing.
// The useEffect only calls loadProfiles when profiles.length === 0 && !loading.
// By setting loading: true we prevent the auto-load side effect.
const PREVENT_AUTOLOAD = { loading: true };

beforeEach(() => {
  vi.clearAllMocks();
  useVoiceStore.setState({
    profiles: [],
    selectedProfileId: null,
    loading: false,
    recording: false,
    error: null,
  });
});

describe('VoiceLibrary', () => {
  it('renders collapsed by default with toggle button', () => {
    render(<VoiceLibrary />);
    const toggle = screen.getByTestId('voice-library-toggle');
    expect(toggle).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('voice-drop-zone')).not.toBeInTheDocument();
  });

  it('expands when toggle is clicked', () => {
    useVoiceStore.setState(PREVENT_AUTOLOAD);
    render(<VoiceLibrary />);
    fireEvent.click(screen.getByTestId('voice-library-toggle'));
    expect(screen.getByTestId('voice-library-toggle')).toHaveAttribute('aria-expanded', 'true');
  });

  it('shows empty state with drop zone when no profiles and not loading', () => {
    // Pre-expand: set loading false but profiles empty
    // We need to prevent the useEffect from calling loadProfiles.
    // Trick: set a dummy profile then remove it — or just test with loading=false
    // Actually, better: spy on loadProfiles and make it a no-op
    const spy = vi.spyOn(useVoiceStore.getState(), 'loadProfiles').mockImplementation(async () => {});
    render(<VoiceLibrary />);
    fireEvent.click(screen.getByTestId('voice-library-toggle'));
    expect(screen.getByTestId('voice-drop-zone')).toBeInTheDocument();
    expect(screen.getByText(/No voice profiles yet/)).toBeInTheDocument();
    spy.mockRestore();
  });

  it('shows record and upload buttons when expanded', () => {
    useVoiceStore.setState(PREVENT_AUTOLOAD);
    render(<VoiceLibrary />);
    fireEvent.click(screen.getByTestId('voice-library-toggle'));
    expect(screen.getByTestId('voice-record-btn')).toBeInTheDocument();
    expect(screen.getByTestId('voice-upload-btn')).toBeInTheDocument();
  });

  it('renders profile cards when profiles exist', () => {
    const p1 = makeProfile({ id: 'v1', name: 'Voice A' });
    const p2 = makeProfile({ id: 'v2', name: 'Voice B' });
    useVoiceStore.setState({ profiles: [p1, p2] });

    render(<VoiceLibrary />);
    fireEvent.click(screen.getByTestId('voice-library-toggle'));

    expect(screen.getByTestId('voice-profile-card-v1')).toBeInTheDocument();
    expect(screen.getByTestId('voice-profile-card-v2')).toBeInTheDocument();
    expect(screen.getByText('Voice A')).toBeInTheDocument();
    expect(screen.getByText('Voice B')).toBeInTheDocument();
  });

  it('selects a profile when clicked', () => {
    const p1 = makeProfile({ id: 'v1', name: 'Voice A' });
    useVoiceStore.setState({ profiles: [p1] });

    render(<VoiceLibrary />);
    fireEvent.click(screen.getByTestId('voice-library-toggle'));
    fireEvent.click(screen.getByTestId('voice-profile-card-v1'));

    expect(useVoiceStore.getState().selectedProfileId).toBe('v1');
  });

  it('deselects a profile when clicked again', () => {
    const p1 = makeProfile({ id: 'v1' });
    useVoiceStore.setState({ profiles: [p1], selectedProfileId: 'v1' });

    render(<VoiceLibrary />);
    fireEvent.click(screen.getByTestId('voice-library-toggle'));
    fireEvent.click(screen.getByTestId('voice-profile-card-v1'));

    expect(useVoiceStore.getState().selectedProfileId).toBeNull();
  });

  it('shows selected voice info when a profile is selected', () => {
    const p1 = makeProfile({ id: 'v1', name: 'My Voice' });
    useVoiceStore.setState({ profiles: [p1], selectedProfileId: 'v1' });

    render(<VoiceLibrary />);
    fireEvent.click(screen.getByTestId('voice-library-toggle'));

    expect(screen.getByTestId('voice-selected-info')).toBeInTheDocument();
    expect(screen.getByText(/will be used for generation/)).toBeInTheDocument();
  });

  it('shows error banner when error exists', () => {
    useVoiceStore.setState({
      profiles: [makeProfile()],
      error: 'Test error message',
    });

    render(<VoiceLibrary />);
    fireEvent.click(screen.getByTestId('voice-library-toggle'));

    expect(screen.getByTestId('voice-error')).toBeInTheDocument();
    expect(screen.getByText('Test error message')).toBeInTheDocument();
  });

  it('shows duration formatted as minutes:seconds for long recordings', () => {
    const p1 = makeProfile({ id: 'v1', duration: 90 });
    useVoiceStore.setState({ profiles: [p1] });

    render(<VoiceLibrary />);
    fireEvent.click(screen.getByTestId('voice-library-toggle'));

    expect(screen.getByText(/1m 30s/)).toBeInTheDocument();
  });

  it('shows duration in seconds for short recordings', () => {
    const p1 = makeProfile({ id: 'v1', duration: 30 });
    useVoiceStore.setState({ profiles: [p1] });

    render(<VoiceLibrary />);
    fireEvent.click(screen.getByTestId('voice-library-toggle'));

    expect(screen.getByText(/30s/)).toBeInTheDocument();
  });

  it('shows selected profile name in collapsed header', () => {
    const p1 = makeProfile({ id: 'v1', name: 'My Vocal' });
    useVoiceStore.setState({ profiles: [p1], selectedProfileId: 'v1' });

    render(<VoiceLibrary />);

    expect(screen.getByText(/My Vocal/)).toBeInTheDocument();
  });

  it('disables buttons when disabled prop is true', () => {
    useVoiceStore.setState(PREVENT_AUTOLOAD);
    render(<VoiceLibrary disabled />);
    fireEvent.click(screen.getByTestId('voice-library-toggle'));

    expect(screen.getByTestId('voice-record-btn')).toBeDisabled();
    expect(screen.getByTestId('voice-upload-btn')).toBeDisabled();
  });

  it('shows recording indicator when recording', () => {
    useVoiceStore.setState({ recording: true, ...PREVENT_AUTOLOAD });

    render(<VoiceLibrary />);
    fireEvent.click(screen.getByTestId('voice-library-toggle'));

    expect(screen.getByTestId('voice-recording-indicator')).toBeInTheDocument();
    expect(screen.getByText(/Recording.../)).toBeInTheDocument();
  });

  it('shows waveform mini visualization for profiles', () => {
    const p1 = makeProfile({ id: 'v1', waveformPeaks: [0.1, 0.5, 0.8, 0.3] });
    useVoiceStore.setState({ profiles: [p1] });

    render(<VoiceLibrary />);
    fireEvent.click(screen.getByTestId('voice-library-toggle'));

    expect(screen.getByTestId('voice-waveform-mini')).toBeInTheDocument();
  });

  it('shows profile list with listbox role', () => {
    useVoiceStore.setState({ profiles: [makeProfile()] });

    render(<VoiceLibrary />);
    fireEvent.click(screen.getByTestId('voice-library-toggle'));

    expect(screen.getByTestId('voice-profile-list')).toHaveAttribute('role', 'listbox');
  });

  it('shows preview button for each profile', () => {
    useVoiceStore.setState({ profiles: [makeProfile({ id: 'v1' })] });

    render(<VoiceLibrary />);
    fireEvent.click(screen.getByTestId('voice-library-toggle'));

    expect(screen.getByTestId('voice-preview-v1')).toBeInTheDocument();
  });

  it('shows delete confirmation when delete is clicked', () => {
    useVoiceStore.setState({ profiles: [makeProfile({ id: 'v1' })] });

    render(<VoiceLibrary />);
    fireEvent.click(screen.getByTestId('voice-library-toggle'));
    fireEvent.click(screen.getByTestId('voice-delete-v1'));

    expect(screen.getByTestId('voice-confirm-delete-v1')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('shows search input when more than 2 profiles exist', () => {
    useVoiceStore.setState({
      profiles: [
        makeProfile({ id: 'v1', name: 'Alpha' }),
        makeProfile({ id: 'v2', name: 'Beta' }),
        makeProfile({ id: 'v3', name: 'Gamma' }),
      ],
    });

    render(<VoiceLibrary />);
    fireEvent.click(screen.getByTestId('voice-library-toggle'));

    expect(screen.getByTestId('voice-search-input')).toBeInTheDocument();
  });

  it('does not show search input when 2 or fewer profiles exist', () => {
    useVoiceStore.setState({
      profiles: [makeProfile({ id: 'v1' }), makeProfile({ id: 'v2' })],
    });

    render(<VoiceLibrary />);
    fireEvent.click(screen.getByTestId('voice-library-toggle'));

    expect(screen.queryByTestId('voice-search-input')).not.toBeInTheDocument();
  });

  it('filters profiles by search query', () => {
    useVoiceStore.setState({
      profiles: [
        makeProfile({ id: 'v1', name: 'Alpha Voice' }),
        makeProfile({ id: 'v2', name: 'Beta Vocal' }),
        makeProfile({ id: 'v3', name: 'Gamma Voice' }),
      ],
    });

    render(<VoiceLibrary />);
    fireEvent.click(screen.getByTestId('voice-library-toggle'));
    fireEvent.change(screen.getByTestId('voice-search-input'), {
      target: { value: 'Voice' },
    });

    expect(screen.getByTestId('voice-profile-card-v1')).toBeInTheDocument();
    expect(screen.queryByTestId('voice-profile-card-v2')).not.toBeInTheDocument();
    expect(screen.getByTestId('voice-profile-card-v3')).toBeInTheDocument();
  });
});
