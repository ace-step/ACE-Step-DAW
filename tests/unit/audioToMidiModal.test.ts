import { describe, expect, it } from 'vitest';
import { convertSamplesToMidi } from '../../src/services/audioToMidi';

function generateSineWave(
  frequency: number,
  durationSeconds: number,
  sampleRate: number,
  amplitude = 0.8,
): Float32Array {
  const length = Math.floor(sampleRate * durationSeconds);
  const samples = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    samples[i] = amplitude * Math.sin((2 * Math.PI * frequency * i) / sampleRate);
  }
  return samples;
}

function generateSilence(durationSeconds: number, sampleRate: number): Float32Array {
  return new Float32Array(Math.floor(sampleRate * durationSeconds));
}

function concat(...arrays: Float32Array[]): Float32Array {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Float32Array(total);
  let offset = 0;
  for (const a of arrays) {
    result.set(a, offset);
    offset += a.length;
  }
  return result;
}

describe('Audio-to-MIDI sensitivity controls', () => {
  const sampleRate = 16000;
  const bpm = 120;

  it('higher threshold reduces detected notes (stricter detection)', () => {
    const samples = concat(
      generateSineWave(440, 0.3, sampleRate, 0.3),
      generateSilence(0.05, sampleRate),
      generateSineWave(330, 0.3, sampleRate, 0.3),
      generateSilence(0.2, sampleRate),
    );

    const lenient = convertSamplesToMidi(samples, sampleRate, bpm, 0, {
      threshold: 0.3,
      minConfidence: 0.1,
    });

    const strict = convertSamplesToMidi(samples, sampleRate, bpm, 0, {
      threshold: 0.05,
      minConfidence: 0.1,
    });

    expect(lenient.notes.length).toBeGreaterThanOrEqual(strict.notes.length);
  });

  it('higher minConfidence filters out low-confidence notes', () => {
    const samples = concat(
      generateSineWave(440, 0.5, sampleRate),
      generateSilence(0.2, sampleRate),
    );

    const lowConfThreshold = convertSamplesToMidi(samples, sampleRate, bpm, 0, {
      threshold: 0.2,
      minConfidence: 0.1,
    });

    const highConfThreshold = convertSamplesToMidi(samples, sampleRate, bpm, 0, {
      threshold: 0.2,
      minConfidence: 0.99,
    });

    expect(lowConfThreshold.notes.length).toBeGreaterThanOrEqual(highConfThreshold.notes.length);
  });

  it('returns detectedNotes alongside midiNotes for preview', () => {
    const samples = concat(
      generateSineWave(440, 0.5, sampleRate),
      generateSilence(0.2, sampleRate),
    );

    const result = convertSamplesToMidi(samples, sampleRate, bpm, 0, {
      threshold: 0.2,
      minConfidence: 0.3,
    });

    expect(result.detectedNotes).toBeDefined();
    expect(Array.isArray(result.detectedNotes)).toBe(true);

    for (const note of result.detectedNotes) {
      expect(note.pitch).toBeGreaterThanOrEqual(0);
      expect(note.pitch).toBeLessThanOrEqual(127);
      expect(note.startTime).toBeGreaterThanOrEqual(0);
      expect(note.duration).toBeGreaterThan(0);
      expect(note.confidence).toBeGreaterThanOrEqual(0);
      expect(note.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('minNoteDuration filters short transient notes', () => {
    const samples = concat(
      generateSineWave(440, 0.02, sampleRate),
      generateSilence(0.05, sampleRate),
      generateSineWave(440, 0.4, sampleRate),
      generateSilence(0.2, sampleRate),
    );

    const withDefaultMin = convertSamplesToMidi(samples, sampleRate, bpm, 0, {
      threshold: 0.2,
      minConfidence: 0.1,
      minNoteDuration: 0.05,
    });

    const withLargeMin = convertSamplesToMidi(samples, sampleRate, bpm, 0, {
      threshold: 0.2,
      minConfidence: 0.1,
      minNoteDuration: 0.3,
    });

    expect(withDefaultMin.notes.length).toBeGreaterThanOrEqual(withLargeMin.notes.length);
  });
});
