/**
 * Loudness metering utilities implementing BS.1770-4 K-weighting
 * for LUFS (Loudness Units relative to Full Scale) measurement.
 */

export function linearToDb(linear: number): number {
  if (linear <= 0) return -Infinity;
  return 20 * Math.log10(linear);
}

export function dbToLinear(db: number): number {
  return Math.pow(10, db / 20);
}

export function computeRMS(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i];
  }
  return Math.sqrt(sum / samples.length);
}

/** Biquad filter coefficients */
export interface BiquadCoefficients {
  b: [number, number, number]; // numerator
  a: [number, number, number]; // denominator (a[0] always 1)
}

export interface KWeightingCoeffs {
  stage1: BiquadCoefficients; // Pre-filter (high shelf boost)
  stage2: BiquadCoefficients; // RLB weighting (high-pass)
}

/**
 * Compute K-weighting filter coefficients for a given sample rate.
 * Stage 1: Pre-filter (shelving) — boosts high frequencies ~+4dB
 * Stage 2: RLB weighting — high-pass around 60Hz
 *
 * Coefficients derived from ITU-R BS.1770-4 specification.
 */
export function kWeightingCoefficients(sampleRate: number): KWeightingCoeffs {
  // Stage 1: Pre-filter (high shelf at ~1500 Hz, +4 dB)
  // These are the exact coefficients from the BS.1770-4 spec for 48kHz
  if (sampleRate === 48000) {
    return {
      stage1: {
        b: [1.53512485958697, -2.69169618940638, 1.19839281085285],
        a: [1.0, -1.69065929318241, 0.73248077421585],
      },
      stage2: {
        b: [1.0, -2.0, 1.0],
        a: [1.0, -1.99004745483398, 0.99007225036621],
      },
    };
  }

  // For other sample rates, use bilinear transform approximation
  // Stage 1: High shelf boost
  const f0_1 = 1681.974450955533;
  const G = 3.999843853973347; // dB
  const Q_1 = 0.7071752369554196;

  const K1 = Math.tan((Math.PI * f0_1) / sampleRate);
  const Vh = Math.pow(10, G / 20);
  const Vb = Math.pow(Vh, 0.4996667741545416);

  const a0_1 = 1.0 + K1 / Q_1 + K1 * K1;
  const b0_1 = (Vh + Vb * K1 / Q_1 + K1 * K1) / a0_1;
  const b1_1 = (2.0 * (K1 * K1 - Vh)) / a0_1;
  const b2_1 = (Vh - Vb * K1 / Q_1 + K1 * K1) / a0_1;
  const a1_1 = (2.0 * (K1 * K1 - 1.0)) / a0_1;
  const a2_1 = (1.0 - K1 / Q_1 + K1 * K1) / a0_1;

  // Stage 2: RLB weighting (high-pass)
  const f0_2 = 38.13547087602444;
  const Q_2 = 0.5003270373238773;

  const K2 = Math.tan((Math.PI * f0_2) / sampleRate);
  const a0_2 = 1.0 + K2 / Q_2 + K2 * K2;

  const b0_2 = 1.0 / a0_2;
  const b1_2 = -2.0 / a0_2;
  const b2_2 = 1.0 / a0_2;
  const a1_2 = (2.0 * (K2 * K2 - 1.0)) / a0_2;
  const a2_2 = (1.0 - K2 / Q_2 + K2 * K2) / a0_2;

  return {
    stage1: { b: [b0_1, b1_1, b2_1], a: [1.0, a1_1, a2_1] },
    stage2: { b: [b0_2, b1_2, b2_2], a: [1.0, a1_2, a2_2] },
  };
}

/** Apply a biquad filter (direct form II transposed) */
function applyBiquad(
  input: Float32Array,
  coeffs: BiquadCoefficients,
): Float32Array {
  const output = new Float32Array(input.length);
  const [b0, b1, b2] = coeffs.b;
  const [, a1, a2] = coeffs.a;
  let z1 = 0;
  let z2 = 0;

  for (let i = 0; i < input.length; i++) {
    const x = input[i];
    const y = b0 * x + z1;
    z1 = b1 * x - a1 * y + z2;
    z2 = b2 * x - a2 * y;
    output[i] = y;
  }

  return output;
}

/**
 * Apply K-weighting filter chain (stage1 then stage2) to audio samples.
 */
export function applyKWeighting(
  samples: Float32Array,
  coeffs: KWeightingCoeffs,
): Float32Array {
  const afterStage1 = applyBiquad(samples, coeffs.stage1);
  return applyBiquad(afterStage1, coeffs.stage2);
}

/**
 * Compute momentary loudness in LUFS from a mono audio buffer.
 * Uses K-weighting per BS.1770-4.
 *
 * @param samples - Audio samples (mono)
 * @param sampleRate - Sample rate in Hz
 * @returns Loudness in LUFS (-Infinity for silence)
 */
export function computeMomentaryLoudness(
  samples: Float32Array,
  sampleRate: number,
): number {
  if (samples.length === 0) return -Infinity;

  const coeffs = kWeightingCoefficients(sampleRate);
  const weighted = applyKWeighting(samples, coeffs);

  // Mean square
  let sumSquare = 0;
  for (let i = 0; i < weighted.length; i++) {
    sumSquare += weighted[i] * weighted[i];
  }
  const meanSquare = sumSquare / weighted.length;

  if (meanSquare <= 0) return -Infinity;

  // LUFS = -0.691 + 10 * log10(sum of channel mean squares)
  // For mono, the channel weight is 1.0
  return -0.691 + 10 * Math.log10(meanSquare);
}

/**
 * Map frequency in Hz to a pixel x-position on a logarithmic scale.
 */
export function freqToX(freq: number, width: number, minFreq = 20, maxFreq = 20000): number {
  const logMin = Math.log10(minFreq);
  const logMax = Math.log10(maxFreq);
  return ((Math.log10(freq) - logMin) / (logMax - logMin)) * width;
}

/**
 * Map a pixel x-position back to frequency (Hz) on a logarithmic scale.
 */
export function xToFreq(x: number, width: number, minFreq = 20, maxFreq = 20000): number {
  const logMin = Math.log10(minFreq);
  const logMax = Math.log10(maxFreq);
  return Math.pow(10, logMin + (x / width) * (logMax - logMin));
}

/**
 * Map a dB value to a y-position in pixels.
 */
export function dbToY(db: number, height: number, minDb = -90, maxDb = 0): number {
  const clamped = Math.max(minDb, Math.min(maxDb, db));
  return height * (1 - (clamped - minDb) / (maxDb - minDb));
}
