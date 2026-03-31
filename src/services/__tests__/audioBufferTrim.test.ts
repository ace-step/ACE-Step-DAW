import { describe, it, expect } from 'vitest';
import { trimAudioBuffer } from '../audioBufferTrimming';

/**
 * Regression test for #1273: out-of-bounds audio buffer read when
 * clipStart < ctxOffset, producing NaN in output audio.
 */
describe('trimAudioBuffer', () => {
  function makeBuffer(length: number, sampleRate: number = 44100): Float32Array {
    const data = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      data[i] = i / length; // Ramp from 0 to ~1
    }
    return data;
  }

  it('clamps negative startSample to 0 (clipStart < ctxOffset)', () => {
    const src = makeBuffer(44100); // 1 second of audio
    const result = trimAudioBuffer(src, {
      clipStart: 1.0,
      ctxOffset: 2.0, // ctxOffset > clipStart → negative startSample
      clipDuration: 0.5,
      sampleRate: 44100,
      bufferLength: 44100,
    });
    // Should not contain NaN
    for (let i = 0; i < result.length; i++) {
      expect(Number.isNaN(result[i]), `NaN at index ${i}`).toBe(false);
    }
    // Should start from sample 0 (clamped)
    expect(result[0]).toBe(src[0]);
  });

  it('trims correctly when clipStart > ctxOffset (normal case)', () => {
    const src = makeBuffer(88200); // 2 seconds of audio
    const result = trimAudioBuffer(src, {
      clipStart: 1.0,
      ctxOffset: 0.5,
      clipDuration: 0.5,
      sampleRate: 44100,
      bufferLength: 88200,
    });
    const expectedStart = Math.round((1.0 - 0.5) * 44100); // 22050
    expect(result[0]).toBe(src[expectedStart]);
    expect(result.length).toBe(Math.round(0.5 * 44100));
  });

  it('clamps endSample to buffer length', () => {
    const src = makeBuffer(1000);
    const result = trimAudioBuffer(src, {
      clipStart: 0.0,
      ctxOffset: 0.0,
      clipDuration: 10.0, // Way longer than buffer
      sampleRate: 44100,
      bufferLength: 1000,
    });
    // Should not exceed source buffer length
    expect(result.length).toBeLessThanOrEqual(1000);
    for (let i = 0; i < result.length; i++) {
      expect(Number.isNaN(result[i]), `NaN at index ${i}`).toBe(false);
    }
  });

  it('returns at least 1 sample even for zero-length trim', () => {
    const src = makeBuffer(100);
    const result = trimAudioBuffer(src, {
      clipStart: 0.0,
      ctxOffset: 0.0,
      clipDuration: 0.0,
      sampleRate: 44100,
      bufferLength: 100,
    });
    expect(result.length).toBeGreaterThanOrEqual(1);
  });
});
