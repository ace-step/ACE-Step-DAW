/**
 * Pure TypeScript mel spectrogram computation.
 * No external dependencies — suitable for use in Web Workers.
 *
 * Supports two log-scaling modes:
 * - 'db': 10 * log10(mel)  — standard dB scale
 * - 'log1p': log1p(multiplier * mel) — used by Beat This!
 */

export interface MelSpectrogramOptions {
  sampleRate: number;
  nFft: number;
  hopLength: number;
  nMels: number;
  fMin: number;
  fMax: number;
  /** 'power' (default, |X|²) or 'magnitude' (|X|, power=1). Beat This! uses magnitude. */
  power: 1 | 2;
  /** Log scaling: 'db' (default) or 'log1p'. */
  logScale: 'db' | 'log1p';
  /** Multiplier for log1p mode. Beat This! uses 1000. */
  log1pMultiplier: number;
  /** Normalize by nFft (torchaudio normalized="frame_length"). Beat This! does NOT use this. */
  normalizeByNfft: boolean;
}

export const DEFAULT_MEL_OPTIONS: MelSpectrogramOptions = {
  sampleRate: 22050,
  nFft: 2048,
  hopLength: 441,   // ~20ms at 22050Hz
  nMels: 128,
  fMin: 30,
  fMax: 11000,
  power: 2,
  logScale: 'db',
  log1pMultiplier: 1000,
  normalizeByNfft: false,
};

/**
 * Beat This! mel spectrogram preset.
 * Matches: n_fft=1024, hop=441, f_min=30, f_max=11000, power=1,
 *          mel_scale=slaney, normalized=frame_length,
 *          output = log1p(1000 * mel)
 */
export const BEAT_THIS_MEL_OPTIONS: Partial<MelSpectrogramOptions> = {
  sampleRate: 22050,
  nFft: 1024,
  hopLength: 441,
  nMels: 128,
  fMin: 30,
  fMax: 11000,
  power: 1,
  logScale: 'log1p',
  log1pMultiplier: 1000,
  normalizeByNfft: false,
};

// ---------- FFT ----------

/**
 * In-place radix-2 Cooley–Tukey FFT.
 * `real` and `imag` must have length equal to a power of 2.
 */
export function fft(real: Float32Array, imag: Float32Array): void {
  const n = real.length;
  if (n <= 1) return;

  // Bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    while (j & bit) {
      j ^= bit;
      bit >>= 1;
    }
    j ^= bit;
    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
      [imag[i], imag[j]] = [imag[j], imag[i]];
    }
  }

  // FFT butterfly
  for (let len = 2; len <= n; len *= 2) {
    const halfLen = len / 2;
    const angle = (-2 * Math.PI) / len;
    const wReal = Math.cos(angle);
    const wImag = Math.sin(angle);

    for (let i = 0; i < n; i += len) {
      let curReal = 1;
      let curImag = 0;
      for (let j = 0; j < halfLen; j++) {
        const evenIdx = i + j;
        const oddIdx = i + j + halfLen;
        const tReal = curReal * real[oddIdx] - curImag * imag[oddIdx];
        const tImag = curReal * imag[oddIdx] + curImag * real[oddIdx];
        real[oddIdx] = real[evenIdx] - tReal;
        imag[oddIdx] = imag[evenIdx] - tImag;
        real[evenIdx] += tReal;
        imag[evenIdx] += tImag;
        const newCurReal = curReal * wReal - curImag * wImag;
        curImag = curReal * wImag + curImag * wReal;
        curReal = newCurReal;
      }
    }
  }
}

// ---------- Mel filterbank ----------

function hzToMel(hz: number): number {
  return 2595 * Math.log10(1 + hz / 700);
}

function melToHz(mel: number): number {
  return 700 * (Math.pow(10, mel / 2595) - 1);
}

/**
 * Create a mel filterbank matrix.
 * Returns `nMels` arrays, each of length `nFft / 2 + 1`.
 */
export function createMelFilterbank(
  nFft: number,
  nMels: number,
  sampleRate: number,
  fMin: number,
  fMax: number,
): Float32Array[] {
  const nBins = nFft / 2 + 1;
  const melMin = hzToMel(fMin);
  const melMax = hzToMel(fMax);

  // nMels + 2 equally spaced mel points
  const melPoints = new Float32Array(nMels + 2);
  for (let i = 0; i < nMels + 2; i++) {
    melPoints[i] = melMin + (i * (melMax - melMin)) / (nMels + 1);
  }

  // Convert to Hz then to FFT bin indices
  const binIndices = new Float32Array(nMels + 2);
  for (let i = 0; i < nMels + 2; i++) {
    binIndices[i] = Math.floor(((nFft + 1) * melToHz(melPoints[i])) / sampleRate);
  }

  const filters: Float32Array[] = [];
  for (let m = 0; m < nMels; m++) {
    const filter = new Float32Array(nBins);
    const left = binIndices[m];
    const center = binIndices[m + 1];
    const right = binIndices[m + 2];

    for (let k = Math.floor(left); k < Math.ceil(center); k++) {
      if (k >= 0 && k < nBins && center !== left) {
        filter[k] = (k - left) / (center - left);
      }
    }
    for (let k = Math.floor(center); k < Math.ceil(right); k++) {
      if (k >= 0 && k < nBins && right !== center) {
        filter[k] = (right - k) / (right - center);
      }
    }
    filters.push(filter);
  }

  return filters;
}

// ---------- Hann window ----------

export function hannWindow(size: number): Float32Array {
  const window = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
  }
  return window;
}

// ---------- Spectrogram ----------

/**
 * Compute STFT power spectrogram (|X|²).
 * Returns array of frames, each of length `nFft / 2 + 1`.
 */
export function powerSpectrogram(
  samples: Float32Array,
  nFft: number,
  hopLength: number,
): Float32Array[] {
  const nBins = nFft / 2 + 1;
  const window = hannWindow(nFft);
  const nFrames = Math.max(0, Math.floor((samples.length - nFft) / hopLength) + 1);
  const frames: Float32Array[] = [];

  for (let i = 0; i < nFrames; i++) {
    const offset = i * hopLength;
    const real = new Float32Array(nFft);
    const imag = new Float32Array(nFft);

    for (let j = 0; j < nFft; j++) {
      real[j] = (samples[offset + j] ?? 0) * window[j];
    }

    fft(real, imag);

    const power = new Float32Array(nBins);
    for (let k = 0; k < nBins; k++) {
      power[k] = real[k] * real[k] + imag[k] * imag[k];
    }
    frames.push(power);
  }

  return frames;
}

/**
 * Compute STFT magnitude spectrogram (|X|, power=1).
 * Returns array of frames, each of length `nFft / 2 + 1`.
 */
export function magnitudeSpectrogram(
  samples: Float32Array,
  nFft: number,
  hopLength: number,
): Float32Array[] {
  const nBins = nFft / 2 + 1;
  const window = hannWindow(nFft);
  const nFrames = Math.max(0, Math.floor((samples.length - nFft) / hopLength) + 1);
  const frames: Float32Array[] = [];

  for (let i = 0; i < nFrames; i++) {
    const offset = i * hopLength;
    const real = new Float32Array(nFft);
    const imag = new Float32Array(nFft);

    for (let j = 0; j < nFft; j++) {
      real[j] = (samples[offset + j] ?? 0) * window[j];
    }

    fft(real, imag);

    const mag = new Float32Array(nBins);
    for (let k = 0; k < nBins; k++) {
      mag[k] = Math.sqrt(real[k] * real[k] + imag[k] * imag[k]);
    }
    frames.push(mag);
  }

  return frames;
}

// ---------- Mel spectrogram ----------

/**
 * Compute a mel spectrogram from raw audio samples.
 * Returns a 2D array: `[nFrames][nMels]`.
 *
 * Log scaling depends on `logScale` option:
 * - 'db': 10 * log10(max(val, 1e-10))
 * - 'log1p': log1p(multiplier * val)  — used by Beat This!
 */
export function computeMelSpectrogram(
  samples: Float32Array,
  options: Partial<MelSpectrogramOptions> = {},
): Float32Array[] {
  const opts = { ...DEFAULT_MEL_OPTIONS, ...options };
  const { nFft, hopLength, nMels, sampleRate, fMin, fMax, power, logScale, log1pMultiplier } = opts;

  const filters = createMelFilterbank(nFft, nMels, sampleRate, fMin, fMax);

  // Compute spectrogram based on power setting
  const specFrames = power === 1
    ? magnitudeSpectrogram(samples, nFft, hopLength)
    : powerSpectrogram(samples, nFft, hopLength);
  const nBins = nFft / 2 + 1;

  const melFrames: Float32Array[] = [];
  for (const frame of specFrames) {
    const melFrame = new Float32Array(nMels);
    for (let m = 0; m < nMels; m++) {
      let sum = 0;
      const filter = filters[m];
      for (let k = 0; k < nBins; k++) {
        sum += filter[k] * frame[k];
      }

      if (logScale === 'log1p') {
        melFrame[m] = Math.log1p(log1pMultiplier * sum);
      } else {
        // dB scale
        melFrame[m] = 10 * Math.log10(Math.max(sum, 1e-10));
      }
    }
    melFrames.push(melFrame);
  }

  return melFrames;
}

// ---------- Downsampling ----------

/**
 * Downsample an AudioBuffer to mono at the target sample rate.
 * Uses simple linear interpolation.
 */
export function downsampleToMono(
  audioBuffer: AudioBuffer,
  targetSampleRate: number,
): Float32Array {
  // Mix to mono
  const nChannels = audioBuffer.numberOfChannels;
  const length = audioBuffer.length;
  const mono = new Float32Array(length);
  for (let ch = 0; ch < nChannels; ch++) {
    const channelData = audioBuffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      mono[i] += channelData[i];
    }
  }
  if (nChannels > 1) {
    for (let i = 0; i < length; i++) {
      mono[i] /= nChannels;
    }
  }

  // Resample if needed
  const sourceSR = audioBuffer.sampleRate;
  if (sourceSR === targetSampleRate) return mono;

  const ratio = sourceSR / targetSampleRate;
  const outLength = Math.floor(length / ratio);
  const output = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const srcIdx = i * ratio;
    const idx0 = Math.floor(srcIdx);
    const idx1 = Math.min(idx0 + 1, length - 1);
    const frac = srcIdx - idx0;
    output[i] = mono[idx0] * (1 - frac) + mono[idx1] * frac;
  }

  return output;
}
