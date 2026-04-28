import { describe, it, expect } from 'vitest';
import { frequencyToMidi, detectPitchFrames, framesToNotes, type PitchFrame } from '../pitchDetection';

// ─── frequencyToMidi ────────────────────────────────────────────────────────

describe('frequencyToMidi', () => {
  it('converts A4 (440 Hz) to MIDI 69', () => {
    expect(frequencyToMidi(440)).toBe(69);
  });

  it('converts middle C (~261.63 Hz) to MIDI 60', () => {
    expect(frequencyToMidi(261.6256)).toBeCloseTo(60, 1);
  });

  it('converts A3 (220 Hz) to MIDI 57', () => {
    expect(frequencyToMidi(220)).toBeCloseTo(57, 5);
  });

  it('converts A5 (880 Hz) to MIDI 81', () => {
    expect(frequencyToMidi(880)).toBeCloseTo(81, 5);
  });

  it('converts C3 (~130.81 Hz) to MIDI 48', () => {
    expect(frequencyToMidi(130.8128)).toBeCloseTo(48, 1);
  });

  it('handles very low frequency (27.5 Hz = A0 = MIDI 21)', () => {
    expect(frequencyToMidi(27.5)).toBeCloseTo(21, 1);
  });

  it('handles very high frequency (4186 Hz ≈ C8 = MIDI 108)', () => {
    expect(frequencyToMidi(4186.01)).toBeCloseTo(108, 0);
  });

  it('returns negative values for sub-MIDI frequencies', () => {
    expect(frequencyToMidi(1)).toBeLessThan(0);
  });
});

// ─── detectPitchFrames ──────────────────────────────────────────────────────

describe('detectPitchFrames', () => {
  it('returns empty array for empty buffer', () => {
    expect(detectPitchFrames(new Float32Array(0), 44100)).toEqual([]);
  });

  it('returns empty array for buffer too short for analysis', () => {
    // Need at least 2 * windowSize samples. For minFreq=80, windowSize=44100/80≈551
    // So need at least ~1102 samples
    const short = new Float32Array(100);
    expect(detectPitchFrames(short, 44100)).toEqual([]);
  });

  it('returns frames with null frequency for silent audio', () => {
    const sampleRate = 44100;
    const samples = new Float32Array(sampleRate); // 1 second of silence
    const frames = detectPitchFrames(samples, sampleRate);
    expect(frames.length).toBeGreaterThan(0);
    for (const frame of frames) {
      expect(frame.frequency).toBeNull();
      expect(frame.confidence).toBe(0);
    }
  });

  it('detects pitch of a pure sine wave at A4 (440 Hz)', () => {
    const sampleRate = 44100;
    const duration = 0.5; // 0.5 seconds
    const freq = 440;
    const samples = new Float32Array(Math.floor(sampleRate * duration));
    for (let i = 0; i < samples.length; i++) {
      samples[i] = Math.sin(2 * Math.PI * freq * i / sampleRate);
    }

    const frames = detectPitchFrames(samples, sampleRate);
    expect(frames.length).toBeGreaterThan(0);

    // Most frames should detect A4
    const detectedFrames = frames.filter((f) => f.frequency !== null);
    expect(detectedFrames.length).toBeGreaterThan(0);

    for (const frame of detectedFrames) {
      expect(frame.frequency).not.toBeNull();
      // Should be close to 440 Hz (within 5%)
      expect(frame.frequency!).toBeGreaterThan(418);
      expect(frame.frequency!).toBeLessThan(462);
      expect(frame.confidence).toBeGreaterThan(0);
    }
  });

  it('detects pitch of a lower frequency (200 Hz)', () => {
    const sampleRate = 44100;
    const freq = 200;
    const samples = new Float32Array(Math.floor(sampleRate * 0.5));
    for (let i = 0; i < samples.length; i++) {
      samples[i] = Math.sin(2 * Math.PI * freq * i / sampleRate);
    }

    const frames = detectPitchFrames(samples, sampleRate);
    const detectedFrames = frames.filter((f) => f.frequency !== null);
    expect(detectedFrames.length).toBeGreaterThan(0);

    for (const frame of detectedFrames) {
      expect(frame.frequency!).toBeGreaterThan(180);
      expect(frame.frequency!).toBeLessThan(220);
    }
  });

  it('respects minFrequency and maxFrequency options', () => {
    const sampleRate = 44100;
    const freq = 440;
    const samples = new Float32Array(Math.floor(sampleRate * 0.5));
    for (let i = 0; i < samples.length; i++) {
      samples[i] = Math.sin(2 * Math.PI * freq * i / sampleRate);
    }

    // Set min above 440 — should not detect the pitch
    const frames = detectPitchFrames(samples, sampleRate, {
      minFrequency: 500,
      maxFrequency: 1000,
    });
    // Analysis should still produce frames, but all with null frequency
    expect(frames.length).toBeGreaterThan(0);
    for (const frame of frames) {
      expect(frame.frequency).toBeNull();
    }
  });

  it('returns frames with time in seconds', () => {
    const sampleRate = 44100;
    const samples = new Float32Array(sampleRate); // 1 second
    for (let i = 0; i < samples.length; i++) {
      samples[i] = Math.sin(2 * Math.PI * 440 * i / sampleRate);
    }

    const frames = detectPitchFrames(samples, sampleRate);
    expect(frames.length).toBeGreaterThan(0);
    expect(frames[0].time).toBe(0);
    // Last frame time should be less than total duration
    expect(frames[frames.length - 1].time).toBeLessThan(1);
  });

  it('confidence ranges from 0 to 1', () => {
    const sampleRate = 44100;
    const samples = new Float32Array(Math.floor(sampleRate * 0.5));
    for (let i = 0; i < samples.length; i++) {
      samples[i] = Math.sin(2 * Math.PI * 440 * i / sampleRate);
    }

    const frames = detectPitchFrames(samples, sampleRate);
    for (const frame of frames) {
      expect(frame.confidence).toBeGreaterThanOrEqual(0);
      expect(frame.confidence).toBeLessThanOrEqual(1);
    }
  });
});

// ─── framesToNotes ──────────────────────────────────────────────────────────

describe('framesToNotes', () => {
  it('returns empty array for empty frames', () => {
    expect(framesToNotes([])).toEqual([]);
  });

  it('returns empty array when all frames have null frequency', () => {
    const frames: PitchFrame[] = [
      { time: 0, frequency: null, confidence: 0 },
      { time: 0.01, frequency: null, confidence: 0 },
    ];
    expect(framesToNotes(frames)).toEqual([]);
  });

  it('groups consecutive frames with the same MIDI pitch into a note', () => {
    const frames: PitchFrame[] = [
      { time: 0.0, frequency: 440, confidence: 0.9 },
      { time: 0.01, frequency: 441, confidence: 0.9 }, // still rounds to MIDI 69
      { time: 0.02, frequency: 440, confidence: 0.9 },
      { time: 0.03, frequency: 440, confidence: 0.9 },
      { time: 0.04, frequency: 440, confidence: 0.9 },
      { time: 0.05, frequency: 440, confidence: 0.9 },
    ];

    const notes = framesToNotes(frames);
    expect(notes).toHaveLength(1);
    expect(notes[0].pitch).toBe(69); // A4
    expect(notes[0].startTime).toBe(0);
    expect(notes[0].duration).toBeGreaterThanOrEqual(0.05);
    expect(notes[0].confidence).toBeCloseTo(0.9, 1);
  });

  it('splits into separate notes when pitch changes', () => {
    const frames: PitchFrame[] = [
      { time: 0.0, frequency: 440, confidence: 0.9 }, // A4, MIDI 69
      { time: 0.01, frequency: 440, confidence: 0.9 },
      { time: 0.02, frequency: 440, confidence: 0.9 },
      { time: 0.03, frequency: 440, confidence: 0.9 },
      { time: 0.04, frequency: 440, confidence: 0.9 },
      { time: 0.05, frequency: 440, confidence: 0.9 },
      { time: 0.06, frequency: 523.25, confidence: 0.8 }, // C5, MIDI 72
      { time: 0.07, frequency: 523.25, confidence: 0.8 },
      { time: 0.08, frequency: 523.25, confidence: 0.8 },
      { time: 0.09, frequency: 523.25, confidence: 0.8 },
      { time: 0.10, frequency: 523.25, confidence: 0.8 },
      { time: 0.11, frequency: 523.25, confidence: 0.8 },
    ];

    const notes = framesToNotes(frames);
    expect(notes).toHaveLength(2);
    expect(notes[0].pitch).toBe(69);
    expect(notes[1].pitch).toBe(72);
  });

  it('filters out notes shorter than minNoteDuration', () => {
    const frames: PitchFrame[] = [
      { time: 0.0, frequency: 440, confidence: 0.9 },
      { time: 0.01, frequency: 440, confidence: 0.9 },
      // Very short — only 0.02s duration
      { time: 0.02, frequency: null, confidence: 0 },
      { time: 0.03, frequency: 523.25, confidence: 0.8 },
      { time: 0.04, frequency: 523.25, confidence: 0.8 },
      { time: 0.05, frequency: 523.25, confidence: 0.8 },
      { time: 0.06, frequency: 523.25, confidence: 0.8 },
      { time: 0.07, frequency: 523.25, confidence: 0.8 },
      { time: 0.08, frequency: 523.25, confidence: 0.8 },
    ];

    // With 0.05s minimum duration, the first A4 note (0.02s) should be filtered
    const notes = framesToNotes(frames, { minNoteDuration: 0.05 });
    expect(notes).toHaveLength(1);
    expect(notes[0].pitch).toBe(72); // Only the C5 note survives
  });

  it('handles silence gaps between notes', () => {
    const frames: PitchFrame[] = [
      { time: 0.0, frequency: 440, confidence: 0.9 },
      { time: 0.01, frequency: 440, confidence: 0.9 },
      { time: 0.02, frequency: 440, confidence: 0.9 },
      { time: 0.03, frequency: 440, confidence: 0.9 },
      { time: 0.04, frequency: 440, confidence: 0.9 },
      { time: 0.05, frequency: 440, confidence: 0.9 },
      { time: 0.06, frequency: null, confidence: 0 },
      { time: 0.07, frequency: null, confidence: 0 },
      { time: 0.08, frequency: 440, confidence: 0.9 },
      { time: 0.09, frequency: 440, confidence: 0.9 },
      { time: 0.10, frequency: 440, confidence: 0.9 },
      { time: 0.11, frequency: 440, confidence: 0.9 },
      { time: 0.12, frequency: 440, confidence: 0.9 },
      { time: 0.13, frequency: 440, confidence: 0.9 },
    ];

    const notes = framesToNotes(frames);
    // Should produce 2 A4 notes separated by silence
    expect(notes).toHaveLength(2);
    expect(notes[0].pitch).toBe(69);
    expect(notes[1].pitch).toBe(69);
    expect(notes[1].startTime).toBeGreaterThan(notes[0].startTime);
  });

  it('excludes frames with out-of-range MIDI pitches (below 0 or above 127)', () => {
    const frames: PitchFrame[] = [
      // 1 Hz → MIDI ≈ -36 (below 0, should be excluded)
      { time: 0.0, frequency: 1, confidence: 0.9 },
      { time: 0.01, frequency: 1, confidence: 0.9 },
      { time: 0.02, frequency: 1, confidence: 0.9 },
      { time: 0.03, frequency: 1, confidence: 0.9 },
      { time: 0.04, frequency: 1, confidence: 0.9 },
      { time: 0.05, frequency: 1, confidence: 0.9 },
      // 20000 Hz → MIDI ≈ 135 (above 127, should be excluded)
      { time: 0.06, frequency: 20000, confidence: 0.9 },
      { time: 0.07, frequency: 20000, confidence: 0.9 },
      { time: 0.08, frequency: 20000, confidence: 0.9 },
      { time: 0.09, frequency: 20000, confidence: 0.9 },
      { time: 0.10, frequency: 20000, confidence: 0.9 },
      { time: 0.11, frequency: 20000, confidence: 0.9 },
    ];

    const notes = framesToNotes(frames);
    // Both frequencies produce out-of-range MIDI — treated as null, no notes produced
    expect(notes).toHaveLength(0);
  });

  it('averages confidence across merged frames', () => {
    const frames: PitchFrame[] = [
      { time: 0.0, frequency: 440, confidence: 0.8 },
      { time: 0.01, frequency: 440, confidence: 0.6 },
      { time: 0.02, frequency: 440, confidence: 0.9 },
      { time: 0.03, frequency: 440, confidence: 0.7 },
      { time: 0.04, frequency: 440, confidence: 0.5 },
      { time: 0.05, frequency: 440, confidence: 1.0 },
    ];

    const notes = framesToNotes(frames);
    expect(notes).toHaveLength(1);
    // Average: (0.8 + 0.6 + 0.9 + 0.7 + 0.5 + 1.0) / 6 = 0.75
    expect(notes[0].confidence).toBeCloseTo(0.75, 2);
  });
});
