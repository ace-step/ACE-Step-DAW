/**
 * Pure TypeScript Constant-Q Transform (CQT) computation.
 * Matching consonance-ACE's CQTransform:
 *   sr=22050, hop=512, bins_per_octave=24, num_octaves=6, start_note=C1
 *   Output: absolute magnitude (not dB).
 *
 * Uses a direct DFT-based approach per CQT bin with pre-computed kernel frequencies.
 * This is slower than librosa's optimized implementation but correct and dependency-free.
 */

import { fft, hannWindow } from './melSpectrogram';

export interface CQTOptions {
  sampleRate: number;
  hopLength: number;
  binsPerOctave: number;
  numOctaves: number;
  /** MIDI-style start note frequency in Hz. C1 ≈ 32.70 Hz */
  fMin: number;
}

export const DEFAULT_CQT_OPTIONS: CQTOptions = {
  sampleRate: 22050,
  hopLength: 512,
  binsPerOctave: 24,
  numOctaves: 6,
  fMin: 32.7032, // C1
};

/** Consonance-ACE CQT preset. */
export const CONSONANCE_ACE_CQT_OPTIONS: CQTOptions = {
  sampleRate: 22050,
  hopLength: 512,
  binsPerOctave: 24,
  numOctaves: 6,
  fMin: 32.7032, // C1 = librosa.note_to_hz("C1")
};

/**
 * Compute a CQT-like spectrogram using the "pseudo-CQT" approach:
 * For each CQT bin, compute a windowed DFT at the target frequency
 * using an FFT large enough for the lowest frequency bin.
 *
 * Returns [nBins][nFrames] in absolute magnitude.
 */
export function computeCQT(
  samples: Float32Array,
  options: Partial<CQTOptions> = {},
): { data: Float32Array[]; nBins: number; nFrames: number } {
  const opts = { ...DEFAULT_CQT_OPTIONS, ...options };
  const { sampleRate, hopLength, binsPerOctave, numOctaves, fMin } = opts;
  const nBins = binsPerOctave * numOctaves; // 144

  // Compute center frequencies for each CQT bin
  const frequencies = new Float64Array(nBins);
  for (let k = 0; k < nBins; k++) {
    frequencies[k] = fMin * Math.pow(2, k / binsPerOctave);
  }

  // For each bin, compute the window length: N_k = ceil(Q * sr / f_k)
  // Q = 1 / (2^(1/binsPerOctave) - 1) for constant-Q
  const Q = 1 / (Math.pow(2, 1 / binsPerOctave) - 1);

  // Number of output frames
  const nFrames = Math.max(1, Math.floor((samples.length - 1) / hopLength) + 1);

  // Pre-compute bin data: for each bin, we'll use an FFT of the appropriate size
  // and pick the right frequency bin from the result.
  // For efficiency, group bins by FFT size (power of 2).
  const binResults: Float32Array[] = new Array(nBins);
  for (let k = 0; k < nBins; k++) {
    binResults[k] = new Float32Array(nFrames);
  }

  // Process each CQT bin
  for (let k = 0; k < nBins; k++) {
    const freq = frequencies[k];
    const windowLen = Math.ceil(Q * sampleRate / freq);

    // Round up to next power of 2 for FFT
    let fftSize = 1;
    while (fftSize < windowLen) fftSize *= 2;
    // Cap at reasonable size
    fftSize = Math.min(fftSize, 16384);

    const window = hannWindow(windowLen);

    // Which FFT bin corresponds to this CQT frequency?
    const targetBin = Math.round(freq * fftSize / sampleRate);

    for (let frame = 0; frame < nFrames; frame++) {
      const center = frame * hopLength;
      const start = center - Math.floor(windowLen / 2);

      const real = new Float32Array(fftSize);
      const imag = new Float32Array(fftSize);

      // Fill with windowed samples
      for (let j = 0; j < windowLen; j++) {
        const sampleIdx = start + j;
        if (sampleIdx >= 0 && sampleIdx < samples.length) {
          real[j] = samples[sampleIdx] * window[j];
        }
      }

      fft(real, imag);

      // Magnitude at the target frequency bin
      const binIdx = Math.min(targetBin, fftSize / 2);
      const mag = Math.sqrt(real[binIdx] * real[binIdx] + imag[binIdx] * imag[binIdx]);

      // Normalize by window length (matching librosa behavior)
      binResults[k][frame] = mag / windowLen;
    }
  }

  return { data: binResults, nBins, nFrames };
}

/**
 * Flatten CQT result to [1, 1, nBins, nFrames] Float32Array for ONNX input.
 * consonance-ACE expects shape [batch=1, channels=1, freq=144, time=T].
 */
export function cqtToOnnxInput(
  cqtData: Float32Array[],
  nBins: number,
  nFrames: number,
): Float32Array {
  const result = new Float32Array(nBins * nFrames);
  for (let b = 0; b < nBins; b++) {
    for (let f = 0; f < nFrames; f++) {
      result[b * nFrames + f] = cqtData[b][f];
    }
  }
  return result;
}
