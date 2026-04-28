import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock child components that require AudioContext
vi.mock('../SessionMixer', () => ({
  SessionMixer: () => null,
}));

// Mock stores with minimal state
const mockCaptureMidi = vi.fn();
const mockStopAllSessionClips = vi.fn();

vi.mock('../../../store/projectStore', () => ({
  useProjectStore: vi.fn((selector) =>
    selector({
      project: {
        bpm: 120,
        timeSignature: 4,
        tracks: [
          { id: 'track-1', displayName: 'Track 1', clips: [], color: '#888' },
        ],
        sessionData: {
          slots: [],
          scenes: [{ id: 'scene-0', name: 'Scene 1', index: 0 }],
          sceneCount: 1,
        },
        sessionLaunchQuantization: '1 bar',
        sessionFollowActionsEnabled: false,
      },
      setSessionLaunchQuantization: vi.fn(),
      setSessionSlotQuantization: vi.fn(),
      setSessionSlotColor: vi.fn(),
      setSessionSlotLegato: vi.fn(),
      setSessionSlotLaunchMode: vi.fn(),
      setSessionSlotFollowAction: vi.fn(),
      setSessionFollowActionsEnabled: vi.fn(),
      captureMidi: mockCaptureMidi,
      updateSessionSceneProperties: vi.fn(),
      setSessionSceneFollowAction: vi.fn(),
    }),
  ),
}));

vi.mock('../../../store/transportStore', () => ({
  useTransportStore: vi.fn((selector) =>
    selector({
      launchedSessionClips: {},
      currentTime: 10.0,
      armedTrackIds: ['track-1'],
      sessionArrangementRecording: false,
      pendingSessionLaunches: [],
    }),
  ),
}));

vi.mock('../../../store/uiStore', () => {
  const state = {
    selectedSessionSlot: null,
    setSelectedSessionSlot: vi.fn(),
    setKeyboardContext: vi.fn(),
    setMainView: vi.fn(),
    mainView: 'session',
    keyboardContext: { scope: 'session', trackId: null },
  };
  const hook = vi.fn((selector: (s: typeof state) => unknown) => selector(state));
  (hook as unknown as { getState: () => typeof state }).getState = () => state;
  return { useUIStore: hook };
});

vi.mock('../../../hooks/useTransport', () => ({
  useTransport: () => ({
    launchSessionClip: vi.fn(),
    stopSessionTrack: vi.fn(),
    stopAllSessionClips: mockStopAllSessionClips,
    launchSessionScene: vi.fn(),
    toggleSessionArrangementRecording: vi.fn(),
  }),
}));

vi.mock('../../../hooks/useSessionDragDrop', () => ({
  useSessionDragDrop: () => ({
    dragState: null,
    dropTarget: null,
    handlePointerDown: vi.fn(),
    handlePointerMove: vi.fn(),
    handlePointerUp: vi.fn(),
    cancelDrag: vi.fn(),
  }),
}));

vi.mock('../../../utils/sessionProgress', () => ({
  getSessionSlotProgress: () => 0,
}));

vi.mock('../../../utils/sessionClips', () => ({
  getSessionClips: () => [],
}));

// Import after mocks
import { SessionView } from '../SessionView';

describe('SessionView Capture MIDI', () => {
  beforeEach(() => {
    mockCaptureMidi.mockClear();
  });

  it('renders the Capture MIDI button', () => {
    render(<SessionView />);
    expect(screen.getByLabelText('Capture MIDI from rolling buffer')).toBeInTheDocument();
  });

  it('renders the bar count selector', () => {
    render(<SessionView />);
    expect(screen.getByLabelText('Capture buffer length in bars')).toBeInTheDocument();
  });

  it('enables capture button when a track is armed', () => {
    render(<SessionView />);
    const captureBtn = screen.getByLabelText('Capture MIDI from rolling buffer');
    expect(captureBtn).not.toBeDisabled();
  });

  it('calls captureMidi when capture button is clicked', () => {
    render(<SessionView />);
    fireEvent.click(screen.getByLabelText('Capture MIDI from rolling buffer'));
    expect(mockCaptureMidi).toHaveBeenCalledWith(
      'track-1',
      10.0,
      expect.any(Object), // MidiCaptureService instance
      { bars: 8, quantize: '1/16' }, // default 8 bars with quantization
    );
  });

  it('uses selected bar count for capture', () => {
    render(<SessionView />);
    const select = screen.getByLabelText('Capture buffer length in bars');
    fireEvent.change(select, { target: { value: '4' } });
    fireEvent.click(screen.getByLabelText('Capture MIDI from rolling buffer'));
    expect(mockCaptureMidi).toHaveBeenCalledWith(
      'track-1',
      10.0,
      expect.any(Object),
      { bars: 4, quantize: '1/16' },
    );
  });

  it('shows bar count options: 2, 4, 8, 16, 32', () => {
    render(<SessionView />);
    const select = screen.getByLabelText('Capture buffer length in bars');
    const options = Array.from(select.querySelectorAll('option'));
    expect(options.map((o) => o.value)).toEqual(['2', '4', '8', '16', '32']);
  });
});
