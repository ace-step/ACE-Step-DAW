/**
 * Pure spectral DSP utilities — FFT, IFFT, windowing, and spectral operations.
 * All functions are stateless and testable without Web Audio context.
 *
 * @see https://github.com/ace-step/ACE-Step-DAW/issues/963
 */

// ─── Window Functions ─────────────────────────────────────────────────────────

/** Generate a Hann window of the given size. */
export function hannWindow(size: number): Float32Array {
  const window = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
  }
  return window;
}

// ─── FFT / IFFT (Radix-2 Cooley–Tukey) ───────────────────────────────────────

/**
 * In-place radix-2 FFT.
 * @param real  Real part (length must be power of 2)
 * @param imag  Imaginary part (same length)
 */
export function fft(real: Float32Array, imag: Float32Array): void {
  const n = real.length;
  if (n <= 1) return;

  // Bit-reversal permutation
  let j = 0;
  for (let i = 0; i < n - 1; i++) {
    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
      [imag[i], imag[j]] = [imag[j], imag[i]];
    }
    let m = n >> 1;
    while (m >= 1 && j >= m) {
      j -= m;
      m >>= 1;
    }
    j += m;
  }

  // Butterfly stages
  for (let size = 2; size <= n; size <<= 1) {
    const halfSize = size >> 1;
    const angle = (-2 * Math.PI) / size;
    const wReal = Math.cos(angle);
    const wImag = Math.sin(angle);

    for (let i = 0; i < n; i += size) {
      let curReal = 1;
      let curImag = 0;

      for (let k = 0; k < halfSize; k++) {
        const evenIdx = i + k;
        const oddIdx = i + k + halfSize;

        const tReal = curReal * real[oddIdx] - curImag * imag[oddIdx];
        const tImag = curReal * imag[oddIdx] + curImag * real[oddIdx];

        real[oddIdx] = real[evenIdx] - tReal;
        imag[oddIdx] = imag[evenIdx] - tImag;
        real[evenIdx] += tReal;
        imag[evenIdx] += tImag;

        const nextReal = curReal * wReal - curImag * wImag;
        curImag = curReal * wImag + curImag * wReal;
        curReal = nextReal;
      }
    }
  }
}

/**
 * In-place inverse FFT. Scales output by 1/N.
 */
export function ifft(real: Float32Array, imag: Float32Array): void {
  const n = real.length;
  // Conjugate
  for (let i = 0; i < n; i++) {
    imag[i] = -imag[i];
  }
  fft(real, imag);
  // Conjugate and scale
  for (let i = 0; i < n; i++) {
    real[i] /= n;
    imag[i] = -imag[i] / n;
  }
}

// ─── Spectral Operations ──────────────────────────────────────────────────────

/** Convert complex bins to magnitude/phase arrays. */
export function toMagnitudePhase(
  real: Float32Array,
  imag: Float32Array,
  magnitude: Float32Array,
  phase: Float32Array,
): void {
  for (let i = 0; i < real.length; i++) {
    magnitude[i] = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
    phase[i] = Math.atan2(imag[i], real[i]);
  }
}

/** Convert magnitude/phase back to complex bins. */
export function fromMagnitudePhase(
  magnitude: Float32Array,
  phase: Float32Array,
  real: Float32Array,
  imag: Float32Array,
): void {
  for (let i = 0; i < magnitude.length; i++) {
    real[i] = magnitude[i] * Math.cos(phase[i]);
    imag[i] = magnitude[i] * Math.sin(phase[i]);
  }
}

/**
 * Spectral freeze: replaces the current magnitude with a frozen snapshot,
 * keeping the phase from the current frame for naturalness.
 */
export function spectralFreeze(
  magnitude: Float32Array,
  frozenMagnitude: Float32Array,
  mix: number,
): void {
  for (let i = 0; i < magnitude.length; i++) {
    magnitude[i] = magnitude[i] * (1 - mix) + frozenMagnitude[i] * mix;
  }
}

/**
 * Spectral blur: exponential moving average of magnitudes over time.
 * `accumulator` is mutated in place and holds the running average.
 * `decay` controls smoothing (0 = no blur, 1 = full hold).
 */
export function spectralBlur(
  magnitude: Float32Array,
  accumulator: Float32Array,
  decay: number,
): void {
  for (let i = 0; i < magnitude.length; i++) {
    accumulator[i] = accumulator[i] * decay + magnitude[i] * (1 - decay);
    magnitude[i] = accumulator[i];
  }
}

/**
 * Spectral filter: multiply magnitudes by a spectral mask.
 * `mask` is a Float32Array of gains (0–1) with one value per bin.
 * When mask is shorter than magnitudes, it's linearly interpolated.
 */
export function spectralFilter(
  magnitude: Float32Array,
  mask: Float32Array,
): void {
  const n = magnitude.length;
  const maskLen = mask.length;

  if (maskLen === n) {
    for (let i = 0; i < n; i++) {
      magnitude[i] *= mask[i];
    }
    return;
  }

  // Linear interpolation when mask has fewer bands
  for (let i = 0; i < n; i++) {
    const pos = (i / n) * maskLen;
    const lo = Math.floor(pos);
    const hi = Math.min(lo + 1, maskLen - 1);
    const t = pos - lo;
    const gain = mask[lo] * (1 - t) + mask[hi] * t;
    magnitude[i] *= gain;
  }
}

/**
 * Spectral morph: blend between current magnitude and a reference magnitude.
 * `amount` = 0 means original, 1 means fully reference.
 */
export function spectralMorph(
  magnitude: Float32Array,
  referenceMagnitude: Float32Array,
  amount: number,
): void {
  for (let i = 0; i < magnitude.length; i++) {
    magnitude[i] = magnitude[i] * (1 - amount) + referenceMagnitude[i] * amount;
  }
}
