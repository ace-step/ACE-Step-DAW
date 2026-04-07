/**
 * Hum-to-Song service.
 * Analyzes a recorded hummed melody, extracts pitch information,
 * and converts it to MIDI notes for display and generation conditioning.
 *
 * Reuses the YIN pitch detection from pitchDetection.ts and
 * MIDI conversion from audioToMidi.ts.
 */

import type { MidiNote } from '../types/project';
import {
  detectPitchFrames,
  framesToNotes,
  type PitchDetectionOptions,
  type DetectedNote,
} from '../utils/pitchDetection';
import { detectedNotesToMidi } from './audioToMidi';

export interface HumToSongOptions extends PitchDetectionOptions {
  /** Minimum confidence to include a note (0–1, default 0.3 — lower than A2M since hums are noisier) */
  minConfidence?: number;
}

export interface HumAnalysisResult {
  /** Raw detected notes with timing in seconds */
  detectedNotes: DetectedNote[];
  /** MIDI notes with timing in beats, ready for piano roll display */
  midiNotes: MidiNote[];
  /** Pitch range of detected melody */
  pitchRange: { min: number; max: number };
  /** Total duration of the recording in seconds */
  durationSeconds: number;
  /** Total duration in beats (based on BPM) */
  durationBeats: number;
}

/**
 * Analyze a hummed recording and extract melody as MIDI notes.
 *
 * @param samples - Mono audio samples from the recording
 * @param sampleRate - Sample rate of the recording
 * @param bpm - Project BPM for beat conversion
 * @param options - Pitch detection tuning options
 */
export function analyzeHumRecording(
  samples: Float32Array,
  sampleRate: number,
  bpm: number,
  options: HumToSongOptions = {},
): HumAnalysisResult {
  const { minConfidence = 0.3, ...pitchOptions } = options;

  // Use tuned defaults for humming (wider frequency range, more lenient detection)
  const humDefaults: PitchDetectionOptions = {
    minFrequency: 60,    // Hums can be lower than sung notes
    maxFrequency: 800,   // Hums rarely go above ~800 Hz
    threshold: 0.2,      // Higher threshold = more lenient pitch acceptance for noisy hums
    minNoteDuration: 0.08, // Hums tend to be sustained, filter very short blips
    ...pitchOptions,
  };

  const frames = detectPitchFrames(samples, sampleRate, humDefaults);
  const detectedNotes = framesToNotes(frames, humDefaults);

  const midiNotes = detectedNotesToMidi(detectedNotes, bpm, 0, minConfidence);

  // Compute pitch range
  const pitches = detectedNotes.map(n => n.pitch);
  const pitchRange = pitches.length > 0
    ? { min: Math.min(...pitches), max: Math.max(...pitches) }
    : { min: 0, max: 0 };

  const durationSeconds = samples.length / sampleRate;
  const durationBeats = durationSeconds * (bpm / 60);

  return {
    detectedNotes,
    midiNotes,
    pitchRange,
    durationSeconds,
    durationBeats,
  };
}
