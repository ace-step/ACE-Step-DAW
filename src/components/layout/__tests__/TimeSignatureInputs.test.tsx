import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Toolbar } from '../Toolbar';
import { useProjectStore } from '../../../store/projectStore';

vi.mock('../../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

vi.mock('../../../hooks/useAudioEngine', () => ({
  useAudioEngine: () => ({
    resumeOnGesture: vi.fn(),
  }),
}));

vi.mock('../../../hooks/useTransport', () => ({
  useTransport: () => ({
    isPlaying: false,
    play: vi.fn(),
    pause: vi.fn(),
    stop: vi.fn(),
  }),
}));

vi.mock('../../../hooks/useRecording', () => ({
  useRecording: () => ({
    toggleRecord: vi.fn(),
    armedTrackIds: [],
    toggleArmTrack: vi.fn(),
  }),
}));

vi.mock('../../../services/midiCaptureService', () => ({
  getMidiCaptureService: () => ({
    getBufferedNotes: () => [],
  }),
}));

const DEFAULT_PROJECT = {
  id: 'test-project',
  name: 'Test',
  bpm: 120,
  timeSignature: 4,
  measures: 64,
  totalDuration: 128,
  tracks: [],
  tempoMap: [],
  timeSignatureMap: [],
  sampleRate: 44100,
  keyScale: 'C major',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  masterVolume: 0,
};

describe('Time signature number inputs', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: DEFAULT_PROJECT as never });
  });

  it('renders numerator as a number input instead of a dropdown', () => {
    render(<Toolbar />);

    const numerator = screen.getByLabelText('Time signature numerator');
    expect(numerator).toBeInTheDocument();
    expect(numerator.tagName).toBe('INPUT');
  });

  it('does not render a time signature dropdown select', () => {
    render(<Toolbar />);

    const select = screen.queryByLabelText('Project time signature');
    expect(select).toBeNull();
  });

  it('shows denominator label', () => {
    render(<Toolbar />);

    const denominator = screen.getByLabelText('Time signature denominator');
    expect(denominator).toBeInTheDocument();
  });

  it('updates numerator on blur', () => {
    render(<Toolbar />);

    const numerator = screen.getByLabelText('Time signature numerator');
    fireEvent.change(numerator, { target: { value: '3' } });
    fireEvent.blur(numerator);

    const state = useProjectStore.getState();
    expect(state.project?.timeSignature).toBe(3);
  });
});
