/**
 * Zero-crossing detection utilities for click-free audio editing.
 *
 * When splitting or trimming audio clips, snapping edit points to the nearest
 * zero crossing prevents audible clicks caused by discontinuities in the waveform.
 */

/**
 * Find the nearest zero crossing to a target sample index.
 *
 * A zero crossing occurs when consecutive samples change sign (positive → negative
 * or vice versa). At a crossing, this function returns the sample whose absolute
 * value is smaller (i.e., closer to zero) to minimize the discontinuity.
 *
 * If no crossing is found within the search radius, the original target index is returned.
 *
 * @param samples - Raw audio sample data (mono channel, Float32Array)
 * @param targetIndex - The sample index to search around
 * @param searchRadius - Maximum number of samples to search in each direction
 * @returns The sample index of the nearest zero crossing, or targetIndex if none found
 */
export function findNearestZeroCrossing(
  samples: Float32Array,
  targetIndex: number,
  searchRadius: number,
): number {
  if (samples.length < 2) return targetIndex;

  const target = Math.max(0, Math.min(targetIndex, samples.length - 1));
  const lo = Math.max(0, target - searchRadius);
  const hi = Math.min(samples.length - 1, target + searchRadius);

  // If the target sample is exactly zero, return it immediately
  if (samples[target] === 0) return target;

  let bestIndex = -1;
  let bestDistance = Infinity;

  for (let i = lo; i < hi; i++) {
    const a = samples[i];
    const b = samples[i + 1];

    // Check for sign change (zero crossing) or exact zero
    if (a === 0) {
      const dist = Math.abs(i - target);
      if (dist < bestDistance) {
        bestDistance = dist;
        bestIndex = i;
      }
      continue;
    }

    if ((a > 0 && b < 0) || (a < 0 && b > 0)) {
      // Pick the sample closer to zero
      const idx = Math.abs(a) <= Math.abs(b) ? i : i + 1;
      const dist = Math.abs(idx - target);
      if (dist < bestDistance) {
        bestDistance = dist;
        bestIndex = idx;
      }
    }
  }

  return bestIndex >= 0 ? bestIndex : target;
}

/**
 * Snap a time position (in seconds) to the nearest zero crossing in the audio data.
 *
 * @param samples - Raw audio sample data (mono channel, Float32Array)
 * @param sampleRate - Sample rate of the audio (e.g. 44100)
 * @param timeSeconds - The target time in seconds
 * @param searchRadiusMs - How far to search in each direction, in milliseconds (default 5ms)
 * @returns The snapped time in seconds, or the original time if no crossing found
 */
export function snapTimeToZeroCrossing(
  samples: Float32Array,
  sampleRate: number,
  timeSeconds: number,
  searchRadiusMs: number = 5,
): number {
  if (samples.length === 0) return timeSeconds;

  const targetSample = Math.round(timeSeconds * sampleRate);
  const radiusSamples = Math.round((searchRadiusMs / 1000) * sampleRate);

  const snappedSample = findNearestZeroCrossing(samples, targetSample, radiusSamples);
  return snappedSample / sampleRate;
}
