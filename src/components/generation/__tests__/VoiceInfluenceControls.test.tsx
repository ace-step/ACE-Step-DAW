import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

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
import { VoiceInfluenceControls } from '../VoiceInfluenceControls';

beforeEach(() => {
  vi.clearAllMocks();
  useVoiceStore.setState({
    profiles: [],
    selectedProfileId: null,
    audioInfluence: 0.4,
    styleInfluence: 0.6,
    loading: false,
    recording: false,
    error: null,
  });
});

describe('VoiceInfluenceControls', () => {
  it('renders nothing when no voice is selected', () => {
    const { container } = render(<VoiceInfluenceControls />);
    expect(container.innerHTML).toBe('');
  });

  it('renders sliders when a voice is selected', () => {
    useVoiceStore.setState({ selectedProfileId: 'v1' });
    render(<VoiceInfluenceControls />);

    expect(screen.getByTestId('voice-influence-controls')).toBeInTheDocument();
    expect(screen.getByTestId('voice-audio-influence-slider')).toBeInTheDocument();
    expect(screen.getByTestId('voice-style-influence-slider')).toBeInTheDocument();
  });

  it('displays current influence values as percentages', () => {
    useVoiceStore.setState({ selectedProfileId: 'v1', audioInfluence: 0.4, styleInfluence: 0.6 });
    render(<VoiceInfluenceControls />);

    expect(screen.getByTestId('voice-audio-influence-value')).toHaveTextContent('40%');
    expect(screen.getByTestId('voice-style-influence-value')).toHaveTextContent('60%');
  });

  it('updates audio influence when slider changes', () => {
    useVoiceStore.setState({ selectedProfileId: 'v1' });
    render(<VoiceInfluenceControls />);

    fireEvent.change(screen.getByTestId('voice-audio-influence-slider'), {
      target: { value: '0.75' },
    });

    expect(useVoiceStore.getState().audioInfluence).toBeCloseTo(0.75);
  });

  it('updates style influence when slider changes', () => {
    useVoiceStore.setState({ selectedProfileId: 'v1' });
    render(<VoiceInfluenceControls />);

    fireEvent.change(screen.getByTestId('voice-style-influence-slider'), {
      target: { value: '0.9' },
    });

    expect(useVoiceStore.getState().styleInfluence).toBeCloseTo(0.9);
  });

  it('renders three preset buttons', () => {
    useVoiceStore.setState({ selectedProfileId: 'v1' });
    render(<VoiceInfluenceControls />);

    expect(screen.getByTestId('voice-preset-natural')).toBeInTheDocument();
    expect(screen.getByTestId('voice-preset-ai-enhanced')).toBeInTheDocument();
    expect(screen.getByTestId('voice-preset-voice-forward')).toBeInTheDocument();
  });

  it('applies "Voice Forward" preset when clicked', () => {
    useVoiceStore.setState({ selectedProfileId: 'v1' });
    render(<VoiceInfluenceControls />);

    fireEvent.click(screen.getByTestId('voice-preset-voice-forward'));

    expect(useVoiceStore.getState().audioInfluence).toBeCloseTo(0.7);
    expect(useVoiceStore.getState().styleInfluence).toBeCloseTo(0.3);
  });

  it('resets values when reset button is clicked', () => {
    useVoiceStore.setState({
      selectedProfileId: 'v1',
      audioInfluence: 0.9,
      styleInfluence: 0.1,
    });
    render(<VoiceInfluenceControls />);

    fireEvent.click(screen.getByTestId('voice-influence-reset'));

    expect(useVoiceStore.getState().audioInfluence).toBeCloseTo(0.4);
    expect(useVoiceStore.getState().styleInfluence).toBeCloseTo(0.6);
  });

  it('disables controls when disabled prop is true', () => {
    useVoiceStore.setState({ selectedProfileId: 'v1' });
    render(<VoiceInfluenceControls disabled />);

    expect(screen.getByTestId('voice-audio-influence-slider')).toBeDisabled();
    expect(screen.getByTestId('voice-style-influence-slider')).toBeDisabled();
    expect(screen.getByTestId('voice-influence-reset')).toBeDisabled();
  });
});
