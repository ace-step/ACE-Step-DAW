import { describe, it, expect } from 'vitest';
import { analyzeHumRecording } from '../humToSong';

/**
 * Generate a synthetic sine wave at a given frequency.
 * Used to simulate a hummed melody for pitch detection testing.
 */
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

/**
 * Concatenate multiple Float32Arrays into one.
 */
function concatFloat32(arrays: Float32Array[]): Float32Array {
  const totalLength = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Float32Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

// ─── analyzeHumRecording ────────────────────────────────────────────────────

describe('analyzeHumRecording', () => {
  const sampleRate = 44100;

  it('detects a single sustained note (A4 = 440 Hz)', () => {
    const samples = generateSineWave(440, 1.0, sampleRate);
    const result = analyzeHumRecording(samples, sampleRate, 120);

    expect(result.detectedNotes.length).toBeGreaterThan(0);
    expect(result.midiNotes.length).toBeGreaterThan(0);
    // Should detect A4 = MIDI 69
    expect(result.midiNotes[0].pitch).toBe(69);
  });

  it('detects a two-note melody (A4 → C5)', () => {
    const noteA = generateSineWave(440, 0.5, sampleRate);    // A4
    const noteC = generateSineWave(523.25, 0.5, sampleRate);  // C5
    const samples = concatFloat32([noteA, noteC]);
    const result = analyzeHumRecording(samples, sampleRate, 120);

    expect(result.midiNotes.length).toBeGreaterThanOrEqual(2);
    const pitches = result.midiNotes.map(n => n.pitch);
    expect(pitches).toContain(69); // A4
    expect(pitches).toContain(72); // C5
  });

  it('returns empty notes for silence', () => {
    const samples = new Float32Array(sampleRate); // 1 second silence
    const result = analyzeHumRecording(samples, sampleRate, 120);

    expect(result.detectedNotes).toHaveLength(0);
    expect(result.midiNotes).toHaveLength(0);
  });

  it('respects minConfidence option', () => {
    const samples = generateSineWave(440, 0.5, sampleRate);
    // Very high confidence threshold — may filter some notes
    const strict = analyzeHumRecording(samples, sampleRate, 120, { minConfidence: 0.99 });
    const lenient = analyzeHumRecording(samples, sampleRate, 120, { minConfidence: 0.1 });

    expect(lenient.midiNotes.length).toBeGreaterThanOrEqual(strict.midiNotes.length);
  });

  it('converts detected note timing to beats using BPM', () => {
    const samples = generateSineWave(440, 1.0, sampleRate);
    const bpm = 120;
    const result = analyzeHumRecording(samples, sampleRate, bpm);

    // At 120 BPM, 1 second = 2 beats
    if (result.midiNotes.length > 0) {
      const note = result.midiNotes[0];
      expect(note.startBeat).toBeGreaterThanOrEqual(0);
      expect(note.durationBeats).toBeGreaterThan(0);
    }
  });

  it('includes pitch range in analysis result', () => {
    const noteA = generateSineWave(440, 0.5, sampleRate);
    const noteC = generateSineWave(523.25, 0.5, sampleRate);
    const samples = concatFloat32([noteA, noteC]);
    const result = analyzeHumRecording(samples, sampleRate, 120);

    expect(result.pitchRange).toBeDefined();
    expect(result.pitchRange.min).toBeLessThanOrEqual(result.pitchRange.max);
    if (result.detectedNotes.length > 0) {
      expect(result.pitchRange.min).toBeGreaterThanOrEqual(0);
      expect(result.pitchRange.max).toBeLessThanOrEqual(127);
    }
  });

  it('includes duration metadata', () => {
    const samples = generateSineWave(440, 2.0, sampleRate);
    const result = analyzeHumRecording(samples, sampleRate, 120);

    expect(result.durationSeconds).toBeCloseTo(2.0, 0);
    expect(result.durationBeats).toBeCloseTo(4.0, 0); // 2s at 120BPM = 4 beats
  });

  it('handles very short recordings (< 1 second)', () => {
    const samples = generateSineWave(440, 0.3, sampleRate);
    const result = analyzeHumRecording(samples, sampleRate, 120);

    // Should still work, may have limited detection
    expect(result.durationSeconds).toBeCloseTo(0.3, 1);
  });

  it('handles melody with silence gaps', () => {
    const noteA = generateSineWave(440, 0.3, sampleRate);
    const silence = new Float32Array(Math.floor(sampleRate * 0.2));
    const noteE = generateSineWave(329.63, 0.3, sampleRate); // E4
    const samples = concatFloat32([noteA, silence, noteE]);
    const result = analyzeHumRecording(samples, sampleRate, 120);

    // Should detect at least 2 notes with a gap
    expect(result.midiNotes.length).toBeGreaterThanOrEqual(2);
  });
});
