import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VoiceVerificationModal } from '../VoiceVerificationModal';
import { useUIStore } from '../../../store/uiStore';
import { useVoiceVerificationStore } from '../../../store/voiceVerificationStore';

vi.mock('../../../services/aceStepApi', () => ({
  getVerificationPhrase: vi.fn().mockResolvedValue({ phrase_id: 'p-1', text: 'The quick brown fox', language: 'en' }),
  verifyVoiceIdentity: vi.fn().mockResolvedValue({ match: true, confidence: 0.95, phrase_id: 'p-1' }),
  listCustomModels: vi.fn().mockResolvedValue({ models: [] }),
}));

vi.mock('../../../services/projectStorage', () => ({ saveProject: vi.fn() }));

vi.mock('../../../engine/RecordingEngine', () => ({
  recordingEngine: {
    hasPermission: true,
    requestPermission: vi.fn().mockResolvedValue(true),
    startRecording: vi.fn().mockResolvedValue(true),
    stopRecording: vi.fn().mockResolvedValue({ audioBuffer: { getChannelData: () => new Float32Array(100), sampleRate: 44100, numberOfChannels: 1, duration: 5, length: 220500 }, waveformData: [], duration: 5 }),
    getInputLevelLinear: vi.fn().mockReturnValue(0.5),
  },
}));

vi.mock('../../../utils/wav', () => ({
  audioBufferToWavBlob: vi.fn().mockReturnValue(new Blob(['audio'], { type: 'audio/wav' })),
}));

function setupVisible() {
  useUIStore.setState({ showVoiceVerificationModal: true });
  useVoiceVerificationStore.setState({
    pendingVoice: null,
    currentPhrase: null,
    verificationStatus: 'idle',
    verificationError: null,
    recordedPhrase: null,
    referenceAudio: null,
    selfHostedSkipEnabled: false,
  });
}

describe('VoiceVerificationModal', () => {
  beforeEach(() => {
    setupVisible();
  });

  it('renders nothing when hidden', () => {
    useUIStore.setState({ showVoiceVerificationModal: false });
    const { container } = render(<VoiceVerificationModal />);
    expect(container.innerHTML).toBe('');
  });

  it('renders when visible', () => {
    render(<VoiceVerificationModal />);
    expect(screen.getByTestId('voice-verification-modal')).toBeInTheDocument();
  });

  it('shows header title', () => {
    render(<VoiceVerificationModal />);
    expect(screen.getByText('Voice Identity Verification')).toBeInTheDocument();
  });

  it('closes on close button click', () => {
    render(<VoiceVerificationModal />);
    fireEvent.click(screen.getByTestId('voice-verify-close'));
    expect(useUIStore.getState().showVoiceVerificationModal).toBe(false);
  });

  it('shows profile name input on step 1', () => {
    render(<VoiceVerificationModal />);
    expect(screen.getByLabelText(/voice profile name/i)).toBeInTheDocument();
  });

  it('shows record reference button', () => {
    render(<VoiceVerificationModal />);
    expect(screen.getByText(/record reference/i)).toBeInTheDocument();
  });

  it('shows upload button', () => {
    render(<VoiceVerificationModal />);
    expect(screen.getByText('Upload')).toBeInTheDocument();
  });

  it('disables next button without name or reference', () => {
    render(<VoiceVerificationModal />);
    const nextBtn = screen.getByText('Next');
    expect(nextBtn).toBeDisabled();
  });

  it('shows skip option when self-hosted mode is enabled', () => {
    useVoiceVerificationStore.setState({ selfHostedSkipEnabled: true });
    render(<VoiceVerificationModal />);
    expect(screen.getByText(/skip verification/i)).toBeInTheDocument();
  });

  it('does not show skip option when self-hosted mode is disabled', () => {
    render(<VoiceVerificationModal />);
    expect(screen.queryByText(/skip verification/i)).not.toBeInTheDocument();
  });

  it('always starts on reference step regardless of store state', () => {
    useVoiceVerificationStore.setState({
      verificationStatus: 'verified',
    });
    render(<VoiceVerificationModal />);
    // Modal resets to step 1 on open, so reference step shows even if store says verified
    expect(screen.getByText(/reference audio/i)).toBeInTheDocument();
  });
});
