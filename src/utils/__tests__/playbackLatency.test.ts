import { describe, it, expect } from 'vitest';
import {
  readAudioContextPlaybackLatency,
  detectPlaybackLatencySettings,
  latencyMsToSamples,
  normalizePlaybackLatencySettings,
  setPlaybackLatencyOverrideSettings,
  getPlaybackLatencyCompensationSeconds,
} from '../playbackLatency';

describe('readAudioContextPlaybackLatency', () => {
  it('extracts baseLatency and outputLatency from AudioContext-like object', () => {
    const result = readAudioContextPlaybackLatency({
      baseLatency: 0.005,
      outputLatency: 0.01,
    });
    expect(result.baseLatency).toBe(0.005);
    expect(result.outputLatency).toBe(0.01);
  });

  it('returns null for missing properties', () => {
    const result = readAudioContextPlaybackLatency({});
    expect(result.baseLatency).toBeNull();
    expect(result.outputLatency).toBeNull();
  });
});

describe('detectPlaybackLatencySettings', () => {
  it('computes total latency in ms from base + output', () => {
    const settings = detectPlaybackLatencySettings(null, {
      baseLatency: 0.005,
      outputLatency: 0.01,
    });
    expect(settings.detectedBaseLatencyMs).toBe(5);
    expect(settings.detectedOutputLatencyMs).toBe(10);
    expect(settings.detectedLatencyMs).toBe(15);
    expect(settings.browserSupport).toBe('available');
    expect(settings.source).toBe('auto');
  });

  it('returns fallback when both are null', () => {
    const settings = detectPlaybackLatencySettings(null, {
      baseLatency: null,
      outputLatency: null,
    });
    expect(settings.detectedLatencyMs).toBeNull();
    expect(settings.source).toBe('fallback');
    expect(settings.browserSupport).toBe('missing');
  });

  it('computes compensationMs as sum of base and output latency', () => {
    const settings = detectPlaybackLatencySettings(null, {
      baseLatency: 0.005,
      outputLatency: 0.01,
    });
    expect(settings.compensationMs).toBe(15);
  });
});

describe('latencyMsToSamples', () => {
  it('converts milliseconds to samples at 48000 Hz', () => {
    // 10 ms at 48000 Hz = 480 samples
    expect(latencyMsToSamples(10, 48000)).toBe(480);
  });

  it('converts milliseconds to samples at 44100 Hz', () => {
    // 10 ms at 44100 Hz = 441 samples
    expect(latencyMsToSamples(10, 44100)).toBe(441);
  });

  it('returns 0 for 0 ms', () => {
    expect(latencyMsToSamples(0, 48000)).toBe(0);
  });

  it('returns 0 for null latency', () => {
    expect(latencyMsToSamples(null, 48000)).toBe(0);
  });

  it('rounds to nearest integer sample count', () => {
    // 15 ms at 48000 Hz = 720 samples (exact)
    expect(latencyMsToSamples(15, 48000)).toBe(720);
    // 1 ms at 44100 Hz = 44.1, rounds to 44
    expect(latencyMsToSamples(1, 44100)).toBe(44);
  });

  it('handles fractional millisecond values', () => {
    // 0.5 ms at 48000 Hz = 24 samples
    expect(latencyMsToSamples(0.5, 48000)).toBe(24);
  });
});

describe('manual override takes precedence over auto-detected', () => {
  it('uses manual override for compensationMs when set', () => {
    const detected = detectPlaybackLatencySettings(null, {
      baseLatency: 0.005,
      outputLatency: 0.01,
    });
    // detected = 15ms, now set manual override to 25ms
    const withOverride = setPlaybackLatencyOverrideSettings(detected, 25);
    expect(withOverride.source).toBe('manual');
    expect(withOverride.compensationMs).toBe(25);
    // detected values are preserved
    expect(withOverride.detectedLatencyMs).toBe(15);
  });

  it('falls back to auto-detected when manual override is cleared', () => {
    const detected = detectPlaybackLatencySettings(null, {
      baseLatency: 0.005,
      outputLatency: 0.01,
    });
    const withOverride = setPlaybackLatencyOverrideSettings(detected, 25);
    const cleared = setPlaybackLatencyOverrideSettings(withOverride, null);
    expect(cleared.source).toBe('auto');
    expect(cleared.compensationMs).toBe(15);
    expect(cleared.manualOverrideMs).toBeNull();
  });
});

describe('getPlaybackLatencyCompensationSeconds', () => {
  it('returns compensation in seconds', () => {
    const settings = detectPlaybackLatencySettings(null, {
      baseLatency: 0.005,
      outputLatency: 0.01,
    });
    expect(getPlaybackLatencyCompensationSeconds(settings)).toBeCloseTo(0.015);
  });

  it('returns 0 for null settings', () => {
    expect(getPlaybackLatencyCompensationSeconds(null)).toBe(0);
  });
});

describe('latency value persistence', () => {
  it('preserves manual override across normalize calls', () => {
    const settings = setPlaybackLatencyOverrideSettings(null, 42);
    const renormalized = normalizePlaybackLatencySettings(settings);
    expect(renormalized.manualOverrideMs).toBe(42);
    expect(renormalized.compensationMs).toBe(42);
    expect(renormalized.source).toBe('manual');
  });

  it('preserves detected values across normalize calls', () => {
    const settings = detectPlaybackLatencySettings(null, {
      baseLatency: 0.005,
      outputLatency: 0.01,
    });
    const renormalized = normalizePlaybackLatencySettings(settings);
    expect(renormalized.detectedBaseLatencyMs).toBe(5);
    expect(renormalized.detectedOutputLatencyMs).toBe(10);
    expect(renormalized.detectedLatencyMs).toBe(15);
  });
});
