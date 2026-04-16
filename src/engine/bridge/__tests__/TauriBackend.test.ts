import { describe, it, expect, beforeEach } from 'vitest';
import { TauriBackend } from '../TauriBackend';

describe('TauriBackend', () => {
  let backend: TauriBackend;

  beforeEach(() => {
    backend = new TauriBackend();
  });

  it('identifies as tauri backend', () => {
    expect(backend.backend).toBe('tauri');
  });

  it('reports 48kHz sample rate', () => {
    expect(backend.sampleRate).toBe(48000);
  });

  // ── Transport stubs return safe defaults ──────────────────────────

  it('getCurrentTime returns 0 (stub)', () => {
    expect(backend.getCurrentTime()).toBe(0);
  });

  it('getLookAhead returns 0.1', () => {
    expect(backend.getLookAhead()).toBe(0.1);
  });

  it('getCompensatedTime returns 0 (stub)', () => {
    expect(backend.getCompensatedTime()).toBe(0);
  });

  it('getPlaybackLatencyCompensation returns 0', () => {
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

  it('setMasterVolume does not throw', () => {
    expect(() => backend.setMasterVolume(0.5)).not.toThrow();
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

  it('updateSoloState does not throw', () => {
    expect(() => backend.updateSoloState()).not.toThrow();
  });

  it('stopAllSources does not throw', () => {
    expect(() => backend.stopAllSources()).not.toThrow();
  });

  it('disposeAudioStream does not throw', () => {
    expect(() => backend.disposeAudioStream()).not.toThrow();
  });

  it('dispose does not throw', () => {
    expect(() => backend.dispose()).not.toThrow();
  });

  // ── Methods that should throw (not yet implemented) ───────────────

  it('resume rejects without Tauri runtime', async () => {
    // resume() now calls invoke('audio_start_engine', ...) which
    // rejects in a test environment because no Tauri webview
    // context is available. The specific error message depends on
    // the @tauri-apps/api internals — we only assert it rejects.
    await expect(backend.resume()).rejects.toThrow();
  });

  it('decodeAudioData throws (Rust engine not ready)', async () => {
    await expect(backend.decodeAudioData(new Blob())).rejects.toThrow('not yet implemented');
  });

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
});
