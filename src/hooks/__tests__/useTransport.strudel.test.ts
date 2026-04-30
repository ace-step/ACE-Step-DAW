import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  engine: {
    resume: vi.fn(async () => {}),
    clearMidiEvents: vi.fn(),
    refreshPlaybackLatencyCompensation: vi.fn(() => 0),
    stop: vi.fn(),
    getCurrentTime: vi.fn(() => 3.5),
    setOnEndedCallback: vi.fn(),
    stopAllSources: vi.fn(),
    trackNodes: new Map(),
    updateSoloState: vi.fn(),
    syncSends: vi.fn(),
    setPlaybackLatencyCompensation: vi.fn(),
    applyMastering: vi.fn(),
    masterVolume: 1,
    playing: false,
  },
  tauriClock: { owner: 'web-audio' as 'native' | 'web-audio' },
  setTauriPlaybackClockOwner: vi.fn((owner: 'native' | 'web-audio') => {
    mocks.tauriClock.owner = owner;
  }),
  stopRecording: vi.fn(async () => {}),
  onLoopCycle: vi.fn(async () => {}),
  stopAllStrudelTracks: vi.fn(),
  stopStrudelEditorPlayback: vi.fn(),
}));

vi.mock('tone', () => ({}));
vi.mock('../useAudioEngine', () => ({
  getAudioEngine: () => mocks.engine,
  getTauriPlaybackClockOwner: () => mocks.tauriClock.owner,
  setTauriPlaybackClockOwner: (owner: 'native' | 'web-audio') => mocks.setTauriPlaybackClockOwner(owner),
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
  },
}));
vi.mock('../../engine/AutomationEngine', () => ({
  automationEngine: {
    stop: vi.fn(),
    start: vi.fn(),
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
  loadAudioBlobByKey: vi.fn(async () => null),
}));
vi.mock('../useToast', () => ({
  toastInfo: vi.fn(),
}));

import { useTransport } from '../useTransport';
import { useProjectStore } from '../../store/projectStore';
import { useTransportStore } from '../../store/transportStore';
import { useUIStore } from '../../store/uiStore';

describe('useTransport strudel controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tauriClock.owner = 'web-audio';
    useProjectStore.getState().createProject('Transport Test');
    useTransportStore.setState({
      isPlaying: true,
      isRecording: false,
      currentTime: 0,
      playStartTime: 0,
    });
    useUIStore.setState({ mainView: 'arrangement' });
  });

  it('stops strudel editor playback and track playback when pausing transport', async () => {
    const { result } = renderHook(() => useTransport());

    await act(async () => {
      await result.current.pause();
    });

    expect(mocks.stopStrudelEditorPlayback).toHaveBeenCalledTimes(1);
    expect(mocks.stopAllStrudelTracks).toHaveBeenCalledTimes(1);
    expect(mocks.engine.stop).toHaveBeenCalledTimes(1);
  });
});
