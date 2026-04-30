import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TauriBackend } from '../TauriBackend';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(vi.fn()),
}));

const invokeMock = vi.mocked(invoke);
const listenMock = vi.mocked(listen);

function createMockAudioBuffer(samples: number[], sampleRate = 48000): AudioBuffer {
  const channel = Float32Array.from(samples);
  return {
    length: samples.length,
    sampleRate,
    numberOfChannels: 1,
    getChannelData: vi.fn(() => channel),
  } as unknown as AudioBuffer;
}

describe('TauriBackend', () => {
  let backend: TauriBackend;

  beforeEach(() => {
    vi.clearAllMocks();
    invokeMock.mockResolvedValue(undefined);
    listenMock.mockResolvedValue(vi.fn());
    backend = new TauriBackend();
  });

  it('identifies as tauri backend', () => {
    expect(backend.backend).toBe('tauri');
  });

  it('reports 48kHz sample rate', () => {
    expect(backend.sampleRate).toBe(48000);
  });

  // ── Transport stubs return safe defaults ──────────────────────────

  it('getCurrentTime starts at 0', () => {
    expect(backend.getCurrentTime()).toBe(0);
  });

  it('getLookAhead returns 0.1', () => {
    expect(backend.getLookAhead()).toBe(0.1);
  });

  it('getCompensatedTime starts at 0', () => {
    expect(backend.getCompensatedTime()).toBe(0);
  });

  it('stores playback latency compensation', () => {
    backend.setPlaybackLatencyCompensation(0.25);

    expect(backend.getPlaybackLatencyCompensation()).toBe(0.25);
  });

  it('getPlaybackLatencyCompensation defaults to 0', () => {
    expect(backend.getPlaybackLatencyCompensation()).toBe(0);
  });

  // ── Metering returns silent defaults ──────────────────────────────

  it('getTrackMeter returns silent meter', () => {
    const meter = backend.getTrackMeter('any-track');
    expect(meter.level).toBe(-Infinity);
    expect(meter.clipped).toBe(false);
  });

  it('getTrackLevel returns -Infinity', () => {
    expect(backend.getTrackLevel('any-track')).toBe(-Infinity);
  });

  it('getMasterMeter returns silent meter', () => {
    const meter = backend.getMasterMeter('output');
    expect(meter.level).toBe(-Infinity);
    expect(meter.clipped).toBe(false);
  });

  it('getMasterLevel returns -Infinity', () => {
    expect(backend.getMasterLevel('input')).toBe(-Infinity);
  });

  it('getTrackSpectrum returns null', () => {
    expect(backend.getTrackSpectrum('any')).toBeNull();
  });

  it('getMasterSpectrum returns empty Float32Array', () => {
    const spectrum = backend.getMasterSpectrum();
    expect(spectrum).toBeInstanceOf(Float32Array);
    expect(spectrum.length).toBe(0);
  });

  // ── Master defaults ───────────────────────────────────────────────

  it('getMasterVolume returns 1 (unity gain)', () => {
    expect(backend.getMasterVolume()).toBe(1);
  });

  // ── Stub methods do not throw ─────────────────────────────────────

  it('resume starts the native engine and transport listener', async () => {
    invokeMock.mockResolvedValueOnce({ state: 'running' });
    invokeMock.mockResolvedValueOnce(96000);

    await backend.resume();

    expect(invokeMock).toHaveBeenCalledWith('audio_start_engine', {
      config: { sampleRate: 48000, bufferSize: 256, deviceName: null },
    });
    expect(invokeMock).toHaveBeenCalledWith('audio_transport_get_position');
    expect(listenMock).toHaveBeenCalledWith('transport-position', expect.any(Function));
  });

  it('resume treats an already-running native engine as success', async () => {
    invokeMock.mockRejectedValueOnce({ kind: 'alreadyRunning' });
    invokeMock.mockResolvedValueOnce(0);

    await expect(backend.resume()).resolves.toBeUndefined();

    expect(listenMock).toHaveBeenCalledWith('transport-position', expect.any(Function));
    expect(invokeMock).toHaveBeenCalledWith('audio_transport_get_position');
  });

  it('setMasterVolume invokes native master gain command', () => {
    backend.setMasterVolume(0.5);

    expect(invokeMock).toHaveBeenCalledWith('audio_set_master_volume', { volume: 0.5 });
  });

  it('ensureTrack does not throw', () => {
    expect(() => backend.ensureTrack('t1')).not.toThrow();
  });

  it('removeTrack does not throw', () => {
    expect(() => backend.removeTrack('t1')).not.toThrow();
  });

  it('setTrackParams does not throw', () => {
    expect(() => backend.setTrackParams('t1', { volume: 0.5 })).not.toThrow();
  });

  it('preserves track params while native handle allocation is pending', async () => {
    invokeMock.mockResolvedValueOnce({ slot: 2, generation: 1 });

    backend.ensureTrack('track-1');
    backend.setTrackParams('track-1', { volume: 0.25, pan: -0.5, muted: true });
    await Promise.resolve();

    expect(invokeMock).toHaveBeenCalledWith('audio_set_track_params', {
      handle: { slot: 2, generation: 1 },
      params: { volume: 0.25, pan: -0.5, mute: true, solo: false },
    });
  });

  it('updateSoloState does not throw', () => {
    expect(() => backend.updateSoloState()).not.toThrow();
  });

  it('stopAllSources clears the native schedule and stops transport', async () => {
    backend.stopAllSources();
    await Promise.resolve();
    await Promise.resolve();

    expect(invokeMock).toHaveBeenCalledWith('audio_clip_set_schedule', { clips: [] });
    expect(invokeMock).toHaveBeenCalledWith('audio_transport_stop');
  });

  it('pauseAllSources pauses native transport without clearing the schedule', () => {
    backend.pauseAllSources();

    expect(invokeMock).toHaveBeenCalledWith('audio_transport_pause');
    expect(invokeMock).not.toHaveBeenCalledWith('audio_clip_set_schedule', { clips: [] });
  });

  it('disposeAudioStream does not throw', () => {
    expect(() => backend.disposeAudioStream()).not.toThrow();
  });

  it('dispose stops the native engine', () => {
    expect(() => backend.dispose()).not.toThrow();
    expect(invokeMock).toHaveBeenCalledWith('audio_stop_engine');
  });

  // ── Methods that should throw ────────────────────────────────────

  it('getAudioStream throws (not available in desktop)', () => {
    expect(() => backend.getAudioStream()).toThrow('not available in desktop');
  });

  // ── Callbacks can be set without error ────────────────────────────

  it('setTimeUpdateCallback does not throw', () => {
    expect(() => backend.setTimeUpdateCallback(() => {})).not.toThrow();
  });

  it('setOnEndedCallback does not throw', () => {
    expect(() => backend.setOnEndedCallback(() => {})).not.toThrow();
  });

  it('schedulePlayback sends clips through native schedule and starts transport', async () => {
    const buffer = createMockAudioBuffer([0.125, 0.25, 0.5, 1]);

    backend.schedulePlayback([
      {
        clipId: 'clip-1',
        trackId: 'track-1',
        startTime: 1,
        buffer,
        audioOffset: 0,
        clipDuration: 4 / 48000,
      },
    ], 1, 2);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(invokeMock).toHaveBeenCalledWith('audio_clip_set_schedule', {
      clips: [
        {
          startSample: 48000,
          lengthSamples: 4,
          gain: 1,
          audioData: [0.125, 0.125, 0.25, 0.25, 0.5, 0.5, 1, 1],
        },
      ],
    });
    expect(invokeMock).toHaveBeenCalledWith('audio_transport_seek', { samplePosition: 48000 });
    expect(invokeMock).toHaveBeenCalledWith('audio_transport_play');
  });

  it('applies cached track volume, pan, mute, and solo before native scheduling', async () => {
    const audibleBuffer = createMockAudioBuffer([1, 1]);
    const mutedBuffer = createMockAudioBuffer([1, 1]);
    backend.ensureTrack('audible');
    backend.ensureTrack('muted');
    backend.setTrackParams('audible', { volume: 0.5, pan: -0.5, soloed: true });
    backend.setTrackParams('muted', { volume: 1, muted: true });

    backend.schedulePlayback([
      {
        clipId: 'clip-audible',
        trackId: 'audible',
        startTime: 0,
        buffer: audibleBuffer,
        audioOffset: 0,
        clipDuration: 2 / 48000,
      },
      {
        clipId: 'clip-muted',
        trackId: 'muted',
        startTime: 0,
        buffer: mutedBuffer,
        audioOffset: 0,
        clipDuration: 2 / 48000,
      },
    ], 0, 1);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(invokeMock).toHaveBeenCalledWith('audio_clip_set_schedule', {
      clips: [
        {
          startSample: 0,
          lengthSamples: 2,
          gain: 1,
          audioData: [0.5, 0.25, 0.5, 0.25],
        },
      ],
    });
  });

  it('does not resume stale playback after a stop interrupts scheduling', async () => {
    let resolveFirstSchedule!: () => void;
    let firstSchedule = true;
    invokeMock.mockImplementation((command) => {
      if (command === 'audio_clip_set_schedule' && firstSchedule) {
        firstSchedule = false;
        return new Promise((resolve) => {
          resolveFirstSchedule = () => resolve(undefined);
        });
      }
      return Promise.resolve(undefined);
    });
    const buffer = createMockAudioBuffer([1]);

    backend.schedulePlayback([
      {
        clipId: 'clip-1',
        trackId: 'track-1',
        startTime: 0,
        buffer,
        audioOffset: 0,
        clipDuration: 1 / 48000,
      },
    ], 0, 1);
    backend.stopAllSources();
    resolveFirstSchedule();
    await Promise.resolve();
    await Promise.resolve();

    expect(invokeMock).not.toHaveBeenCalledWith('audio_transport_play');
  });

  it('fires ended callback from native transport position events', async () => {
    let positionHandler: ((event: { payload: number }) => void) | null = null;
    listenMock.mockImplementation(async (_event, handler) => {
      positionHandler = handler as (event: { payload: number }) => void;
      return vi.fn();
    });
    const onEnded = vi.fn();
    const buffer = createMockAudioBuffer([1]);
    backend.setTimeUpdateCallback(() => {});
    backend.setOnEndedCallback(onEnded);

    backend.schedulePlayback([
      {
        clipId: 'clip-1',
        trackId: 'track-1',
        startTime: 0,
        buffer,
        audioOffset: 0,
        clipDuration: 1 / 48000,
      },
    ], 0, 1 / 48000);
    await Promise.resolve();
    positionHandler?.({ payload: 1 });

    expect(onEnded).toHaveBeenCalledTimes(1);
  });

  it('resamples non-48kHz buffers before sending native clips', async () => {
    const buffer = createMockAudioBuffer([0, 1], 24000);

    backend.schedulePlayback([
      {
        clipId: 'clip-1',
        trackId: 'track-1',
        startTime: 0,
        buffer,
        audioOffset: 0,
        clipDuration: 2 / 24000,
      },
    ], 0, 1);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(invokeMock).toHaveBeenCalledWith('audio_clip_set_schedule', {
      clips: [
        {
          startSample: 0,
          lengthSamples: 4,
          gain: 1,
          audioData: [0, 0, 0.5, 0.5, 1, 1, 1, 1],
        },
      ],
    });
  });

  it('refreshes track meters from native meter command', async () => {
    invokeMock.mockResolvedValueOnce({ slot: 0, generation: 1 });
    backend.ensureTrack('track-1');
    await Promise.resolve();

    invokeMock.mockResolvedValueOnce({ rms: 0.2, peak: 0.4, clipped: true });
    backend.getTrackMeter('track-1');
    await Promise.resolve();

    expect(invokeMock).toHaveBeenCalledWith('audio_get_track_meter', expect.any(Object));
  });
});
