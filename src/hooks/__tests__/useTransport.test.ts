import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  engine: {
    resume: vi.fn(async () => {}),
    clearMidiEvents: vi.fn(),
    refreshPlaybackLatencyCompensation: vi.fn(() => 0),
    stop: vi.fn(),
    getCurrentTime: vi.fn(() => 0),
    setOnEndedCallback: vi.fn(),
    trackNodes: new Map(),
    updateSoloState: vi.fn(),
    syncSends: vi.fn(),
    setPlaybackLatencyCompensation: vi.fn(),
    applyMastering: vi.fn(),
    masterVolume: 1,
    playing: false,
    scheduleClip: vi.fn(async () => {}),
    scheduleMidiPlayback: vi.fn(async () => {}),
    play: vi.fn(async () => {}),
    schedulePlayback: vi.fn(),
    scheduleMetronome: vi.fn(),
    clearBufferCache: vi.fn(),
    setMasterVolume: vi.fn(),
    ensureTrackNode: vi.fn(() => ({
      volume: { value: 0 },
      pan: { value: 0 },
      mute: false,
    })),
    setTrackVolume: vi.fn(),
    setTrackPan: vi.fn(),
    setTrackMute: vi.fn(),
    setTrackSolo: vi.fn(),
  },
  stopRecording: vi.fn(async () => {}),
  onLoopCycle: vi.fn(async () => {}),
  stopAllStrudelTracks: vi.fn(),
  stopStrudelEditorPlayback: vi.fn(),
  loadAudioBlobByKey: vi.fn(async () => null),
}));

vi.mock('tone', () => ({
  start: vi.fn(async () => {}),
  getContext: vi.fn(() => ({ state: 'running' })),
  getTransport: vi.fn(() => ({ bpm: { value: 120 }, seconds: 0, start: vi.fn(), stop: vi.fn(), pause: vi.fn(), cancel: vi.fn() })),
  now: vi.fn(() => 0),
}));
vi.mock('../useAudioEngine', () => ({
  getAudioEngine: () => mocks.engine,
}));
vi.mock('../useRecording', () => ({
  useRecording: () => ({
    stopRecording: mocks.stopRecording,
    onLoopCycle: mocks.onLoopCycle,
  }),
}));
vi.mock('../../engine/SynthEngine', () => ({
  synthEngine: {
    ensureStarted: vi.fn(async () => {}),
    releaseAll: vi.fn(),
  },
}));
vi.mock('../../engine/SubtractiveEngine', () => ({
  subtractiveEngine: {
    ensureStarted: vi.fn(async () => {}),
    releaseAll: vi.fn(),
  },
}));
vi.mock('../../engine/WavetableEngine', () => ({
  wavetableEngine: {
    ensureStarted: vi.fn(async () => {}),
    releaseAll: vi.fn(),
  },
}));
vi.mock('../../engine/SamplerEngine', () => ({
  createSamplerConfig: vi.fn(),
  samplerEngine: {
    ensureStarted: vi.fn(async () => {}),
    stopAll: vi.fn(),
  },
}));
vi.mock('../../engine/DrumEngine', () => ({
  drumEngine: {
    ensureStarted: vi.fn(async () => {}),
    stop: vi.fn(),
  },
}));
vi.mock('../../engine/ModulationEngine', () => ({
  modulationEngine: {
    stop: vi.fn(),
    start: vi.fn(),
    releaseAll: vi.fn(),
  },
}));
vi.mock('../../engine/AutomationEngine', () => ({
  automationEngine: {
    stop: vi.fn(),
    start: vi.fn(),
  },
}));
vi.mock('../../engine/PluginEngine', () => ({
  pluginEngine: {
    stop: vi.fn(),
  },
}));
vi.mock('../../engine/strudelEngine', () => ({
  stopAllStrudelTracks: mocks.stopAllStrudelTracks,
  startStrudelTrack: vi.fn(async () => {}),
  stopStrudelTrack: vi.fn(),
  setAllStrudelBpm: vi.fn(),
  hasStrudelRepl: vi.fn(() => false),
}));
vi.mock('../../engine/strudelEditorPlayback', () => ({
  stopStrudelEditorPlayback: mocks.stopStrudelEditorPlayback,
}));
vi.mock('../../services/audioFileManager', () => ({
  loadAudioBlobByKey: (...args: unknown[]) => mocks.loadAudioBlobByKey(...args),
}));
vi.mock('../useToast', () => ({
  toastInfo: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

import { useTransport } from '../useTransport';
import { useProjectStore } from '../../store/projectStore';
import { useTransportStore } from '../../store/transportStore';
import { useUIStore } from '../../store/uiStore';

describe('useTransport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useTransportStore.setState(useTransportStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    useProjectStore.getState().createProject({ name: 'Transport Test' });
    useUIStore.setState({ mainView: 'arrangement' });
    mocks.engine.playing = false;
  });

  // ── play() ──

  it('sets isPlaying to true after play()', async () => {
    const { result } = renderHook(() => useTransport());

    await act(async () => {
      await result.current.play();
    });

    expect(useTransportStore.getState().isPlaying).toBe(true);
  });

  it('play() is idempotent on transport state when called twice', async () => {
    const { result } = renderHook(() => useTransport());

    await act(async () => {
      await result.current.play();
    });
    expect(useTransportStore.getState().isPlaying).toBe(true);

    // Calling play again should not error
    await act(async () => {
      await result.current.play();
    });
    expect(useTransportStore.getState().isPlaying).toBe(true);
  });

  it('passes metronome sound and volume settings into playback scheduling', async () => {
    useTransportStore.setState({
      metronomeEnabled: true,
      metronomeSound: 'woodblock',
      metronomeVolume: 0.8,
    });
    const { result } = renderHook(() => useTransport());

    await act(async () => {
      await result.current.play();
    });

    expect(mocks.engine.scheduleMetronome).toHaveBeenCalledWith(
      120,
      4,
      4,
      0,
      256,
      undefined,
      undefined,
      { sound: 'woodblock', volume: 0.8 },
    );
  });

  // ── pause() ──

  it('stops all engines and strudel when pausing', async () => {
    useTransportStore.setState({ isPlaying: true });
    const { result } = renderHook(() => useTransport());

    await act(async () => {
      await result.current.pause();
    });

    expect(mocks.engine.stop).toHaveBeenCalledTimes(1);
    expect(mocks.stopAllStrudelTracks).toHaveBeenCalledTimes(1);
    expect(mocks.stopStrudelEditorPlayback).toHaveBeenCalledTimes(1);
  });

  it('sets isPlaying to false after pause()', async () => {
    useTransportStore.setState({ isPlaying: true });
    const { result } = renderHook(() => useTransport());

    await act(async () => {
      await result.current.pause();
    });

    expect(useTransportStore.getState().isPlaying).toBe(false);
  });

  it('stops recording when pausing during recording', async () => {
    useTransportStore.setState({ isPlaying: true, isRecording: true });
    const { result } = renderHook(() => useTransport());

    await act(async () => {
      await result.current.pause();
    });

    expect(mocks.stopRecording).toHaveBeenCalledTimes(1);
  });

  // ── stop() ──

  it('resets current time to 0 on stop', async () => {
    useTransportStore.setState({ isPlaying: true, currentTime: 10 });
    const { result } = renderHook(() => useTransport());

    await act(async () => {
      await result.current.stop();
    });

    expect(useTransportStore.getState().isPlaying).toBe(false);
    expect(useTransportStore.getState().currentTime).toBe(0);
  });

  // ── seek() ──

  it('updates current time when seeking', async () => {
    const { result } = renderHook(() => useTransport());

    act(() => {
      result.current.seek(15.5);
    });

    expect(useTransportStore.getState().currentTime).toBe(15.5);
  });

  it('clamps seek to non-negative values', async () => {
    const { result } = renderHook(() => useTransport());

    act(() => {
      result.current.seek(-5);
    });

    expect(useTransportStore.getState().currentTime).toBe(0);
  });

  // ── Hook return values ──

  it('returns current transport state', () => {
    useTransportStore.setState({ isPlaying: true, currentTime: 42 });
    const { result } = renderHook(() => useTransport());

    expect(result.current.isPlaying).toBe(true);
    expect(result.current.currentTime).toBe(42);
  });

  it('exposes session clip operations', () => {
    const { result } = renderHook(() => useTransport());

    expect(typeof result.current.launchSessionClip).toBe('function');
    expect(typeof result.current.stopSessionTrack).toBe('function');
    expect(typeof result.current.stopAllSessionClips).toBe('function');
    expect(typeof result.current.launchSessionScene).toBe('function');
  });
});
