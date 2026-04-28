/**
 * pitchCorrection.ts — Pitch correction and vocal tuning engine.
 *
 * Algorithms:
 * 1. Phase vocoder pitch shifting (STFT resampling)
 * 2. PSOLA (Pitch Synchronous Overlap Add) for monophonic
 * 3. Auto-tune with scale-aware chromatic snapping
 * 4. Formant preservation via spectral envelope
 *
 * Works offline on Float32Array audio data.
 */

import { fft } from './melSpectrogram';
import { detectPitchFrames, frequencyToMidi, type PitchFrame } from './pitchDetection';

// ─── Musical Scales ──────────────────────────────────────────────────────────

export type ScaleType =
  | 'chromatic'
  | 'major'
  | 'minor'
  | 'pentatonic'
  | 'blues'
  | 'dorian'
  | 'mixolydian'
  | 'harmonicMinor';

/** Scale intervals (semitones from root) */
const SCALE_INTERVALS: Record<ScaleType, number[]> = {
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  pentatonic: [0, 2, 4, 7, 9],
  blues: [0, 3, 5, 6, 7, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
};

/** Note names for display */
export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/**
 * Snap a MIDI pitch to the nearest scale degree.
 * @param midi       Continuous MIDI pitch (can be fractional)
 * @param rootNote   Root note (0=C, 1=C#, ..., 11=B)
 * @param scale      Scale type
 * @returns          Nearest MIDI pitch on the scale
 */
export function snapToScale(midi: number, rootNote: number, scale: ScaleType): number {
  const intervals = SCALE_INTERVALS[scale];
  const octave = Math.floor(midi / 12);
  const noteInOctave = midi - octave * 12;
  const relativeNote = ((noteInOctave - rootNote) % 12 + 12) % 12;

  // Find nearest scale degree
  let bestDist = Infinity;
  let bestTarget = 0;

  for (const interval of intervals) {
    const dist = Math.abs(relativeNote - interval);
    const distWrap = Math.abs(relativeNote - interval + 12);
    const distWrap2 = Math.abs(relativeNote - interval - 12);
    const minDist = Math.min(dist, distWrap, distWrap2);
    if (minDist < bestDist) {
      bestDist = minDist;
      bestTarget = interval;
    }
  }

  return octave * 12 + rootNote + bestTarget;
}

// ─── Hann Window ──────────────────────────────────────────────────────────────

function hannWindow(size: number): Float32Array {
  const w = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
  }
  return w;
}

function ifft(real: Float32Array, imag: Float32Array): void {
  const n = real.length;
  for (let i = 0; i < n; i++) imag[i] = -imag[i];
  fft(real, imag);
  for (let i = 0; i < n; i++) {
    real[i] /= n;
    imag[i] = -imag[i] / n;
  }
}

// ─── Phase Vocoder Pitch Shift ───────────────────────────────────────────────

/**
 * Phase vocoder pitch shifting: time-stretch then resample.
 *
 * To shift pitch up by N semitones:
 *   1. Time-stretch by factor 2^(N/12) (make it longer)
 *   2. Resample back to original length (changes pitch)
 *
 * @param input      Input samples
 * @param semitones  Pitch shift in semitones (positive = up, negative = down)
 * @param fftSize    STFT window size
 * @returns          Pitch-shifted output
 */
/** Coerce to nearest power of 2 */
function coercePow2(n: number): number {
  return 2 ** Math.round(Math.log2(Math.max(256, n)));
}

export function phaseVocoderPitchShift(
  input: Float32Array,
  semitones: number,
  fftSize: number = 4096,
): Float32Array {
  fftSize = coercePow2(fftSize);
  if (Math.abs(semitones) < 0.01) return new Float32Array(input);
  if (input.length < fftSize) return new Float32Array(input);

  const pitchRatio = Math.pow(2, semitones / 12);
  const stretchRatio = pitchRatio; // Stretch by pitch ratio
  const analysisHop = Math.floor(fftSize / 4);
  const synthesisHop = Math.round(analysisHop * stretchRatio);
  const window = hannWindow(fftSize);
  const halfFFT = fftSize / 2 + 1;

  const numFrames = Math.floor((input.length - fftSize) / analysisHop) + 1;
  if (numFrames < 2) return new Float32Array(input);

  // Phase vocoder stretch
  const stretchedLen = Math.ceil((numFrames - 1) * synthesisHop + fftSize);
  const stretched = new Float32Array(stretchedLen);
  const windowSum = new Float32Array(stretchedLen);

  const prevPhase = new Float32Array(halfFFT);
  const synthPhase = new Float32Array(halfFFT);
  const expectedAdvance = new Float32Array(halfFFT);

  for (let k = 0; k < halfFFT; k++) {
    expectedAdvance[k] = (2 * Math.PI * k * analysisHop) / fftSize;
  }

  const fftReal = new Float32Array(fftSize);
  const fftImag = new Float32Array(fftSize);

  for (let frame = 0; frame < numFrames; frame++) {
    const inOff = frame * analysisHop;
    const outOff = frame * synthesisHop;

    for (let i = 0; i < fftSize; i++) {
      const idx = inOff + i;
      fftReal[i] = idx < input.length ? input[idx] * window[i] : 0;
      fftImag[i] = 0;
    }

    fft(fftReal, fftImag);

    for (let k = 0; k < halfFFT; k++) {
      const mag = Math.sqrt(fftReal[k] * fftReal[k] + fftImag[k] * fftImag[k]);
      const phase = Math.atan2(fftImag[k], fftReal[k]);

      let phaseDiff = phase - prevPhase[k] - expectedAdvance[k];
      phaseDiff -= 2 * Math.PI * Math.round(phaseDiff / (2 * Math.PI));

      const trueFreq = expectedAdvance[k] + phaseDiff;
      synthPhase[k] += trueFreq * (synthesisHop / analysisHop);
      prevPhase[k] = phase;

      fftReal[k] = mag * Math.cos(synthPhase[k]);
      fftImag[k] = mag * Math.sin(synthPhase[k]);
    }

    for (let k = halfFFT; k < fftSize; k++) {
      fftReal[k] = fftReal[fftSize - k];
      fftImag[k] = -fftImag[fftSize - k];
    }

    ifft(fftReal, fftImag);

    for (let i = 0; i < fftSize; i++) {
      const idx = outOff + i;
      if (idx < stretchedLen) {
        stretched[idx] += fftReal[i] * window[i];
        windowSum[idx] += window[i] * window[i];
      }
    }
  }

  for (let i = 0; i < stretchedLen; i++) {
    if (windowSum[i] > 1e-6) stretched[i] /= windowSum[i];
  }

  // Resample back to original length (this applies the pitch change)
  const output = new Float32Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const srcPos = (i / input.length) * stretchedLen;
    const idx = Math.floor(srcPos);
    const frac = srcPos - idx;
    if (idx + 1 < stretchedLen) {
      output[i] = stretched[idx] * (1 - frac) + stretched[idx + 1] * frac;
    } else if (idx < stretchedLen) {
      output[i] = stretched[idx];
    }
  }

  return output;
}

// ─── PSOLA Pitch Shift ──────────────────────────────────────────────────────

/**
 * PSOLA pitch shifting for monophonic material.
 * Works by detecting pitch periods and repositioning them.
 *
 * @param input      Input samples
 * @param semitones  Pitch shift in semitones
 * @param sampleRate Sample rate
 * @returns          Pitch-shifted output
 */
export function psolaPitchShift(
  input: Float32Array,
  semitones: number,
  sampleRate: number = 48000,
): Float32Array {
  if (Math.abs(semitones) < 0.01) return new Float32Array(input);
  if (input.length < 512) return new Float32Array(input);

  const pitchRatio = Math.pow(2, semitones / 12);
  const output = new Float32Array(input.length);

  // Detect pitch periods using YIN
  const frames = detectPitchFrames(input, sampleRate, {
    minFrequency: 50,
    maxFrequency: 2000,
    threshold: 0.2,
    hopSize: Math.floor(sampleRate / 200),
  });

  // Get median period for voiced regions
  const periods = frames
    .filter(f => f.frequency !== null && f.frequency > 0)
    .map(f => sampleRate / f.frequency!);

  if (periods.length === 0) {
    // Unvoiced: fallback to simple resampling
    return simpleResample(input, pitchRatio);
  }

  const medianPeriod = periods.sort((a, b) => a - b)[Math.floor(periods.length / 2)];
  const windowSize = Math.round(medianPeriod * 2);
  const window = hannWindow(windowSize);
  const windowSum = new Float32Array(output.length);

  // Place analysis marks at pitch period intervals
  const analysisMarks: number[] = [];
  let pos = 0;
  let frameIdx = 0;
  while (pos + windowSize < input.length) {
    analysisMarks.push(pos);

    // Get local period
    while (frameIdx < frames.length - 1 && frames[frameIdx + 1].time * sampleRate < pos) {
      frameIdx++;
    }
    const localPeriod = frames[frameIdx]?.frequency
      ? sampleRate / frames[frameIdx].frequency!
      : medianPeriod;

    pos += Math.round(localPeriod);
  }

  // Place synthesis marks at modified intervals
  const synthHop = medianPeriod / pitchRatio;
  let synthPos = 0;
  let markIdx = 0;

  while (synthPos + windowSize < input.length && markIdx < analysisMarks.length) {
    const analysisMark = analysisMarks[markIdx];

    // Overlap-add windowed grain from analysis position to synthesis position
    for (let i = 0; i < windowSize; i++) {
      const srcIdx = analysisMark + i;
      const outIdx = Math.round(synthPos) + i;
      if (srcIdx < input.length && outIdx >= 0 && outIdx < output.length) {
        output[outIdx] += input[srcIdx] * window[i];
        windowSum[outIdx] += window[i] * window[i];
      }
    }

    synthPos += synthHop;
    markIdx++;
  }

  // Normalize by window sum
  for (let i = 0; i < output.length; i++) {
    if (windowSum[i] > 1e-6) output[i] /= windowSum[i];
  }

  return output;
}

/** Simple linear resampling for unvoiced content (clamped to input bounds) */
function simpleResample(input: Float32Array, ratio: number): Float32Array {
  const output = new Float32Array(input.length);
  if (input.length === 0) return output;
  const lastIndex = input.length - 1;
  for (let i = 0; i < output.length; i++) {
    const srcPos = Math.min(i * ratio, lastIndex);
    const idx = Math.floor(srcPos);
    const frac = srcPos - idx;
    if (idx + 1 < input.length) {
      output[i] = input[idx] * (1 - frac) + input[idx + 1] * frac;
    } else if (idx < input.length) {
      output[i] = input[idx];
    }
  }
  return output;
}

// ─── Auto-Tune Engine ────────────────────────────────────────────────────────

export interface AutoTuneOptions {
  /** Scale type for chromatic snapping */
  scale: ScaleType;
  /** Root note (0=C, 1=C#, ..., 11=B) */
  rootNote: number;
  /** Retune speed 0-400ms (0 = instant snap, 400 = very slow/natural) */
  retuneSpeed: number;
  /** Amount of correction 0-1 (0 = none, 1 = full correction) */
  amount: number;
  /** Sample rate */
  sampleRate?: number;
  /** FFT size for pitch shifting (default: 4096) */
  fftSize?: number;
}

export interface PitchCorrectionEvent {
  /** Start time in seconds */
  startTime: number;
  /** Duration in seconds */
  duration: number;
  /** Original MIDI pitch (fractional) */
  originalPitch: number;
  /** Corrected MIDI pitch */
  correctedPitch: number;
  /** Pitch shift in semitones */
  shiftSemitones: number;
}

/**
 * Analyze pitch and compute correction events (non-destructive).
 * Returns the correction map without modifying audio.
 */
export function analyzePitchCorrection(
  input: Float32Array,
  options: AutoTuneOptions,
): PitchCorrectionEvent[] {
  const sampleRate = options.sampleRate ?? 48000;

  const frames = detectPitchFrames(input, sampleRate, {
    minFrequency: 50,
    maxFrequency: 2000,
    threshold: 0.2,
    hopSize: Math.floor(sampleRate / 100),
  });

  const events: PitchCorrectionEvent[] = [];
  let currentEvent: PitchCorrectionEvent | null = null;

  for (const frame of frames) {
    if (!frame.frequency || frame.confidence < 0.3) {
      // Close current event
      if (currentEvent) {
        events.push(currentEvent);
        currentEvent = null;
      }
      continue;
    }

    const originalMidi = frequencyToMidi(frame.frequency);
    const targetMidi = snapToScale(originalMidi, options.rootNote, options.scale);
    const shiftAmount = (targetMidi - originalMidi) * options.amount;

    if (currentEvent && Math.abs(currentEvent.shiftSemitones - shiftAmount) < 0.5) {
      // Extend current event
      currentEvent.duration = frame.time - currentEvent.startTime + 0.01;
    } else {
      if (currentEvent) events.push(currentEvent);
      currentEvent = {
        startTime: frame.time,
        duration: 0.01,
        originalPitch: originalMidi,
        correctedPitch: originalMidi + shiftAmount,
        shiftSemitones: shiftAmount,
      };
    }
  }

  if (currentEvent) events.push(currentEvent);
  return events;
}

/**
 * Apply auto-tune correction to audio.
 * Processes each correction event by pitch-shifting the corresponding region.
 *
 * @param input   Input audio samples
 * @param options Auto-tune options
 * @returns       Pitch-corrected output
 */
export function applyAutoTune(
  input: Float32Array,
  options: AutoTuneOptions,
): Float32Array {
  const sampleRate = options.sampleRate ?? 48000;
  const events = analyzePitchCorrection(input, options);

  if (events.length === 0) return new Float32Array(input);

  const output = new Float32Array(input);

  for (const event of events) {
    if (Math.abs(event.shiftSemitones) < 0.01) continue;

    const startSample = Math.round(event.startTime * sampleRate);
    const endSample = Math.min(
      input.length,
      Math.round((event.startTime + event.duration) * sampleRate),
    );
    const segmentLen = endSample - startSample;
    if (segmentLen < 256) continue;

    // Extract segment
    const segment = input.subarray(startSample, endSample);

    // Apply gradual correction (retune speed)
    const correctedSegment = phaseVocoderPitchShift(
      segment,
      event.shiftSemitones,
      options.fftSize ?? 2048,
    );

    // Crossfade with smoothing for retune speed.
    // shiftSemitones is already scaled by amount, so use blend=1 with edge fades.
    const fadeLen = Math.min(Math.round(options.retuneSpeed * sampleRate / 1000), segmentLen / 4);
    for (let i = 0; i < correctedSegment.length && startSample + i < output.length; i++) {
      let blend = 1;
      // Fade in
      if (fadeLen > 0 && i < fadeLen) blend *= i / fadeLen;
      // Fade out
      if (fadeLen > 0 && i > correctedSegment.length - fadeLen) {
        blend *= (correctedSegment.length - i) / fadeLen;
      }
      output[startSample + i] = input[startSample + i] * (1 - blend) + correctedSegment[i] * blend;
    }
  }

  return output;
}

/**
 * Pitch shift with formant preservation.
 * Extracts spectral envelope, shifts pitch, then re-applies original envelope.
 *
 * @param input      Input samples
 * @param semitones  Pitch shift in semitones
 * @param fftSize    FFT size
 * @returns          Formant-preserved pitch-shifted output
 */
export function formantPreservingPitchShift(
  input: Float32Array,
  semitones: number,
  fftSize: number = 4096,
): Float32Array {
  fftSize = coercePow2(fftSize);
  if (Math.abs(semitones) < 0.01) return new Float32Array(input);
  if (input.length < fftSize) return new Float32Array(input);

  // First, do regular pitch shift
  const shifted = phaseVocoderPitchShift(input, semitones, fftSize);

  // Then apply formant correction via spectral envelope transfer
  const window = hannWindow(fftSize);
  const hop = fftSize / 4;
  const numFrames = Math.floor((input.length - fftSize) / hop) + 1;

  const output = new Float32Array(shifted.length);
  const winSum = new Float32Array(shifted.length);

  const origReal = new Float32Array(fftSize);
  const origImag = new Float32Array(fftSize);
  const shiftReal = new Float32Array(fftSize);
  const shiftImag = new Float32Array(fftSize);

  for (let frame = 0; frame < numFrames; frame++) {
    const offset = frame * hop;

    // Analyze original spectrum for envelope
    for (let i = 0; i < fftSize; i++) {
      const idx = offset + i;
      origReal[i] = idx < input.length ? input[idx] * window[i] : 0;
      origImag[i] = 0;
    }
    fft(origReal, origImag);

    // Analyze shifted spectrum
    for (let i = 0; i < fftSize; i++) {
      const idx = offset + i;
      shiftReal[i] = idx < shifted.length ? shifted[idx] * window[i] : 0;
      shiftImag[i] = 0;
    }
    fft(shiftReal, shiftImag);

    // Compute spectral envelopes (smoothed magnitudes)
    const halfN = fftSize / 2 + 1;
    const envSize = 32; // Smooth over 32 bins for envelope

    for (let k = 0; k < halfN; k++) {
      const origMag = Math.sqrt(origReal[k] * origReal[k] + origImag[k] * origImag[k]);
      const shiftMag = Math.sqrt(shiftReal[k] * shiftReal[k] + shiftImag[k] * shiftImag[k]);
      const shiftPhase = Math.atan2(shiftImag[k], shiftReal[k]);

      // Compute local spectral envelope ratio
      // Average magnitude in a window around this bin
      let origEnv = 0;
      let shiftEnv = 0;
      let count = 0;
      for (let j = Math.max(0, k - envSize); j < Math.min(halfN, k + envSize); j++) {
        origEnv += Math.sqrt(origReal[j] * origReal[j] + origImag[j] * origImag[j]);
        shiftEnv += Math.sqrt(shiftReal[j] * shiftReal[j] + shiftImag[j] * shiftImag[j]);
        count++;
      }
      origEnv /= count;
      shiftEnv /= count;

      // Apply envelope correction: scale shifted magnitude by envelope ratio
      const envelopeRatio = shiftEnv > 1e-10 ? origEnv / shiftEnv : 1;
      const correctedMag = shiftMag * envelopeRatio;

      shiftReal[k] = correctedMag * Math.cos(shiftPhase);
      shiftImag[k] = correctedMag * Math.sin(shiftPhase);
    }

    // Mirror
    for (let k = halfN; k < fftSize; k++) {
      shiftReal[k] = shiftReal[fftSize - k];
      shiftImag[k] = -shiftImag[fftSize - k];
    }

    ifft(shiftReal, shiftImag);

    // Overlap-add
    for (let i = 0; i < fftSize; i++) {
      const idx = offset + i;
      if (idx < output.length) {
        output[idx] += shiftReal[i] * window[i];
        winSum[idx] += window[i] * window[i];
      }
    }
  }

  for (let i = 0; i < output.length; i++) {
    if (winSum[i] > 1e-6) output[i] /= winSum[i];
  }

  return output;
}
