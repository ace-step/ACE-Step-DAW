/**
 * Tests for audio-to-MIDI confidence field preservation and conversion.
 */
import { describe, expect, it } from 'vitest';
import { detectedNotesToMidi } from '../../src/services/audioToMidi';
import type { DetectedNote } from '../../src/utils/pitchDetection';

describe('detectedNotesToMidi confidence preservation', () => {
  it('should preserve confidence field on converted notes', () => {
    const detected: DetectedNote[] = [
      { pitch: 69, startTime: 0, duration: 0.5, confidence: 0.85 },
      { pitch: 72, startTime: 0.5, duration: 0.5, confidence: 0.42 },
    ];

    const midiNotes = detectedNotesToMidi(detected, 120, 0, 0.3);

    expect(midiNotes).toHaveLength(2);
    expect(midiNotes[0].confidence).toBe(0.85);
    expect(midiNotes[1].confidence).toBe(0.42);
  });

  it('should set confidence to exact detected value', () => {
    const detected: DetectedNote[] = [
      { pitch: 60, startTime: 0, duration: 0.5, confidence: 1.0 },
    ];

    const midiNotes = detectedNotesToMidi(detected, 120, 0, 0.5);

    expect(midiNotes[0].confidence).toBe(1.0);
  });

  it('should preserve confidence on filtered results', () => {
    const detected: DetectedNote[] = [
      { pitch: 60, startTime: 0, duration: 0.5, confidence: 0.9 },
      { pitch: 62, startTime: 0.5, duration: 0.5, confidence: 0.3 },
      { pitch: 64, startTime: 1.0, duration: 0.5, confidence: 0.7 },
    ];

    const midiNotes = detectedNotesToMidi(detected, 120, 0, 0.5);

    // Only notes with confidence >= 0.5 should pass
    expect(midiNotes).toHaveLength(2);
    expect(midiNotes[0].confidence).toBe(0.9);
    expect(midiNotes[1].confidence).toBe(0.7);
  });

  it('should store confidence independent of velocity mapping', () => {
    const detected: DetectedNote[] = [
      { pitch: 60, startTime: 0, duration: 0.5, confidence: 0.6 },
    ];

    const midiNotes = detectedNotesToMidi(detected, 120, 0, 0.5);

    // Velocity is mapped: 0.5 + confidence * 0.5
    expect(midiNotes[0].velocity).toBeCloseTo(0.8, 5);
    // Confidence is preserved raw
    expect(midiNotes[0].confidence).toBe(0.6);
  });
});
