import { describe, it, expect } from 'vitest';
import { trimAudioBuffer, type TrimParams } from '../audioBufferTrimming';

function makeParams(overrides?: Partial<TrimParams>): TrimParams {
  return {
    clipStart: 0,
    ctxOffset: 0,
    clipDuration: 1,
    sampleRate: 48000,
    bufferLength: 48000,
    ...overrides,
  };
}

describe('trimAudioBuffer', () => {
  it('trims a buffer to the specified clip duration', () => {
    const src = new Float32Array(48000); // 1 second at 48kHz
    for (let i = 0; i < src.length; i++) src[i] = i / src.length;

    const result = trimAudioBuffer(src, makeParams({ clipDuration: 0.5 }));
    expect(result.length).toBe(24000); // 0.5s × 48kHz
  });

  it('returns samples starting at the correct offset', () => {
    const src = new Float32Array(96000);
    for (let i = 0; i < src.length; i++) src[i] = i;

    const result = trimAudioBuffer(src, makeParams({
      clipStart: 1,
      ctxOffset: 0,
      clipDuration: 0.5,
      sampleRate: 48000,
      bufferLength: 96000,
    }));
    // Start sample = (1 - 0) * 48000 = 48000
    expect(result[0]).toBe(48000);
    expect(result.length).toBe(24000);
  });

  it('accounts for context offset', () => {
    const src = new Float32Array(48000);
    for (let i = 0; i < src.length; i++) src[i] = i;

    const result = trimAudioBuffer(src, makeParams({
      clipStart: 2,
      ctxOffset: 1.5,
      clipDuration: 0.5,
      sampleRate: 48000,
      bufferLength: 48000,
    }));
    // Start sample = (2 - 1.5) * 48000 = 24000
    expect(result[0]).toBe(24000);
  });

  it('clamps start sample to 0 when clip starts before context', () => {
    const src = new Float32Array(48000);
    for (let i = 0; i < src.length; i++) src[i] = i;

    const result = trimAudioBuffer(src, makeParams({
      clipStart: 0,
      ctxOffset: 1,
      clipDuration: 0.5,
      sampleRate: 48000,
      bufferLength: 48000,
    }));
    // Start sample = max(0, (0 - 1) * 48000) = 0
    expect(result[0]).toBe(0);
  });

  it('clamps end sample to buffer length', () => {
    const src = new Float32Array(24000); // Only 0.5s of audio
    for (let i = 0; i < src.length; i++) src[i] = i;

    const result = trimAudioBuffer(src, makeParams({
      clipDuration: 1, // Requests 1s but buffer is only 0.5s
      sampleRate: 48000,
      bufferLength: 24000,
    }));
    expect(result.length).toBe(24000);
  });

  it('fills with zeros beyond source buffer length', () => {
    const src = new Float32Array(100);
    for (let i = 0; i < src.length; i++) src[i] = 1;

    const result = trimAudioBuffer(src, makeParams({
      clipStart: 0,
      ctxOffset: 0,
      clipDuration: 0.01, // 480 samples
      sampleRate: 48000,
      bufferLength: 1000,
    }));
    // First 100 samples should be 1, rest should be 0
    expect(result[0]).toBe(1);
    expect(result[99]).toBe(1);
    expect(result[100]).toBe(0);
  });

  it('always returns at least 1 sample', () => {
    const src = new Float32Array(10);
    const result = trimAudioBuffer(src, makeParams({
      clipDuration: 0,
      sampleRate: 48000,
      bufferLength: 10,
    }));
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('handles fractional sample positions correctly', () => {
    const src = new Float32Array(48000);
    for (let i = 0; i < src.length; i++) src[i] = i;

    const result = trimAudioBuffer(src, makeParams({
      clipStart: 0.001, // ~48 samples
      ctxOffset: 0,
      clipDuration: 0.001,
      sampleRate: 48000,
      bufferLength: 48000,
    }));
    // Should round to nearest sample
    expect(result.length).toBeGreaterThanOrEqual(1);
  });
});
