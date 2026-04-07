/**
 * Audio-to-MIDI conversion service.
 * Converts monophonic audio clips to MIDI notes using YIN pitch detection.
 */
import { v4 as uuidv4 } from 'uuid';
import type { MidiNote } from '../types/project';
import {
  detectPitchFrames,
  framesToNotes,
  type PitchDetectionOptions,
  type DetectedNote,
} from '../utils/pitchDetection';
import { loadAudioBlobByKey } from './audioFileManager';
import { getAudioEngine } from '../hooks/useAudioEngine';

export interface AudioToMidiOptions extends PitchDetectionOptions {
  /** Minimum confidence to include a note (0–1, default 0.5) */
  minConfidence?: number;
}

export interface AudioToMidiResult {
  notes: MidiNote[];
  detectedNotes: DetectedNote[];
}

/**
 * Load audio samples from a clip's audio key.
 * Returns mono Float32Array and the sample rate.
 */
export async function loadClipAudioSamples(
  audioKey: string,
): Promise<{ samples: Float32Array; sampleRate: number; duration: number }> {
  const blob = await loadAudioBlobByKey(audioKey);
  if (!blob) throw new Error('Audio not found for the given key');

  const engine = getAudioEngine();
  const arrayBuffer = await blob.arrayBuffer();
  const audioBuffer = await engine.ctx.decodeAudioData(arrayBuffer);

  // Mix to mono if stereo
  const samples = audioBuffer.numberOfChannels === 1
    ? audioBuffer.getChannelData(0)
    : mixToMono(audioBuffer);

  return { samples, sampleRate: audioBuffer.sampleRate, duration: audioBuffer.duration };
}

/**
 * Mix a multi-channel AudioBuffer down to mono.
 */
function mixToMono(audioBuffer: AudioBuffer): Float32Array {
  const length = audioBuffer.length;
  const channels = audioBuffer.numberOfChannels;
  const mono = new Float32Array(length);
  for (let ch = 0; ch < channels; ch++) {
    const data = audioBuffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      mono[i] += data[i];
    }
  }
  const scale = 1 / channels;
  for (let i = 0; i < length; i++) {
    mono[i] *= scale;
  }
  return mono;
}

/**
 * Convert detected notes (in seconds) to MIDI notes (in beats).
 */
export function detectedNotesToMidi(
  detectedNotes: DetectedNote[],
  bpm: number,
  clipStartTime: number,
  minConfidence: number,
): MidiNote[] {
  const beatsPerSecond = bpm / 60;
  return detectedNotes
    .filter((n) => n.confidence >= minConfidence)
    .map((n) => ({
      id: uuidv4(),
      pitch: n.pitch,
      startBeat: (n.startTime - clipStartTime) * beatsPerSecond,
      durationBeats: Math.max(n.duration * beatsPerSecond, 0.125), // min 1/32 note
      velocity: Math.min(1, 0.5 + n.confidence * 0.5), // map confidence to velocity
      confidence: n.confidence, // preserve for visualization
    }))
    .filter((n) => n.startBeat >= 0);
}

/**
 * Run full audio-to-MIDI conversion on raw samples.
 * This is the pure function that can be tested without audio engine dependencies.
 */
export function convertSamplesToMidi(
  samples: Float32Array,
  sampleRate: number,
  bpm: number,
  audioOffsetSeconds: number,
  options: AudioToMidiOptions = {},
): AudioToMidiResult {
  const { minConfidence = 0.5, ...pitchOptions } = options;

  const frames = detectPitchFrames(samples, sampleRate, pitchOptions);
  const detectedNotes = framesToNotes(frames, pitchOptions);

  const midiNotes = detectedNotesToMidi(detectedNotes, bpm, audioOffsetSeconds, minConfidence);

  return { notes: midiNotes, detectedNotes };
}

/**
 * Convert an audio clip to MIDI notes.
 * Loads audio from IndexedDB, runs pitch detection, and returns MIDI notes.
 */
export async function convertClipAudioToMidi(
  audioKey: string,
  bpm: number,
  options: AudioToMidiOptions = {},
): Promise<AudioToMidiResult> {
  const { samples, sampleRate } = await loadClipAudioSamples(audioKey);
  return convertSamplesToMidi(samples, sampleRate, bpm, 0, options);
}
