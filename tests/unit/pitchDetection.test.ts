import { describe, expect, it } from 'vitest';
import {
  detectPitchFrames,
  framesToNotes,
  frequencyToMidi,
  type PitchFrame,
} from '../../src/utils/pitchDetection';

/** Generate a pure sine wave at a given frequency */
function generateSineWave(
  frequency: number,
  durationSeconds: number,
  sampleRate: number,
  amplitude = 0.8,
): Float32Array {
  const length = Math.floor(sampleRate * durationSeconds);
  const samples = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    samples[i] = amplitude * Math.sin(2 * Math.PI * frequency * i / sampleRate);
  }
  return samples;
}

/** Generate silence */
function generateSilence(durationSeconds: number, sampleRate: number): Float32Array {
  return new Float32Array(Math.floor(sampleRate * durationSeconds));
}

/** Concatenate Float32Arrays */
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

describe('frequencyToMidi', () => {
  it('returns 69 for A4 (440 Hz)', () => {
    expect(frequencyToMidi(440)).toBeCloseTo(69, 5);
  });

  it('returns 60 for middle C (~261.63 Hz)', () => {
    expect(frequencyToMidi(261.6256)).toBeCloseTo(60, 1);
  });

  it('returns 81 for A5 (880 Hz)', () => {
    expect(frequencyToMidi(880)).toBeCloseTo(81, 5);
  });
});

describe('detectPitchFrames', () => {
  const sampleRate = 16000; // lower sample rate for faster tests

  it('detects pitch of a pure 440 Hz sine wave', () => {
    const samples = generateSineWave(440, 0.5, sampleRate);
    const frames = detectPitchFrames(samples, sampleRate, { threshold: 0.2 });

    expect(frames.length).toBeGreaterThan(0);

    // Most frames should detect a frequency near 440 Hz
    const pitchedFrames = frames.filter((f) => f.frequency !== null);
    expect(pitchedFrames.length).toBeGreaterThan(frames.length * 0.5);

    const avgFrequency = pitchedFrames.reduce((sum, f) => sum + f.frequency!, 0) / pitchedFrames.length;
    expect(avgFrequency).toBeCloseTo(440, -1); // within ~10 Hz
  });

  it('detects no pitch for silence', () => {
    const samples = generateSilence(0.3, sampleRate);
    const frames = detectPitchFrames(samples, sampleRate);

    const pitchedFrames = frames.filter((f) => f.frequency !== null);
    expect(pitchedFrames.length).toBe(0);
  });

  it('detects pitch of a 261 Hz sine wave (middle C)', () => {
    const samples = generateSineWave(261.63, 0.5, sampleRate);
    const frames = detectPitchFrames(samples, sampleRate, { threshold: 0.2 });

    const pitchedFrames = frames.filter((f) => f.frequency !== null);
    expect(pitchedFrames.length).toBeGreaterThan(0);

    const avgFrequency = pitchedFrames.reduce((sum, f) => sum + f.frequency!, 0) / pitchedFrames.length;
    expect(avgFrequency).toBeCloseTo(261.63, -1);
  });

  it('returns frames with time stamps', () => {
    const samples = generateSineWave(440, 0.2, sampleRate);
    const frames = detectPitchFrames(samples, sampleRate);

    expect(frames[0].time).toBe(0);
    if (frames.length > 1) {
      expect(frames[1].time).toBeGreaterThan(0);
    }
  });
});

describe('framesToNotes', () => {
  it('groups consecutive same-pitch frames into a single note', () => {
    const frames: PitchFrame[] = [
      { time: 0.0, frequency: 440, confidence: 0.9 },
      { time: 0.01, frequency: 440, confidence: 0.9 },
      { time: 0.02, frequency: 440, confidence: 0.9 },
      { time: 0.03, frequency: 440, confidence: 0.9 },
      { time: 0.04, frequency: 440, confidence: 0.9 },
      { time: 0.05, frequency: 440, confidence: 0.9 },
      { time: 0.06, frequency: null, confidence: 0 },
      { time: 0.07, frequency: null, confidence: 0 },
    ];

    const notes = framesToNotes(frames, { minNoteDuration: 0.01 });

    expect(notes).toHaveLength(1);
    expect(notes[0].pitch).toBe(69); // A4
    expect(notes[0].startTime).toBe(0);
    expect(notes[0].duration).toBeCloseTo(0.06, 2);
    expect(notes[0].confidence).toBeGreaterThan(0.5);
  });

  it('creates separate notes for different pitches', () => {
    const frames: PitchFrame[] = [
      { time: 0.0, frequency: 440, confidence: 0.9 },
      { time: 0.01, frequency: 440, confidence: 0.9 },
      { time: 0.02, frequency: 440, confidence: 0.9 },
      { time: 0.03, frequency: 523.25, confidence: 0.9 }, // C5
      { time: 0.04, frequency: 523.25, confidence: 0.9 },
      { time: 0.05, frequency: 523.25, confidence: 0.9 },
    ];

    const notes = framesToNotes(frames, { minNoteDuration: 0.01 });

    expect(notes).toHaveLength(2);
    expect(notes[0].pitch).toBe(69); // A4
    expect(notes[1].pitch).toBe(72); // C5
  });

  it('filters out notes shorter than minNoteDuration', () => {
    const frames: PitchFrame[] = [
      { time: 0.0, frequency: 440, confidence: 0.9 },
      { time: 0.01, frequency: null, confidence: 0 },
    ];

    const notes = framesToNotes(frames, { minNoteDuration: 0.05 });

    expect(notes).toHaveLength(0);
  });

  it('returns empty array for empty input', () => {
    const notes = framesToNotes([]);
    expect(notes).toHaveLength(0);
  });

  it('handles all-silence frames', () => {
    const frames: PitchFrame[] = [
      { time: 0.0, frequency: null, confidence: 0 },
      { time: 0.01, frequency: null, confidence: 0 },
    ];

    const notes = framesToNotes(frames);
    expect(notes).toHaveLength(0);
  });
});

describe('end-to-end: sine wave to notes', () => {
  const sampleRate = 16000;

  it('converts a two-note melody into two detected notes', () => {
    // Generate A4 for 0.3s, then silence, then C5 for 0.3s
    const noteA = generateSineWave(440, 0.3, sampleRate);
    const gap = generateSilence(0.1, sampleRate);
    const noteC = generateSineWave(523.25, 0.3, sampleRate);
    const tail = generateSilence(0.1, sampleRate);
    const samples = concat(noteA, gap, noteC, tail);

    const frames = detectPitchFrames(samples, sampleRate, { threshold: 0.2 });
    const notes = framesToNotes(frames, { minNoteDuration: 0.05 });

    expect(notes.length).toBeGreaterThanOrEqual(2);

    // First note should be A4 (MIDI 69)
    const aNote = notes.find((n) => n.pitch === 69);
    expect(aNote).not.toBeUndefined();
    expect(aNote!.startTime).toBeCloseTo(0, 1);

    // Second note should be C5 (MIDI 72)
    const cNote = notes.find((n) => n.pitch === 72);
    expect(cNote).not.toBeUndefined();
  });
});
