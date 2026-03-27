import { describe, it, expect } from 'vitest';
import {
  readAudioContextPlaybackLatency,
  detectPlaybackLatencySettings,
  createDefaultPlaybackLatencySettings,
  normalizePlaybackLatencySettings,
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
});

describe('formatLatencyDisplay', () => {
  it('formats latency settings into a display string', () => {
    const settings = detectPlaybackLatencySettings(null, {
      baseLatency: 0.005,
      outputLatency: 0.01,
    });
    // Total should be 15ms
    expect(settings.compensationMs).toBe(15);
  });
});
