import { describe, it, expect, vi } from 'vitest';
import { detectedNotesToMidi, convertSamplesToMidi } from '../audioToMidi';
import type { DetectedNote } from '../../utils/pitchDetection';
import * as pitchDetection from '../../utils/pitchDetection';

vi.mock('../../utils/pitchDetection', () => ({
  detectPitchFrames: vi.fn().mockReturnValue([]),
  framesToNotes: vi.fn().mockReturnValue([]),
}));

const mockDetectPitchFrames = pitchDetection.detectPitchFrames as ReturnType<typeof vi.fn>;
const mockFramesToNotes = pitchDetection.framesToNotes as ReturnType<typeof vi.fn>;

describe('detectedNotesToMidi', () => {
  it('converts detected notes to MIDI notes with correct beat positions', () => {
    const detectedNotes: DetectedNote[] = [
      { pitch: 60, startTime: 0, duration: 0.5, confidence: 0.9 },
      { pitch: 64, startTime: 0.5, duration: 0.5, confidence: 0.8 },
    ];

    const result = detectedNotesToMidi(detectedNotes, 120, 0, 0.5);

    // At 120 BPM, 1 second = 2 beats
    expect(result).toHaveLength(2);
    expect(result[0].pitch).toBe(60);
    expect(result[0].startBeat).toBe(0); // 0s * 2 beats/s = 0
    expect(result[0].durationBeats).toBe(1); // 0.5s * 2 = 1 beat
    expect(result[1].pitch).toBe(64);
    expect(result[1].startBeat).toBe(1); // 0.5s * 2 = 1 beat
  });

  it('filters notes below minConfidence', () => {
    const detectedNotes: DetectedNote[] = [
      { pitch: 60, startTime: 0, duration: 0.5, confidence: 0.9 },
      { pitch: 64, startTime: 0.5, duration: 0.5, confidence: 0.3 },
    ];

    const result = detectedNotesToMidi(detectedNotes, 120, 0, 0.5);

    expect(result).toHaveLength(1);
    expect(result[0].pitch).toBe(60);
  });

  it('maps confidence to velocity', () => {
    const detectedNotes: DetectedNote[] = [
      { pitch: 60, startTime: 0, duration: 0.5, confidence: 1.0 },
      { pitch: 64, startTime: 0.5, duration: 0.5, confidence: 0.5 },
    ];

    const result = detectedNotesToMidi(detectedNotes, 120, 0, 0.5);

    // velocity = min(1, 0.5 + confidence * 0.5)
    expect(result[0].velocity).toBe(1); // 0.5 + 1.0 * 0.5 = 1.0
    expect(result[1].velocity).toBe(0.75); // 0.5 + 0.5 * 0.5 = 0.75
  });

  it('enforces minimum duration of 1/32 note (0.125 beats)', () => {
    const detectedNotes: DetectedNote[] = [
      { pitch: 60, startTime: 0, duration: 0.001, confidence: 0.9 },
    ];

    // At 120 BPM: 0.001s * 2 = 0.002 beats, which is below 0.125
    const result = detectedNotesToMidi(detectedNotes, 120, 0, 0.5);

    expect(result[0].durationBeats).toBe(0.125);
  });

  it('offsets notes by clipStartTime', () => {
    const detectedNotes: DetectedNote[] = [
      { pitch: 60, startTime: 2, duration: 0.5, confidence: 0.9 },
    ];

    // clipStartTime = 1s, so the note starts at 1s relative to clip
    const result = detectedNotesToMidi(detectedNotes, 120, 1, 0.5);

    expect(result[0].startBeat).toBe(2); // (2 - 1) * 2 = 2 beats
  });

  it('filters notes that start before clip (negative startBeat)', () => {
    const detectedNotes: DetectedNote[] = [
      { pitch: 60, startTime: 0, duration: 0.5, confidence: 0.9 },
    ];

    // clipStartTime = 2s, so note at 0s starts at -2s relative — should be filtered
    const result = detectedNotesToMidi(detectedNotes, 120, 2, 0.5);

    expect(result).toHaveLength(0);
  });

  it('handles different BPM values correctly', () => {
    const detectedNotes: DetectedNote[] = [
      { pitch: 60, startTime: 0, duration: 1, confidence: 0.9 },
    ];

    // At 60 BPM: 1 beat per second
    const result60 = detectedNotesToMidi(detectedNotes, 60, 0, 0.5);
    expect(result60[0].startBeat).toBe(0);
    expect(result60[0].durationBeats).toBe(1);

    // At 180 BPM: 3 beats per second
    const result180 = detectedNotesToMidi(detectedNotes, 180, 0, 0.5);
    expect(result180[0].durationBeats).toBe(3);
  });

  it('generates unique IDs for each MIDI note', () => {
    const detectedNotes: DetectedNote[] = [
      { pitch: 60, startTime: 0, duration: 0.5, confidence: 0.9 },
      { pitch: 64, startTime: 0.5, duration: 0.5, confidence: 0.9 },
    ];

    const result = detectedNotesToMidi(detectedNotes, 120, 0, 0.5);

    expect(result[0].id).toBeTruthy();
    expect(result[1].id).toBeTruthy();
    expect(result[0].id).not.toBe(result[1].id);
  });

  it('returns empty array for empty input', () => {
    const result = detectedNotesToMidi([], 120, 0, 0.5);
    expect(result).toHaveLength(0);
  });
});

describe('convertSamplesToMidi', () => {
  it('returns empty notes when no pitch detected', () => {
    const samples = new Float32Array(1024);
    const result = convertSamplesToMidi(samples, 44100, 120, 0);

    expect(result.notes).toHaveLength(0);
    expect(result.detectedNotes).toHaveLength(0);
  });

  it('passes options through to pitch detection', () => {
    const samples = new Float32Array(1024);

    convertSamplesToMidi(samples, 44100, 120, 0, {
      minConfidence: 0.7,
      hopSize: 256,
    });

    expect(mockDetectPitchFrames).toHaveBeenCalledWith(
      samples,
      44100,
      expect.objectContaining({ hopSize: 256 }),
    );
  });

  it('uses default minConfidence of 0.5', () => {
    mockFramesToNotes.mockReturnValueOnce([
      { pitch: 60, startTime: 0, duration: 0.5, confidence: 0.4 },
      { pitch: 64, startTime: 0.5, duration: 0.5, confidence: 0.6 },
    ]);

    const samples = new Float32Array(1024);
    const result = convertSamplesToMidi(samples, 44100, 120, 0);

    // Only the note with confidence 0.6 should pass (0.4 < 0.5)
    expect(result.notes).toHaveLength(1);
    expect(result.notes[0].pitch).toBe(64);
  });
});
