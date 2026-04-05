/**
 * timeStretch.ts — Professional time-stretch engine.
 *
 * Implements two core algorithms:
 * 1. Phase Vocoder (STFT-based) — for polyphonic material
 * 2. WSOLA (Waveform Similarity Overlap-Add) — for monophonic/speech
 *
 * Plus material-aware modes:
 * - beats:      Transient slicing → time-domain reassembly
 * - tones:      WSOLA for monophonic sources
 * - complex:    Basic phase vocoder with per-bin phase propagation
 * - complexPro: Phase vocoder + transient preservation
 * - texture:    Granular synthesis for ambient/pad material
 *
 * All algorithms work offline (not real-time) on AudioBuffer data.
 */

import { fft } from './melSpectrogram';

export type TimeStretchMode = 'beats' | 'tones' | 'complex' | 'complexPro' | 'texture';

export interface TimeStretchOptions {
  mode: TimeStretchMode;
  /** Stretch ratio: >1 = slower, <1 = faster. 1 = no change. */
  ratio: number;
  /** FFT size for phase vocoder modes (default: 4096, must be power of 2) */
  fftSize?: number;
  /** Sample rate (default: 48000) */
  sampleRate?: number;
}

// ─── Hann Window ──────────────────────────────────────────────────────────────

function hannWindow(size: number): Float32Array {
  const w = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
  }
  return w;
}

// ─── Inverse FFT ──────────────────────────────────────────────────────────────

function ifft(real: Float32Array, imag: Float32Array): void {
  const n = real.length;
  // Conjugate
  for (let i = 0; i < n; i++) imag[i] = -imag[i];
  fft(real, imag);
  // Conjugate and scale
  for (let i = 0; i < n; i++) {
    real[i] /= n;
    imag[i] = -imag[i] / n;
  }
}

// ─── Phase Vocoder ────────────────────────────────────────────────────────────

/**
 * Phase vocoder time-stretch for a single channel.
 * Uses STFT analysis → phase propagation → STFT synthesis.
 *
 * @param input   Input samples
 * @param ratio   Time-stretch ratio (>1 = longer/slower)
 * @param fftSize FFT window size
 * @param hopA    Analysis hop size
 * @returns       Time-stretched output samples
 */
export function phaseVocoderStretch(
  input: Float32Array,
  ratio: number,
  fftSize: number = 4096,
  hopA?: number,
): Float32Array {
  const analysisHop = hopA ?? Math.floor(fftSize / 4);
  const synthesisHop = Math.round(analysisHop * ratio);
  const window = hannWindow(fftSize);
  const halfFFT = fftSize / 2 + 1;

  // Number of analysis frames
  const numFrames = Math.floor((input.length - fftSize) / analysisHop) + 1;
  if (numFrames < 2) return new Float32Array(input);

  // Output buffer
  const outputLen = Math.ceil((numFrames - 1) * synthesisHop + fftSize);
  const output = new Float32Array(outputLen);
  const windowSum = new Float32Array(outputLen);

  // Phase accumulator for synthesis
  const prevAnalysisPhase = new Float32Array(halfFFT);
  const prevSynthesisPhase = new Float32Array(halfFFT);
  const expectedPhaseAdvance = new Float32Array(halfFFT);

  // Pre-compute expected phase advance per bin
  for (let k = 0; k < halfFFT; k++) {
    expectedPhaseAdvance[k] = (2 * Math.PI * k * analysisHop) / fftSize;
  }

  // Temporary buffers for FFT
  const fftReal = new Float32Array(fftSize);
  const fftImag = new Float32Array(fftSize);

  for (let frame = 0; frame < numFrames; frame++) {
    const inputOffset = frame * analysisHop;
    const outputOffset = frame * synthesisHop;

    // Window the input frame
    for (let i = 0; i < fftSize; i++) {
      const idx = inputOffset + i;
      fftReal[i] = idx < input.length ? input[idx] * window[i] : 0;
      fftImag[i] = 0;
    }

    // Forward FFT
    fft(fftReal, fftImag);

    // Phase vocoder processing for positive frequencies
    for (let k = 0; k < halfFFT; k++) {
      const mag = Math.sqrt(fftReal[k] * fftReal[k] + fftImag[k] * fftImag[k]);
      const phase = Math.atan2(fftImag[k], fftReal[k]);

      if (frame === 0) {
        // First frame: initialize phase directly (no difference to compute)
        prevSynthesisPhase[k] = phase;
      } else {
        // Phase difference from previous frame
        let phaseDiff = phase - prevAnalysisPhase[k] - expectedPhaseAdvance[k];
        // Wrap to [-π, π]
        phaseDiff -= 2 * Math.PI * Math.round(phaseDiff / (2 * Math.PI));
        // True frequency deviation
        const trueFreq = expectedPhaseAdvance[k] + phaseDiff;
        // Propagate phase for synthesis
        prevSynthesisPhase[k] += trueFreq * (synthesisHop / analysisHop);
      }
      prevAnalysisPhase[k] = phase;

      // Reconstruct with new phase
      fftReal[k] = mag * Math.cos(prevSynthesisPhase[k]);
      fftImag[k] = mag * Math.sin(prevSynthesisPhase[k]);
    }

    // Mirror negative frequencies
    for (let k = halfFFT; k < fftSize; k++) {
      fftReal[k] = fftReal[fftSize - k];
      fftImag[k] = -fftImag[fftSize - k];
    }

    // Inverse FFT
    ifft(fftReal, fftImag);

    // Overlap-add to output
    for (let i = 0; i < fftSize; i++) {
      const outIdx = outputOffset + i;
      if (outIdx < outputLen) {
        output[outIdx] += fftReal[i] * window[i];
        windowSum[outIdx] += window[i] * window[i];
      }
    }
  }

  // Normalize by window sum
  for (let i = 0; i < outputLen; i++) {
    if (windowSum[i] > 1e-6) {
      output[i] /= windowSum[i];
    }
  }

  return output;
}

// ─── WSOLA ────────────────────────────────────────────────────────────────────

/**
 * WSOLA (Waveform Similarity Overlap-Add) time-stretch.
 * Better for monophonic/speech material than phase vocoder.
 *
 * @param input   Input samples
 * @param ratio   Time-stretch ratio (>1 = longer/slower)
 * @param windowSize Window size for overlap
 * @param tolerance  Search tolerance for best overlap position
 * @returns       Time-stretched output samples
 */
export function wsolaStretch(
  input: Float32Array,
  ratio: number,
  windowSize: number = 1024,
  tolerance: number = 256,
): Float32Array {
  const hop = Math.floor(windowSize / 2);
  const synthesisHop = hop;
  const analysisHop = Math.round(hop / ratio);

  const outputLen = Math.ceil(input.length * ratio);
  const output = new Float32Array(outputLen);

  const window = hannWindow(windowSize);
  let analysisPos = 0;
  let synthesisPos = 0;

  // Copy first window
  for (let i = 0; i < windowSize && i < input.length; i++) {
    output[i] = input[i] * window[i];
  }
  synthesisPos = synthesisHop;
  analysisPos = analysisHop;

  while (synthesisPos + windowSize < outputLen && analysisPos + windowSize < input.length) {
    // Find best overlap position within tolerance
    let bestOffset = 0;
    let bestCorr = -Infinity;

    const searchStart = Math.max(0, analysisPos - tolerance);
    const searchEnd = Math.min(input.length - windowSize, analysisPos + tolerance);

    for (let offset = searchStart; offset <= searchEnd; offset++) {
      // Cross-correlation with previous output
      let corr = 0;
      const overlapLen = Math.min(windowSize, outputLen - synthesisPos, input.length - offset);
      for (let i = 0; i < overlapLen; i += 4) { // Step by 4 for speed
        corr += input[offset + i] * output[synthesisPos + i];
      }
      if (corr > bestCorr) {
        bestCorr = corr;
        bestOffset = offset;
      }
    }

    // Overlap-add at best position
    for (let i = 0; i < windowSize; i++) {
      const srcIdx = bestOffset + i;
      const outIdx = synthesisPos + i;
      if (srcIdx < input.length && outIdx < outputLen) {
        output[outIdx] += input[srcIdx] * window[i];
      }
    }

    analysisPos = bestOffset + analysisHop;
    synthesisPos += synthesisHop;
  }

  return output;
}

// ─── Transient Detection (simplified for time-stretch) ────────────────────────

function detectTransientPositions(
  input: Float32Array,
  sampleRate: number,
  windowSize: number = 512,
): number[] {
  const positions: number[] = [];
  const hop = windowSize / 2;
  let prevEnergy = 0;
  const threshold = 0.15;
  const minGapSamples = sampleRate * 0.05; // 50ms minimum gap

  for (let pos = 0; pos + windowSize <= input.length; pos += hop) {
    let energy = 0;
    for (let i = 0; i < windowSize; i++) {
      energy += input[pos + i] * input[pos + i];
    }
    energy /= windowSize;

    const flux = energy - prevEnergy;
    if (flux > threshold && (positions.length === 0 || pos - positions[positions.length - 1] >= minGapSamples)) {
      positions.push(pos);
    }
    prevEnergy = energy;
  }

  return positions;
}

// ─── Beats Mode (Transient Slicing) ──────────────────────────────────────────

function beatsStretch(input: Float32Array, ratio: number, sampleRate: number): Float32Array {
  const transients = detectTransientPositions(input, sampleRate);

  if (transients.length < 2) {
    // Fallback to WSOLA
    return wsolaStretch(input, ratio);
  }

  // Add start and end markers
  const markers = [0, ...transients, input.length];
  const outputLen = Math.ceil(input.length * ratio);
  const output = new Float32Array(outputLen);

  // Place each slice at its time-stretched position
  for (let i = 0; i < markers.length - 1; i++) {
    const sliceStart = markers[i];
    const sliceEnd = markers[i + 1];
    const sliceLen = sliceEnd - sliceStart;

    const targetStart = Math.round(sliceStart * ratio);
    const targetEnd = Math.round(sliceEnd * ratio);
    const targetLen = targetEnd - targetStart;

    if (targetLen <= 0 || sliceLen <= 0) continue;

    // Overlap-add slice to target position with crossfades
    const copyLen = Math.min(sliceLen, targetLen);
    const fadeLen = Math.min(64, Math.floor(copyLen / 4));
    for (let j = 0; j < copyLen; j++) {
      const outIdx = targetStart + j;
      if (outIdx < outputLen && sliceStart + j < input.length) {
        let gain = 1;
        // Fade in at start of slice
        if (j < fadeLen) gain *= j / fadeLen;
        // Fade out at end of slice
        if (j > copyLen - fadeLen) gain *= (copyLen - j) / fadeLen;
        output[outIdx] += input[sliceStart + j] * gain;
      }
    }
  }

  return output;
}

// ─── Texture Mode (Granular) ──────────────────────────────────────────────────

function textureStretch(
  input: Float32Array,
  ratio: number,
  grainSize: number = 2048,
): Float32Array {
  const outputLen = Math.ceil(input.length * ratio);
  const output = new Float32Array(outputLen);
  const window = hannWindow(grainSize);
  const hop = Math.floor(grainSize / 4);

  // Simple granular: scatter grains from random positions
  let outPos = 0;
  let inPos = 0;

  // Use deterministic "random" based on position
  const seeded = (pos: number) => {
    const x = Math.sin(pos * 12.9898 + 78.233) * 43758.5453;
    return x - Math.floor(x);
  };

  while (outPos + grainSize < outputLen) {
    // Read position: advance at 1/ratio speed with slight jitter
    const jitter = (seeded(outPos) - 0.5) * grainSize * 0.3;
    const readPos = Math.max(0, Math.min(input.length - grainSize, Math.round(inPos + jitter)));

    for (let i = 0; i < grainSize; i++) {
      const srcIdx = readPos + i;
      const outIdx = outPos + i;
      if (srcIdx < input.length && outIdx < outputLen) {
        output[outIdx] += input[srcIdx] * window[i];
      }
    }

    outPos += hop;
    inPos += hop / ratio;
  }

  // Normalize peaks
  let maxAbs = 0;
  for (let i = 0; i < outputLen; i++) {
    const abs = Math.abs(output[i]);
    if (abs > maxAbs) maxAbs = abs;
  }
  if (maxAbs > 1) {
    for (let i = 0; i < outputLen; i++) {
      output[i] /= maxAbs;
    }
  }

  return output;
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

/**
 * Time-stretch audio with pitch preservation using the specified mode.
 *
 * @param input       Input audio samples (mono)
 * @param options     Stretch options (mode, ratio, fftSize, sampleRate)
 * @returns           Time-stretched output samples
 */
export function timeStretch(input: Float32Array, options: TimeStretchOptions): Float32Array {
  const { mode, sampleRate = 48000 } = options;

  // Validate and clamp ratio to prevent infinite loops / huge allocations
  const rawRatio = Number.isFinite(options.ratio) ? options.ratio : 1;
  const ratio = Math.max(0.25, Math.min(4, rawRatio));

  // Coerce fftSize to power of 2 (required by FFT)
  const rawFft = options.fftSize ?? 4096;
  const fftSize = 2 ** Math.round(Math.log2(Math.max(256, rawFft)));

  if (Math.abs(ratio - 1) < 0.001) return new Float32Array(input);
  if (input.length < 256) return new Float32Array(input);

  switch (mode) {
    case 'beats':
      return beatsStretch(input, ratio, sampleRate);

    case 'tones':
      return wsolaStretch(input, ratio, 1024, 256);

    case 'complex':
      return phaseVocoderStretch(input, ratio, fftSize);

    case 'complexPro': {
      // Phase vocoder with transient preservation:
      // Detect transients, process regions between them, reassemble
      const transients = detectTransientPositions(input, sampleRate);

      if (transients.length < 2) {
        return phaseVocoderStretch(input, ratio, fftSize);
      }

      const markers = [0, ...transients, input.length];
      const outputLen = Math.ceil(input.length * ratio);
      const output = new Float32Array(outputLen);

      for (let i = 0; i < markers.length - 1; i++) {
        const start = markers[i];
        const end = markers[i + 1];
        const segment = input.subarray(start, end);

        // Short transient segments: copy directly (preserve attack)
        const isTransient = end - start < sampleRate * 0.05; // <50ms
        const targetStart = Math.round(start * ratio);

        if (isTransient) {
          for (let j = 0; j < segment.length; j++) {
            const outIdx = targetStart + j;
            if (outIdx < outputLen) output[outIdx] = segment[j];
          }
        } else {
          // Stretch non-transient regions with phase vocoder
          const stretched = phaseVocoderStretch(segment, ratio, fftSize);
          const targetEnd = Math.round(end * ratio);
          const copyLen = Math.min(stretched.length, targetEnd - targetStart, outputLen - targetStart);
          for (let j = 0; j < copyLen; j++) {
            const outIdx = targetStart + j;
            if (outIdx < outputLen) output[outIdx] = stretched[j];
          }
        }
      }

      return output;
    }

    case 'texture':
      return textureStretch(input, ratio, Math.min(fftSize, 4096));

    default:
      return phaseVocoderStretch(input, ratio, fftSize);
  }
}

/**
 * Time-stretch stereo audio (process each channel independently).
 */
export function timeStretchStereo(
  left: Float32Array,
  right: Float32Array,
  options: TimeStretchOptions,
): { left: Float32Array; right: Float32Array } {
  return {
    left: timeStretch(left, options),
    right: timeStretch(right, options),
  };
}
