import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTransportStore } from '../../store/transportStore';
import { useProjectStore } from '../../store/projectStore';

// Mock RecordingEngine
const mockRequestPermission = vi.fn().mockResolvedValue(true);
const mockStartRecording = vi.fn().mockResolvedValue(true);
const mockStopAllRecordings = vi.fn().mockResolvedValue(new Map());
const mockSetMonitoring = vi.fn();
const mockGetCountInLength = vi.fn().mockReturnValue('off');
const mockGetSession = vi.fn().mockReturnValue(undefined);
let mockHasPermission = false;
const mockSetCountInLength = vi.fn();

vi.mock('../../engine/RecordingEngine', () => ({
  recordingEngine: {
    requestPermission: (...args: unknown[]) => mockRequestPermission(...args),
    startRecording: (...args: unknown[]) => mockStartRecording(...args),
    stopAllRecordings: (...args: unknown[]) => mockStopAllRecordings(...args),
    setMonitoring: (...args: unknown[]) => mockSetMonitoring(...args),
    getCountInLength: () => mockGetCountInLength(),
    setCountInLength: (...args: unknown[]) => mockSetCountInLength(...args),
    getSession: (...args: unknown[]) => mockGetSession(...args),
    get hasPermission() { return mockHasPermission; },
    get denied() { return false; },
    playCountIn: vi.fn(),
  },
}));

vi.mock('../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

vi.mock('../../services/audioFileManager', () => ({
  saveAudioBlob: vi.fn().mockResolvedValue('audio-key-1'),
}));

vi.mock('../../utils/waveformPeaks', () => ({
  computeWaveformWithMipmap: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
}));

vi.mock('../../utils/wav', () => ({
  audioBufferToWavBlob: vi.fn().mockReturnValue(new Blob()),
}));

// Dynamic import after mocks are set up
const { useRecording } = await import('../../hooks/useRecording');

describe('useRecording', () => {
  beforeEach(() => {
    mockHasPermission = false;
    mockRequestPermission.mockClear().mockResolvedValue(true);
    mockStartRecording.mockClear().mockResolvedValue(true);
    mockStopAllRecordings.mockClear().mockResolvedValue(new Map());
    mockSetMonitoring.mockClear();
    mockGetCountInLength.mockReturnValue('off');

    useTransportStore.setState({
      isRecording: false,
      armedTrackIds: [],
      currentTime: 0,
      punchEnabled: false,
      punchInTime: null,
      punchOutTime: null,
    });
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject();
  });

  it('returns isRecording from transport store', () => {
    const { result } = renderHook(() => useRecording());
    expect(result.current.isRecording).toBe(false);

    act(() => { useTransportStore.getState().setIsRecording(true); });
    expect(result.current.isRecording).toBe(true);
  });

  it('returns armedTrackIds from transport store', () => {
    const { result } = renderHook(() => useRecording());
    expect(result.current.armedTrackIds).toEqual([]);

    act(() => { useTransportStore.getState().armTrack('track-1'); });
    expect(result.current.armedTrackIds).toEqual(['track-1']);
  });

  it('armTrack sets monitoring and updates track armed state', () => {
    const { result } = renderHook(() => useRecording());

    act(() => { result.current.armTrack('track-1'); });

    expect(mockSetMonitoring).toHaveBeenCalledWith('track-1', true);
    expect(useTransportStore.getState().armedTrackIds).toContain('track-1');
  });

  it('disarmTrack clears monitoring and updates track armed state', () => {
    const { result } = renderHook(() => useRecording());

    act(() => { result.current.armTrack('track-1'); });
    act(() => { result.current.disarmTrack('track-1'); });

    expect(mockSetMonitoring).toHaveBeenCalledWith('track-1', false);
    expect(useTransportStore.getState().armedTrackIds).not.toContain('track-1');
  });

  it('toggleRecord shows error when no tracks armed', async () => {
    const { result } = renderHook(() => useRecording());

    await act(async () => { await result.current.toggleRecord(); });

    // Should not have requested permission or started recording
    expect(mockRequestPermission).not.toHaveBeenCalled();
    expect(result.current.isRecording).toBe(false);
  });

  it('toggleRecord requests mic permission when tracks are armed', async () => {
    const { result } = renderHook(() => useRecording());

    act(() => { useTransportStore.getState().armTrack('track-1'); });

    await act(async () => { await result.current.toggleRecord(); });

    expect(mockRequestPermission).toHaveBeenCalled();
  });

  it('toggleRecord does not start recording when permission denied', async () => {
    mockRequestPermission.mockResolvedValueOnce(false);
    const { result } = renderHook(() => useRecording());

    act(() => { useTransportStore.getState().armTrack('track-1'); });

    await act(async () => { await result.current.toggleRecord(); });

    expect(result.current.isRecording).toBe(false);
    expect(mockStartRecording).not.toHaveBeenCalled();
  });

  it('toggleRecord starts recording for each armed track', async () => {
    const { result } = renderHook(() => useRecording());

    act(() => {
      useTransportStore.getState().armTrack('track-1');
      useTransportStore.getState().armTrack('track-2');
    });

    await act(async () => { await result.current.toggleRecord(); });

    expect(mockStartRecording).toHaveBeenCalledTimes(2);
    expect(result.current.isRecording).toBe(true);
  });

  it('toggleArmTrack with exclusive mode disarms other tracks', () => {
    const { result } = renderHook(() => useRecording());

    act(() => { result.current.armTrack('track-1'); });
    act(() => { result.current.toggleArmTrack('track-2', true); });

    expect(useTransportStore.getState().armedTrackIds).not.toContain('track-1');
    expect(mockSetMonitoring).toHaveBeenCalledWith('track-1', false);
  });

  it('toggleArmTrack disarms when already armed', () => {
    const { result } = renderHook(() => useRecording());

    act(() => { result.current.armTrack('track-1'); });
    act(() => { result.current.toggleArmTrack('track-1'); });

    expect(useTransportStore.getState().armedTrackIds).not.toContain('track-1');
  });

  it('hasPermission reflects recordingEngine state', () => {
    const { result } = renderHook(() => useRecording());
    expect(result.current.hasPermission).toBe(false);

    mockHasPermission = true;
    const { result: result2 } = renderHook(() => useRecording());
    expect(result2.current.hasPermission).toBe(true);
  });

  it('stopRecording processes audio buffers from all armed tracks', async () => {
    const mockBuffer = {
      duration: 2, length: 96000, sampleRate: 48000, numberOfChannels: 1,
      getChannelData: () => new Float32Array(96000),
    };
    mockStopAllRecordings.mockResolvedValue(
      new Map([
        ['track-1', { audioBuffer: mockBuffer, waveformData: [0.1, 0.2], duration: 2 }],
      ]),
    );

    const { result } = renderHook(() => useRecording());

    // Set up armed track and start recording
    act(() => {
      useTransportStore.getState().armTrack('track-1');
      useTransportStore.getState().setIsRecording(true);
    });

    await act(async () => { await result.current.stopRecording(); });

    expect(mockStopAllRecordings).toHaveBeenCalled();
    expect(result.current.isRecording).toBe(false);
  });

  it('toggleRecord stops recording when already recording', async () => {
    const { result } = renderHook(() => useRecording());

    act(() => {
      useTransportStore.getState().setIsRecording(true);
      useTransportStore.getState().armTrack('track-1');
    });

    await act(async () => { await result.current.toggleRecord(); });

    expect(mockStopAllRecordings).toHaveBeenCalled();
    expect(result.current.isRecording).toBe(false);
  });

  describe('count-in sync', () => {
    it('syncs countInBars=0 as off to recording engine', async () => {
      const { result } = renderHook(() => useRecording());
      act(() => {
        useTransportStore.getState().armTrack('track-1');
        useTransportStore.getState().setCountInBars(0);
      });
      await act(async () => { await result.current.toggleRecord(); });
      expect(mockSetCountInLength).toHaveBeenCalledWith('off');
    });

    it('syncs countInBars=1 as 1bar to recording engine', async () => {
      const { result } = renderHook(() => useRecording());
      act(() => {
        useTransportStore.getState().armTrack('track-1');
        useTransportStore.getState().setCountInBars(1);
      });
      await act(async () => { await result.current.toggleRecord(); });
      expect(mockSetCountInLength).toHaveBeenCalledWith('1bar');
    });

    it('syncs countInBars=2 as 2bars to recording engine', async () => {
      const { result } = renderHook(() => useRecording());
      act(() => {
        useTransportStore.getState().armTrack('track-1');
        useTransportStore.getState().setCountInBars(2);
      });
      await act(async () => { await result.current.toggleRecord(); });
      expect(mockSetCountInLength).toHaveBeenCalledWith('2bars');
    });
  });
});
