import { describe, expect, it } from 'vitest';
import { convertSamplesToMidi, detectedNotesToMidi } from '../../src/services/audioToMidi';
import type { DetectedNote } from '../../src/utils/pitchDetection';

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

describe('detectedNotesToMidi', () => {
  it('converts detected notes to MIDI with correct beat positions', () => {
    const bpm = 120;
    const detected: DetectedNote[] = [
      { pitch: 69, startTime: 0, duration: 0.5, confidence: 0.9 },
      { pitch: 72, startTime: 0.5, duration: 0.5, confidence: 0.8 },
    ];

    const midiNotes = detectedNotesToMidi(detected, bpm, 0, 0.5);

    expect(midiNotes).toHaveLength(2);

    // At 120 BPM, 0.5s = 1 beat
    expect(midiNotes[0].pitch).toBe(69);
    expect(midiNotes[0].startBeat).toBeCloseTo(0, 5);
    expect(midiNotes[0].durationBeats).toBeCloseTo(1, 5);

    expect(midiNotes[1].pitch).toBe(72);
    expect(midiNotes[1].startBeat).toBeCloseTo(1, 5);
    expect(midiNotes[1].durationBeats).toBeCloseTo(1, 5);
  });

  it('filters out notes below minConfidence', () => {
    const detected: DetectedNote[] = [
      { pitch: 69, startTime: 0, duration: 0.5, confidence: 0.9 },
      { pitch: 72, startTime: 0.5, duration: 0.5, confidence: 0.3 },
    ];

    const midiNotes = detectedNotesToMidi(detected, 120, 0, 0.5);

    expect(midiNotes).toHaveLength(1);
    expect(midiNotes[0].pitch).toBe(69);
  });

  it('assigns unique IDs to each note', () => {
    const detected: DetectedNote[] = [
      { pitch: 60, startTime: 0, duration: 0.5, confidence: 0.9 },
      { pitch: 64, startTime: 0.5, duration: 0.5, confidence: 0.9 },
    ];

    const midiNotes = detectedNotesToMidi(detected, 120, 0, 0.5);

    expect(typeof midiNotes[0].id).toBe('string');
    expect(typeof midiNotes[1].id).toBe('string');
    expect(midiNotes[0].id).not.toBe(midiNotes[1].id);
  });

  it('maps confidence to velocity (0.5–1.0 range)', () => {
    const detected: DetectedNote[] = [
      { pitch: 60, startTime: 0, duration: 0.5, confidence: 1.0 },
    ];

    const midiNotes = detectedNotesToMidi(detected, 120, 0, 0.5);

    expect(midiNotes[0].velocity).toBe(1.0);
  });
});

describe('convertSamplesToMidi', () => {
  const sampleRate = 16000;
  const bpm = 120;

  it('converts a sine wave to MIDI notes', () => {
    const samples = generateSineWave(440, 0.5, sampleRate);
    const tail = generateSilence(0.2, sampleRate);
    const buffer = concat(samples, tail);

    const result = convertSamplesToMidi(buffer, sampleRate, bpm, 0, {
      threshold: 0.2,
      minConfidence: 0.3,
    });

    expect(result.notes.length).toBeGreaterThanOrEqual(1);

    // Should detect A4
    const a4Notes = result.notes.filter((n) => n.pitch === 69);
    expect(a4Notes.length).toBeGreaterThanOrEqual(1);
  });

  it('returns empty for silence', () => {
    const samples = generateSilence(0.5, sampleRate);

    const result = convertSamplesToMidi(samples, sampleRate, bpm, 0);

    expect(result.notes).toHaveLength(0);
    expect(result.detectedNotes).toHaveLength(0);
  });

  it('detects multiple notes in sequence', () => {
    const noteA = generateSineWave(440, 0.3, sampleRate);
    const gap = generateSilence(0.1, sampleRate);
    const noteE = generateSineWave(329.63, 0.3, sampleRate); // E4
    const tail = generateSilence(0.1, sampleRate);
    const samples = concat(noteA, gap, noteE, tail);

    const result = convertSamplesToMidi(samples, sampleRate, bpm, 0, {
      threshold: 0.2,
      minConfidence: 0.3,
    });

    expect(result.notes.length).toBeGreaterThanOrEqual(2);

    // Notes should have valid MIDI properties
    for (const note of result.notes) {
      expect(typeof note.id).toBe('string');
      expect(note.pitch).toBeGreaterThanOrEqual(0);
      expect(note.pitch).toBeLessThanOrEqual(127);
      expect(note.startBeat).toBeGreaterThanOrEqual(0);
      expect(note.durationBeats).toBeGreaterThan(0);
      expect(note.velocity).toBeGreaterThan(0);
      expect(note.velocity).toBeLessThanOrEqual(1);
    }
  });

  it('respects the audio offset for beat calculation', () => {
    const samples = generateSineWave(440, 0.5, sampleRate);
    const tail = generateSilence(0.2, sampleRate);
    const buffer = concat(samples, tail);

    // With offset of 1 second, beats should be shifted
    const result = convertSamplesToMidi(buffer, sampleRate, bpm, 1.0, {
      threshold: 0.2,
      minConfidence: 0.3,
    });

    // All notes should have negative startBeat (since audio starts before clip)
    // or we filter them — depends on implementation
    // With our implementation, notes with startBeat < 0 are filtered out
    expect(result.notes).toHaveLength(0);
  });
});
