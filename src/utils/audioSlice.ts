/**
 * Audio slice detection — find transient positions in an audio buffer
 * using amplitude-based onset detection.
 *
 * The algorithm computes the short-term energy difference (spectral flux)
 * over a hop window. When energy rises above the threshold, a transient
 * onset is recorded, subject to the minimum slice length constraint.
 */

/**
 * Detect transient slice points in an audio buffer.
 *
 * @param audioBuffer — The audio buffer to analyze (uses first channel).
 * @param threshold  — Amplitude threshold (0–1). Energy increases above
 *                     this fraction of the peak are flagged as onsets.
 * @param minSliceLength — Minimum distance in samples between two slice
 *                         points (prevents closely-spaced false positives).
 * @returns Sorted array of sample positions where transients were detected.
 */
export function detectSlicePoints(
  audioBuffer: AudioBuffer,
  threshold: number,
  minSliceLength: number,
): number[] {
  const data = audioBuffer.getChannelData(0);
  const length = data.length;
  if (length === 0) return [];

  // Analysis window size: ~512 samples (~11ms at 44100 Hz).
  // Hop by half the window for overlap.
  const windowSize = 512;
  const hopSize = windowSize / 2;

  // Compute RMS energy for each analysis frame.
  const numFrames = Math.floor((length - windowSize) / hopSize) + 1;
  if (numFrames <= 1) return [];

  const energy = new Float32Array(numFrames);
  for (let f = 0; f < numFrames; f++) {
    const start = f * hopSize;
    let sum = 0;
    for (let i = start; i < start + windowSize && i < length; i++) {
      sum += data[i] * data[i];
    }
    energy[f] = Math.sqrt(sum / windowSize);
  }

  // Compute energy flux (positive differences only — onsets).
  const flux = new Float32Array(numFrames);
  for (let f = 1; f < numFrames; f++) {
    const diff = energy[f] - energy[f - 1];
    flux[f] = diff > 0 ? diff : 0;
  }

  // Scale the user threshold by peak flux so it works as a relative sensitivity.
  const peakFlux = flux.reduce((max, v) => (v > max ? v : max), 0);
  if (peakFlux === 0) return [];

  const absoluteThreshold = threshold * peakFlux;

  // Pick peaks in flux that exceed the threshold.
  const slicePoints: number[] = [];
  let lastSliceSample = -minSliceLength; // allow first point at position 0+

  for (let f = 1; f < numFrames - 1; f++) {
    if (
      flux[f] > absoluteThreshold &&
      flux[f] >= flux[f - 1] &&
      flux[f] >= flux[f + 1]
    ) {
      const samplePos = f * hopSize;
      if (samplePos - lastSliceSample >= minSliceLength) {
        slicePoints.push(samplePos);
        lastSliceSample = samplePos;
      }
    }
  }

  return slicePoints;
}
