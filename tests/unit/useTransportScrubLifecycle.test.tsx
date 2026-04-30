import { act, render } from '@testing-library/react';
import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTransport } from '../../src/hooks/useTransport';
import { useProjectStore } from '../../src/store/projectStore';
import { useTransportStore } from '../../src/store/transportStore';
import { useUIStore } from '../../src/store/uiStore';

const engineMock = {
  resume: vi.fn().mockResolvedValue(undefined),
  refreshPlaybackLatencyCompensation: vi.fn(() => ({ baseLatency: 0, outputLatency: 0 })),
  setPlaybackLatencyCompensation: vi.fn(),
  clearMidiEvents: vi.fn(),
  schedulePlayback: vi.fn(),
  scheduleMetronome: vi.fn(),
  startTimelineScrub: vi.fn().mockResolvedValue(undefined),
  updateTimelineScrub: vi.fn().mockResolvedValue(undefined),
  stopTimelineScrub: vi.fn(),
  stopAllSources: vi.fn(),
  stop: vi.fn(),
  getCurrentTime: vi.fn(() => 6.5),
  setOnEndedCallback: vi.fn(),
  setTimeUpdateCallback: vi.fn(),
  applyMastering: vi.fn(),
  getOrCreateTrackNode: vi.fn(() => ({
    volume: 1,
    muted: false,
    soloed: false,
    pan: 0,
    eqLowGain: 0,
    eqMidGain: 0,
    eqHighGain: 0,
    applyCompressor: vi.fn(),
    setReverb: vi.fn(),
    inputGain: {},
  })),
  setTrackGroupRouting: vi.fn(),
  updateSoloState: vi.fn(),
  syncSends: vi.fn(),
  playing: false,
  masterVolume: 1,
};

vi.mock('../../src/hooks/useAudioEngine', () => ({
  getAudioEngine: () => engineMock,
  getTauriPlaybackClockOwner: () => 'web-audio',
  setTauriPlaybackClockOwner: vi.fn(),
}));

vi.mock('../../src/engine/SynthEngine', () => ({
  synthEngine: {
    ensureStarted: vi.fn().mockResolvedValue(undefined),
    removeTrackSynth: vi.fn(),
    ensureTrackSynth: vi.fn(),
    getSynth: vi.fn(() => null),
    playSlideNote: vi.fn().mockResolvedValue(undefined),
    releaseAll: vi.fn(),
  },
}));

vi.mock('../../src/engine/SamplerEngine', () => ({
  createSamplerConfig: vi.fn(),
  samplerEngine: {
    ensureStarted: vi.fn().mockResolvedValue(undefined),
    ensureTrackSampler: vi.fn(),
    removeTrackSampler: vi.fn(),
    triggerAttackRelease: vi.fn(),
    stopAll: vi.fn(),
  },
}));

vi.mock('../../src/engine/DrumEngine', () => ({
  drumEngine: {
    ensureStarted: vi.fn().mockResolvedValue(undefined),
    triggerPad: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../src/engine/AutomationEngine', () => ({
  automationEngine: {
    start: vi.fn(),
    stop: vi.fn(),
  },
}));

vi.mock('../../src/hooks/useRecording', () => ({
  useRecording: () => ({
    stopRecording: vi.fn().mockResolvedValue(undefined),
    onLoopCycle: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('../../src/services/audioFileManager', () => ({
  loadAudioBlobByKey: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/hooks/useToast', () => ({
  toastInfo: vi.fn(),
}));

function HookHarness({ onReady }: { onReady: (value: ReturnType<typeof useTransport>) => void }) {
  const transport = useTransport();

  useEffect(() => {
    onReady(transport);
  }, []);

  return null;
}

describe('useTransport scrub lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useTransportStore.setState(useTransportStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    useProjectStore.getState().createProject({ name: 'Scrub Lifecycle' });
  });

  it('pauses normal transport during scrub and resumes playback from the scrubbed position on release', async () => {
    let transportApi: ReturnType<typeof useTransport> | null = null;
    await act(async () => {
      render(<HookHarness onReady={(value) => { transportApi = value; }} />);
    });

    await act(async () => {
      useTransportStore.getState().play();
      engineMock.playing = true;
    });

    await act(async () => {
      await transportApi!.startScrub(4);
    });

    expect(engineMock.stop).toHaveBeenCalledTimes(1);
    expect(engineMock.stopAllSources).toHaveBeenCalledTimes(1);
    expect(useTransportStore.getState().isPlaying).toBe(false);
    expect(useTransportStore.getState().isScrubbing).toBe(true);
    expect(engineMock.startTimelineScrub).toHaveBeenCalledWith(expect.any(Array), expect.any(Array), 4, 0);

    await act(async () => {
      await transportApi!.scrubTo(5.5, 0.8);
    });

    expect(engineMock.updateTimelineScrub).toHaveBeenLastCalledWith(expect.any(Array), expect.any(Array), 5.5, 0.8);

    await act(async () => {
      await transportApi!.endScrub();
    });

    expect(engineMock.stopTimelineScrub).toHaveBeenCalledTimes(1);
    expect(useTransportStore.getState().isScrubbing).toBe(false);
    expect(useTransportStore.getState().isPlaying).toBe(true);
    expect(useTransportStore.getState().currentTime).toBeCloseTo(5.5);
    expect(engineMock.schedulePlayback).toHaveBeenCalled();
  });
});
