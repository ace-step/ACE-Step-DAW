import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { VoiceVerificationModal } from '../VoiceVerificationModal';
import { useVoiceVerificationStore } from '../../../store/voiceVerificationStore';

// Mock the service
vi.mock('../../../services/voiceVerificationService', () => ({
  getRandomPhrase: vi.fn((lang?: string) => ({
    id: lang === 'zh' ? 'zh-1' : 'en-1',
    text: 'The quick brown fox jumps over the lazy dog.',
    language: lang || 'en',
  })),
  submitVerification: vi.fn(),
  VoiceRecorder: vi.fn().mockImplementation(() => ({
    isRecording: false,
    duration: 0,
    startRecording: vi.fn(),
    stopRecording: vi.fn().mockResolvedValue(new Blob(['audio'], { type: 'audio/webm' })),
    dispose: vi.fn(),
  })),
}));

describe('VoiceVerificationModal', () => {
  beforeEach(() => {
    useVoiceVerificationStore.getState().reset();
    useVoiceVerificationStore.getState().updateSettings({
      enabled: true,
      micDeviceId: null,
      minRecordingDurationSec: 3,
      maxRetries: 3,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing when modal is closed', () => {
    const { container } = render(<VoiceVerificationModal />);
    expect(container.innerHTML).toBe('');
  });

  it('renders modal when open', () => {
    const singingBlob = new Blob(['singing'], { type: 'audio/webm' });
    act(() => {
      useVoiceVerificationStore.getState().openVerification(singingBlob);
    });

    render(<VoiceVerificationModal />);

    expect(screen.getByText('Voice Identity Verification')).toBeTruthy();
    expect(screen.getByText(/read the phrase below aloud/i)).toBeTruthy();
  });

  it('displays the verification phrase', () => {
    const singingBlob = new Blob(['singing'], { type: 'audio/webm' });
    act(() => {
      useVoiceVerificationStore.getState().openVerification(singingBlob);
    });

    render(<VoiceVerificationModal />);

    expect(screen.getByText('The quick brown fox jumps over the lazy dog.')).toBeTruthy();
    expect(screen.getByText(/read this phrase aloud/i)).toBeTruthy();
  });

  it('shows Start Recording button', () => {
    const singingBlob = new Blob(['singing'], { type: 'audio/webm' });
    act(() => {
      useVoiceVerificationStore.getState().openVerification(singingBlob);
    });

    render(<VoiceVerificationModal />);

    expect(screen.getByText('Start Recording')).toBeTruthy();
  });

  it('shows Verify My Voice button when spoken audio is ready', () => {
    const singingBlob = new Blob(['singing'], { type: 'audio/webm' });
    act(() => {
      useVoiceVerificationStore.getState().openVerification(singingBlob);
      useVoiceVerificationStore.setState({
        spokenAudioBlob: new Blob(['spoken'], { type: 'audio/webm' }),
      });
    });

    render(<VoiceVerificationModal />);

    expect(screen.getByText('Verify My Voice')).toBeTruthy();
  });

  it('shows success state when verified', () => {
    const singingBlob = new Blob(['singing'], { type: 'audio/webm' });
    act(() => {
      useVoiceVerificationStore.getState().openVerification(singingBlob);
      useVoiceVerificationStore.setState({
        status: 'verified',
        result: { verified: true, confidence: 0.95, message: 'Voice matched' },
      });
    });

    render(<VoiceVerificationModal />);

    expect(screen.getByText('Verification Successful')).toBeTruthy();
    expect(screen.getByText(/confidence: 95%/)).toBeTruthy();
    expect(screen.getByText('Continue')).toBeTruthy();
  });

  it('shows rejection state with retry button', () => {
    const singingBlob = new Blob(['singing'], { type: 'audio/webm' });
    act(() => {
      useVoiceVerificationStore.getState().openVerification(singingBlob);
      useVoiceVerificationStore.setState({
        status: 'rejected',
        result: { verified: false, confidence: 0.2, message: 'No match' },
      });
    });

    render(<VoiceVerificationModal />);

    expect(screen.getByText('Verification Failed')).toBeTruthy();
    expect(screen.getByText('Try Again')).toBeTruthy();
  });

  it('shows error message', () => {
    const singingBlob = new Blob(['singing'], { type: 'audio/webm' });
    act(() => {
      useVoiceVerificationStore.getState().openVerification(singingBlob);
      useVoiceVerificationStore.setState({
        status: 'error',
        error: 'Microphone access denied',
      });
    });

    render(<VoiceVerificationModal />);

    expect(screen.getByText('Microphone access denied')).toBeTruthy();
  });

  it('shows submitting spinner', () => {
    const singingBlob = new Blob(['singing'], { type: 'audio/webm' });
    act(() => {
      useVoiceVerificationStore.getState().openVerification(singingBlob);
      useVoiceVerificationStore.setState({ status: 'submitting' });
    });

    render(<VoiceVerificationModal />);

    expect(screen.getByText('Verifying identity...')).toBeTruthy();
  });

  it('closes modal on Cancel click', () => {
    const singingBlob = new Blob(['singing'], { type: 'audio/webm' });
    act(() => {
      useVoiceVerificationStore.getState().openVerification(singingBlob);
    });

    render(<VoiceVerificationModal />);

    fireEvent.click(screen.getByText('Cancel'));

    expect(useVoiceVerificationStore.getState().modalOpen).toBe(false);
  });

  it('closes modal on Escape key', () => {
    const singingBlob = new Blob(['singing'], { type: 'audio/webm' });
    act(() => {
      useVoiceVerificationStore.getState().openVerification(singingBlob);
    });

    render(<VoiceVerificationModal />);

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(useVoiceVerificationStore.getState().modalOpen).toBe(false);
  });

  it('shows retry attempt counter', () => {
    const singingBlob = new Blob(['singing'], { type: 'audio/webm' });
    act(() => {
      useVoiceVerificationStore.getState().openVerification(singingBlob);
      useVoiceVerificationStore.setState({ retryCount: 1 });
    });

    render(<VoiceVerificationModal />);

    expect(screen.getByText(/Attempt 2 of 4/)).toBeTruthy();
  });

  it('has proper aria attributes', () => {
    const singingBlob = new Blob(['singing'], { type: 'audio/webm' });
    act(() => {
      useVoiceVerificationStore.getState().openVerification(singingBlob);
    });

    render(<VoiceVerificationModal />);

    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-label')).toBe('Voice identity verification');
  });
});
