import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebAudioBackend } from '../WebAudioBackend';
import type { AudioEngine } from '../../AudioEngine';

function createMockEngine(): AudioEngine {
  const mockTrackNode = {
    volume: 0,
    pan: 0,
    muted: false,
    soloed: false,
    eqLowGain: 0,
    eqMidGain: 0,
    eqHighGain: 0,
    applyCompressor: vi.fn(),
    setReverb: vi.fn(),
  };

  return {
    resume: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn(),
    getCurrentTime: vi.fn().mockReturnValue(10.5),
    getLookAhead: vi.fn().mockReturnValue(0.1),
    getCompensatedTime: vi.fn().mockReturnValue(10.4),
    setPlaybackLatencyCompensation: vi.fn(),
    getPlaybackLatencyCompensation: vi.fn().mockReturnValue(0.005),
    getOrCreateTrackNode: vi.fn().mockReturnValue(mockTrackNode),
    removeTrackNode: vi.fn(),
    setTrackGroupRouting: vi.fn(),
    updateSoloState: vi.fn(),
    getTrackMeter: vi.fn().mockReturnValue({ level: -12, leftLevel: -12, rightLevel: -14, clipped: false }),
    getTrackLevel: vi.fn().mockReturnValue(-12),
    resetTrackClip: vi.fn(),
    getTrackSpectrum: vi.fn().mockReturnValue(null),
    getMasterMeter: vi.fn().mockReturnValue({ level: -6, clipped: false }),
    getMasterLevel: vi.fn().mockReturnValue(-6),
    resetMasterClip: vi.fn(),
    getMasterSpectrum: vi.fn().mockReturnValue(new Float32Array(128)),
    masterVolume: 0.8,
    applyMastering: vi.fn(),
    schedulePlayback: vi.fn(),
    stopAllSources: vi.fn(),
    decodeAudioData: vi.fn().mockResolvedValue({} as AudioBuffer),
    getAudioStream: vi.fn().mockReturnValue({ getTracks: () => [] }),
    disposeAudioStream: vi.fn(),
    setTimeUpdateCallback: vi.fn(),
    setOnEndedCallback: vi.fn(),
    sampleRate: 48000,
    _mockTrackNode: mockTrackNode,
  } as unknown as AudioEngine & { _mockTrackNode: typeof mockTrackNode };
}

describe('WebAudioBackend', () => {
  let engine: ReturnType<typeof createMockEngine>;
  let backend: WebAudioBackend;

  beforeEach(() => {
    engine = createMockEngine();
    backend = new WebAudioBackend(engine);
  });

  it('identifies as web-audio backend', () => {
    expect(backend.backend).toBe('web-audio');
  });

  it('exposes sample rate from engine', () => {
    expect(backend.sampleRate).toBe(48000);
  });

  // ── Transport ───────────────────────────────────────────────────

  it('delegates resume to engine', async () => {
    await backend.resume();
    expect(engine.resume).toHaveBeenCalled();
  });

  it('delegates getCurrentTime', () => {
    expect(backend.getCurrentTime()).toBe(10.5);
  });

  it('delegates getLookAhead', () => {
    expect(backend.getLookAhead()).toBe(0.1);
  });

  it('delegates getCompensatedTime', () => {
    expect(backend.getCompensatedTime()).toBe(10.4);
  });

  it('delegates setPlaybackLatencyCompensation', () => {
    backend.setPlaybackLatencyCompensation(0.01);
    expect(engine.setPlaybackLatencyCompensation).toHaveBeenCalledWith(0.01);
  });

  // ── Track Management ────────────────────────────────────────────

  it('ensures track by calling getOrCreateTrackNode', () => {
    backend.ensureTrack('track-1');
    expect(engine.getOrCreateTrackNode).toHaveBeenCalledWith('track-1');
  });

  it('removes track', () => {
    backend.removeTrack('track-1');
    expect(engine.removeTrackNode).toHaveBeenCalledWith('track-1');
  });

  it('sets track volume and pan', () => {
    backend.setTrackParams('track-1', { volume: 0.7, pan: -0.3 });
    const node = (engine as unknown as { _mockTrackNode: { volume: number; pan: number } })._mockTrackNode;
    expect(node.volume).toBe(0.7);
    expect(node.pan).toBe(-0.3);
  });

  it('sets track mute and solo', () => {
    backend.setTrackParams('track-1', { muted: true, soloed: true });
    const node = (engine as unknown as { _mockTrackNode: { muted: boolean; soloed: boolean } })._mockTrackNode;
    expect(node.muted).toBe(true);
    expect(node.soloed).toBe(true);
  });

  it('applies compressor when compressor params provided', () => {
    backend.setTrackParams('track-1', {
      compressorEnabled: true,
      compressorThreshold: -20,
      compressorRatio: 6,
    });
    const node = (engine as unknown as { _mockTrackNode: { applyCompressor: ReturnType<typeof vi.fn> } })._mockTrackNode;
    expect(node.applyCompressor).toHaveBeenCalledWith(true, -20, 6);
  });

  it('applies reverb when reverb params provided', () => {
    backend.setTrackParams('track-1', { reverbMix: 0.4, reverbRoomSize: 0.8 });
    const node = (engine as unknown as { _mockTrackNode: { setReverb: ReturnType<typeof vi.fn> } })._mockTrackNode;
    expect(node.setReverb).toHaveBeenCalledWith(0.4, 0.8);
  });

  it('delegates updateSoloState', () => {
    backend.updateSoloState();
    expect(engine.updateSoloState).toHaveBeenCalled();
  });

  // ── Metering ────────────────────────────────────────────────────

  it('returns track meter data', () => {
    const meter = backend.getTrackMeter('track-1');
    expect(meter).toEqual({ level: -12, leftLevel: -12, rightLevel: -14, clipped: false });
  });

  it('returns master meter data', () => {
    const meter = backend.getMasterMeter('output');
    expect(meter).toEqual({ level: -6, clipped: false });
  });

  it('returns master spectrum', () => {
    const spectrum = backend.getMasterSpectrum();
    expect(spectrum).toBeInstanceOf(Float32Array);
    expect(spectrum.length).toBe(128);
  });

  // ── Master ──────────────────────────────────────────────────────

  it('gets and sets master volume', () => {
    expect(backend.getMasterVolume()).toBe(0.8);
  });

  it('passes through mastering state directly', () => {
    backend.applyMastering(null);
    expect(engine.applyMastering).toHaveBeenCalledWith(null);
  });

  it('passes through undefined mastering state', () => {
    backend.applyMastering(undefined);
    expect(engine.applyMastering).toHaveBeenCalledWith(undefined);
  });

  // ── Clip Scheduling ─────────────────────────────────────────────

  it('delegates schedulePlayback', () => {
    backend.schedulePlayback([], 0, 10);
    expect(engine.schedulePlayback).toHaveBeenCalledWith([], 0, 10);
  });

  it('delegates stopAllSources', () => {
    backend.stopAllSources();
    expect(engine.stopAllSources).toHaveBeenCalled();
  });

  // ── Audio Data ──────────────────────────────────────────────────

  it('delegates decodeAudioData', async () => {
    const blob = new Blob();
    await backend.decodeAudioData(blob);
    expect(engine.decodeAudioData).toHaveBeenCalledWith(blob);
  });

  // ── Callbacks ───────────────────────────────────────────────────

  it('delegates setTimeUpdateCallback', () => {
    const cb = vi.fn();
    backend.setTimeUpdateCallback(cb);
    expect(engine.setTimeUpdateCallback).toHaveBeenCalledWith(cb);
  });

  it('delegates setOnEndedCallback', () => {
    const cb = vi.fn();
    backend.setOnEndedCallback(cb);
    expect(engine.setOnEndedCallback).toHaveBeenCalledWith(cb);
  });

  // ── Dispose ─────────────────────────────────────────────────────

  it('delegates dispose', () => {
    backend.dispose();
    expect(engine.dispose).toHaveBeenCalled();
  });
});
