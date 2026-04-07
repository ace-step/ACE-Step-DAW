/**
 * Session Recording — component integration tests
 *
 * Tests the arm button, record button on empty slots, recording state,
 * fixed-length controls, and overdub toggle in the SessionView.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock child components
vi.mock('../SessionMixer', () => ({
  SessionMixer: () => null,
}));

const mockToggleArmTrack = vi.fn();
const mockAddClip = vi.fn().mockReturnValue({ id: 'clip-new', trackId: 'track-1' });
const mockAssignClipToSessionSlot = vi.fn();

vi.mock('../../../store/projectStore', () => ({
  useProjectStore: vi.fn((selector) =>
    selector({
      project: {
        bpm: 120,
        timeSignature: 4,
        timeSignatureDenominator: 4,
        measures: 4,
        keyScale: 'C major',
        tracks: [
          { id: 'track-1', displayName: 'Piano', trackType: 'pianoRoll', clips: [], color: '#888', order: 0 },
          { id: 'track-2', displayName: 'Audio', trackType: 'stems', clips: [], color: '#999', order: 1 },
        ],
        session: {
          slots: [
            { id: 'slot-1', trackId: 'track-1', sceneId: 'scene-0', clipId: null, hasStopButton: true },
            { id: 'slot-2', trackId: 'track-2', sceneId: 'scene-0', clipId: null, hasStopButton: true },
          ],
          scenes: [{ id: 'scene-0', name: 'Scene 1', index: 0 }],
          sceneCount: 1,
          quantization: '1 bar',
          followActionsEnabled: false,
          pendingLaunches: [],
        },
      },
      setSessionLaunchQuantization: vi.fn(),
      setSessionSlotQuantization: vi.fn(),
      setSessionSlotColor: vi.fn(),
      setSessionSlotLegato: vi.fn(),
      setSessionSlotLaunchMode: vi.fn(),
      setSessionSlotFollowAction: vi.fn(),
      setSessionFollowActionsEnabled: vi.fn(),
      setSessionSlotTempo: vi.fn(),
      setSessionSlotTimeSignature: vi.fn(),
      setSessionSlotStopButton: vi.fn(),
      setSessionSceneFollowAction: vi.fn(),
      setSessionSceneFollowActionConfig: vi.fn(),
      clearSessionSceneFollowActionConfig: vi.fn(),
      updateSessionSceneProperties: vi.fn(),
      captureMidi: vi.fn(),
      addClip: mockAddClip,
      assignClipToSessionSlot: mockAssignClipToSessionSlot,
    }),
  ),
}));

vi.mock('../../../store/transportStore', () => ({
  useTransportStore: vi.fn((selector) =>
    selector({
      launchedSessionClips: {},
      currentTime: 0,
      armedTrackIds: ['track-1'],
      sessionArrangementRecording: false,
      toggleArmTrack: mockToggleArmTrack,
    }),
  ),
}));

vi.mock('../../../store/uiStore', () => {
  const state = {
    selectedSessionSlot: null,
    setSelectedSessionSlot: vi.fn(),
    setKeyboardContext: vi.fn(),
    setMainView: vi.fn(),
    keyboardContext: { scope: 'global', trackId: null },
  };
  const useUIStore = vi.fn((selector: (s: typeof state) => unknown) => (typeof selector === 'function' ? selector(state) : state));
  useUIStore.getState = () => state;
  return { useUIStore };
});

vi.mock('../../../hooks/useTransport', () => ({
  useTransport: () => ({
    launchSessionClip: vi.fn(),
    stopSessionTrack: vi.fn(),
    stopAllSessionClips: vi.fn(),
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

vi.mock('../../../hooks/useSessionMidiController', () => ({
  useSessionMidiController: () => ({ isConnected: false, deviceName: null }),
}));

vi.mock('../../../services/midiCaptureService', () => ({
  getMidiCaptureService: () => ({
    hasEvents: () => false,
  }),
}));

vi.mock('../../../services/sessionRecordingService', () => {
  const service = {
    startRecording: vi.fn(),
    stopRecording: vi.fn().mockReturnValue({
      slotId: 'slot-1',
      trackId: 'track-1',
      trackType: 'pianoRoll',
      clipDuration: 8,
      midiNotes: [{ pitch: 60, velocity: 0.8, startBeat: 0, durationBeats: 1 }],
    }),
    getActiveRecordings: vi.fn().mockReturnValue({}),
    isSlotRecording: vi.fn().mockReturnValue(false),
    stopAll: vi.fn().mockReturnValue([]),
    setFixedLengthBars: vi.fn(),
    getFixedLengthBars: vi.fn().mockReturnValue(null),
    setOverdubMode: vi.fn(),
    isOverdubMode: vi.fn().mockReturnValue(false),
    setCountInBars: vi.fn(),
    getCountInBars: vi.fn().mockReturnValue(0),
  };
  return {
    getSessionRecordingService: () => service,
    SessionRecordingService: vi.fn().mockImplementation(() => service),
  };
});

vi.mock('../../../services/generationPipeline', () => ({
  generateSingleClip: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../hooks/useToast', () => ({
  toastError: vi.fn(),
}));

import { SessionView } from '../SessionView';

describe('Session Recording UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders arm button for each track', () => {
    render(<SessionView />);
    expect(screen.getByTestId('arm-track-track-1')).toBeInTheDocument();
    expect(screen.getByTestId('arm-track-track-2')).toBeInTheDocument();
  });

  it('arm button shows armed state for armed tracks', () => {
    render(<SessionView />);
    const armButton = screen.getByTestId('arm-track-track-1');
    // track-1 is armed (in armedTrackIds mock)
    expect(armButton).toHaveAttribute('aria-label', 'Disarm Piano');
  });

  it('arm button shows unarmed state for unarmed tracks', () => {
    render(<SessionView />);
    const armButton = screen.getByTestId('arm-track-track-2');
    expect(armButton).toHaveAttribute('aria-label', 'Arm Audio for recording');
  });

  it('clicking arm button calls toggleArmTrack', () => {
    render(<SessionView />);
    fireEvent.click(screen.getByTestId('arm-track-track-2'));
    expect(mockToggleArmTrack).toHaveBeenCalledWith('track-2');
  });

  it('shows record button on empty slots when track is armed', () => {
    render(<SessionView />);
    // track-1 is armed and has empty slot — should show record button
    expect(screen.getByTestId('record-slot-track-1-0')).toBeInTheDocument();
  });

  it('does not show record button on empty slots when track is not armed', () => {
    render(<SessionView />);
    // track-2 is NOT armed — should show stop/empty button, not record
    expect(screen.queryByTestId('record-slot-track-2-0')).not.toBeInTheDocument();
  });

  it('record button has correct label', () => {
    render(<SessionView />);
    const recordBtn = screen.getByTestId('record-slot-track-1-0');
    expect(recordBtn).toHaveAttribute('aria-label', 'Record into Piano scene 1');
  });

  it('renders fixed-length select in toolbar', () => {
    render(<SessionView />);
    expect(screen.getByTestId('fixed-length-select')).toBeInTheDocument();
  });

  it('renders overdub toggle in toolbar', () => {
    render(<SessionView />);
    expect(screen.getByTestId('overdub-toggle')).toBeInTheDocument();
  });

  it('overdub toggle starts in OFF state', () => {
    render(<SessionView />);
    expect(screen.getByTestId('overdub-toggle')).toHaveTextContent('Overdub OFF');
  });

  it('renders count-in select in toolbar', () => {
    render(<SessionView />);
    expect(screen.getByTestId('count-in-select')).toBeInTheDocument();
  });

  it('count-in defaults to no count-in', () => {
    render(<SessionView />);
    const select = screen.getByTestId('count-in-select') as HTMLSelectElement;
    expect(select.value).toBe('0');
  });
});
