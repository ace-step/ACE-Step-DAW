/**
 * filterResponse.ts — Pure math for biquad filter frequency response visualization.
 *
 * Computes magnitude response in dB for lowpass/highpass/bandpass filters
 * using the standard biquad transfer function evaluated on the unit circle.
 *
 * Reference: Audio EQ Cookbook (Robert Bristow-Johnson)
 */

export type FilterType = 'lowpass' | 'highpass' | 'bandpass';

const SAMPLE_RATE = 44100;
const TWO_PI = 2 * Math.PI;

/**
 * Compute biquad filter magnitude in dB at the given frequency.
 * @param freq       Evaluation frequency in Hz
 * @param cutoff     Filter cutoff frequency in Hz
 * @param Q          Resonance / quality factor
 * @param filterType Filter type
 */
export function filterMagnitudeDb(
  freq: number,
  cutoff: number,
  Q: number,
  filterType: FilterType,
): number {
  // Normalize cutoff to [0, 1] in terms of Nyquist
  const w0 = (TWO_PI * cutoff) / SAMPLE_RATE;
  const cosW0 = Math.cos(w0);
  const sinW0 = Math.sin(w0);
  const alpha = sinW0 / (2 * Math.max(Q, 0.1));

  // Biquad coefficients (b0, b1, b2, a0, a1, a2)
  let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;

  switch (filterType) {
    case 'lowpass':
      b0 = (1 - cosW0) / 2;
      b1 = 1 - cosW0;
      b2 = (1 - cosW0) / 2;
      a0 = 1 + alpha;
      a1 = -2 * cosW0;
      a2 = 1 - alpha;
      break;
    case 'highpass':
      b0 = (1 + cosW0) / 2;
      b1 = -(1 + cosW0);
      b2 = (1 + cosW0) / 2;
      a0 = 1 + alpha;
      a1 = -2 * cosW0;
      a2 = 1 - alpha;
      break;
    case 'bandpass':
      // BPF (peak gain = Q)
      b0 = sinW0 / 2;
      b1 = 0;
      b2 = -sinW0 / 2;
      a0 = 1 + alpha;
      a1 = -2 * cosW0;
      a2 = 1 - alpha;
      break;
  }

  // Normalize by a0
  const B0 = b0 / a0, B1 = b1 / a0, B2 = b2 / a0;
  const A1 = a1 / a0, A2 = a2 / a0;

  // Evaluate H(e^jw) where w = 2π * freq / sampleRate
  const w = (TWO_PI * freq) / SAMPLE_RATE;
  const cosW = Math.cos(w);
  const sinW = Math.sin(w);
  const cos2W = Math.cos(2 * w);
  const sin2W = Math.sin(2 * w);

  // H(z) = (B0 + B1*z^-1 + B2*z^-2) / (1 + A1*z^-1 + A2*z^-2)
  // At z = e^jw: z^-1 = e^-jw = cosW - j*sinW, z^-2 = cos2W - j*sin2W
  const numRe = B0 + B1 * cosW + B2 * cos2W;
  const numIm = -(B1 * sinW + B2 * sin2W);
  const denRe = 1 + A1 * cosW + A2 * cos2W;
  const denIm = -(A1 * sinW + A2 * sin2W);

  const numMag2 = numRe * numRe + numIm * numIm;
  const denMag2 = denRe * denRe + denIm * denIm;

  if (denMag2 < 1e-30) return -120;

  const magnitude = Math.sqrt(numMag2 / denMag2);
  return 20 * Math.log10(Math.max(magnitude, 1e-6));
}

export interface FilterResponsePoint {
  freq: number;  // Hz (log-spaced 20–20000)
  db: number;    // Magnitude in dB
}

/**
 * Generate frequency response curve on a log scale 20Hz–20kHz.
 */
export function generateFilterResponse(
  cutoff: number,
  Q: number,
  filterType: FilterType,
  steps: number = 120,
): FilterResponsePoint[] {
  const points: FilterResponsePoint[] = [];
  const logMin = Math.log10(20);
  const logMax = Math.log10(20000);

  for (let i = 0; i <= steps; i++) {
    const logF = logMin + ((logMax - logMin) * i) / steps;
    const freq = Math.pow(10, logF);
    const db = filterMagnitudeDb(freq, cutoff, Q, filterType);
    points.push({ freq, db: Math.max(-60, Math.min(24, db)) });
  }

  return points;
}
