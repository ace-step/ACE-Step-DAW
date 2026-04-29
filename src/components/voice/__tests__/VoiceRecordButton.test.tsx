import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VoiceRecordButton } from '../VoiceRecordButton';

vi.mock('idb-keyval', () => ({
  createStore: vi.fn(() => ({})),
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  keys: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../../engine/RecordingEngine', () => ({
  recordingEngine: {
    requestPermission: vi.fn().mockResolvedValue(true),
    startRecording: vi.fn().mockResolvedValue(undefined),
    stopRecording: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock('../../../utils/wav', () => ({
  audioBufferToWavBlob: vi.fn().mockReturnValue(new Blob(['wav'], { type: 'audio/wav' })),
}));

vi.mock('../../../hooks/useToast', () => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  toastInfo: vi.fn(),
}));

describe('VoiceRecordButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the record button', () => {
    render(<VoiceRecordButton />);
    expect(screen.getByTestId('voice-record-btn')).toBeInTheDocument();
    expect(screen.getByText('Record')).toBeInTheDocument();
  });

  it('shows recording state when clicked', async () => {
    const { recordingEngine } = await import('../../../engine/RecordingEngine');
    vi.mocked(recordingEngine.requestPermission).mockResolvedValue(true);
    vi.mocked(recordingEngine.startRecording).mockResolvedValue(undefined);

    render(<VoiceRecordButton />);
    const btn = screen.getByTestId('voice-record-btn');

    // fireEvent.click is sync, but the handler is async
    fireEvent.click(btn);

    // Wait for the async handler to update state
    await vi.waitFor(() => {
      expect(screen.getByText('0s')).toBeInTheDocument();
    });
  });

  it('shows error when microphone permission is denied', async () => {
    const { recordingEngine } = await import('../../../engine/RecordingEngine');
    vi.mocked(recordingEngine.requestPermission).mockResolvedValue(false);

    render(<VoiceRecordButton />);
    await fireEvent.click(screen.getByTestId('voice-record-btn'));

    const { toastError } = await import('../../../hooks/useToast');
    expect(toastError).toHaveBeenCalledWith('Microphone permission denied');
  });

  it('re-enables stop control when stopping recording fails', async () => {
    const { recordingEngine } = await import('../../../engine/RecordingEngine');
    vi.mocked(recordingEngine.requestPermission).mockResolvedValue(true);
    vi.mocked(recordingEngine.startRecording).mockResolvedValue(undefined);
    vi.mocked(recordingEngine.stopRecording).mockRejectedValueOnce(new Error('engine failed'));

    render(<VoiceRecordButton />);
    const btn = screen.getByTestId('voice-record-btn');

    fireEvent.click(btn);
    await vi.waitFor(() => {
      expect(btn).toHaveAttribute('aria-label', 'Stop recording');
    });

    fireEvent.click(btn);

    const { toastError } = await import('../../../hooks/useToast');
    await vi.waitFor(() => {
      expect(toastError).toHaveBeenCalledWith('Failed to stop recording');
      expect(btn).toHaveAttribute('aria-label', 'Record voice');
      expect(btn).not.toBeDisabled();
    });
  });
});
