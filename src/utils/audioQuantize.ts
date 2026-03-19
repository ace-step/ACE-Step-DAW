/**
 * Audio quantize utilities — transient detection and warp marker computation.
 * Provides the core algorithms for aligning audio transients to a beat grid
 * (similar to Logic Pro's Flex Time quantize).
 */

/** A warp marker maps an original transient time to its quantized grid position. */
export interface WarpMarker {
  /** Original transient position in seconds (relative to clip start). */
  originalTime: number;
  /** Quantized position snapped to the beat grid in seconds. */
  quantizedTime: number;
}

export interface TransientDetectionOptions {
  /** Minimum energy threshold for onset detection (0–1). Default 0.1. */
  sensitivity?: number;
  /** Minimum gap between consecutive transients in milliseconds. Default 50. */
  minGapMs?: number;
  /** Window size in samples for energy computation. Default 512. */
  windowSize?: number;
}

/**
 * Detect transient onsets in audio peak data using energy-based onset detection.
 *
 * Computes short-term energy in sliding windows and flags positions where
 * the energy rises sharply above the preceding window (spectral flux style).
 *
 * @param peaks - Raw audio samples or peak data (Float32Array)
 * @param sampleRate - Sample rate of the audio data
 * @param options - Detection tuning parameters
 * @returns Array of transient positions in seconds
 */
export function detectTransients(
  peaks: Float32Array,
  sampleRate: number,
  options: TransientDetectionOptions = {},
): number[] {
  const {
    sensitivity = 0.1,
    minGapMs = 50,
    windowSize = 512,
  } = options;

  if (peaks.length === 0) return [];

  const minGapSamples = Math.floor((minGapMs / 1000) * sampleRate);
  const transients: number[] = [];
  let lastTransientSample = -minGapSamples; // allow first transient

  // Compute energy for a window starting at `start`
  function windowEnergy(start: number, size: number): number {
    let sum = 0;
    const end = Math.min(start + size, peaks.length);
    for (let i = start; i < end; i++) {
      sum += peaks[i] * peaks[i];
    }
    return sum / size;
  }

  // Slide through the audio in half-window steps
  const step = Math.floor(windowSize / 2);
  let prevEnergy = 0;

  for (let pos = 0; pos < peaks.length - windowSize; pos += step) {
    const energy = windowEnergy(pos, windowSize);
    const rise = energy - prevEnergy;

    // Onset: energy rises above threshold squared (since we compare energy, not amplitude)
    if (rise > sensitivity * sensitivity && energy > sensitivity * sensitivity) {
      if (pos - lastTransientSample >= minGapSamples) {
        transients.push(pos / sampleRate);
        lastTransientSample = pos;
      }
    }

    prevEnergy = energy;
  }

  return transients;
}

/**
 * Compute warp markers that map transient positions to the nearest beat grid positions.
 *
 * @param transients - Transient positions in seconds (relative to clip start)
 * @param bpm - Tempo in beats per minute
 * @param gridDivision - Grid size in beats (1 = quarter note, 0.5 = 8th, 0.25 = 16th)
 * @param strength - Quantize strength 0–1 (0 = no change, 1 = full snap)
 * @returns Array of warp markers for transients that need adjustment
 */
export function computeWarpMarkers(
  transients: number[],
  bpm: number,
  gridDivision: number = 1,
  strength: number = 1.0,
): WarpMarker[] {
  if (transients.length === 0 || bpm <= 0 || gridDivision <= 0) return [];

  const beatDuration = 60 / bpm;
  const gridSize = beatDuration * gridDivision;
  // Tolerance: if a transient is within this threshold of the grid, skip it
  const tolerance = gridSize * 0.01; // 1% of grid size

  const markers: WarpMarker[] = [];

  for (const t of transients) {
    const nearestGrid = Math.round(t / gridSize) * gridSize;
    const diff = nearestGrid - t;

    if (Math.abs(diff) < tolerance) continue; // already on grid

    const quantizedTime = t + diff * Math.max(0, Math.min(1, strength));
    markers.push({ originalTime: t, quantizedTime });
  }

  return markers;
}
