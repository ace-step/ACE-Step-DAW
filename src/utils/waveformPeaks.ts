/**
 * Compute waveform peaks from an AudioBuffer for dual-channel display.
 *
 * Returns interleaved stereo min/max peaks:
 *   [Lmax0, Lmin0, Rmax0, Rmin0, Lmax1, Lmin1, Rmax1, Rmin1, ...]
 * Length = 4 * numPeaks.
 *
 * Lmax/Rmax are the positive peak (>= 0), Lmin/Rmin are the negative peak (<= 0).
 * For mono audio, left and right values are identical.
 */
export function computeWaveformPeaks(
  audioBuffer: AudioBuffer,
  numPeaks: number,
  startSample: number = 0,
  endSample?: number,
): number[] {
  const leftData = audioBuffer.getChannelData(0);
  const rightData = audioBuffer.numberOfChannels >= 2
    ? audioBuffer.getChannelData(1)
    : leftData;

  const regionEnd = endSample ?? leftData.length;
  const regionLength = regionEnd - startSample;
  const samplesPerPeak = Math.floor(regionLength / numPeaks);
  if (samplesPerPeak <= 0) return new Array(numPeaks * 4).fill(0);

  const peaks: number[] = new Array(numPeaks * 4);

  for (let i = 0; i < numPeaks; i++) {
    let lMax = 0;
    let lMin = 0;
    let rMax = 0;
    let rMin = 0;
    const start = startSample + i * samplesPerPeak;
    const end = Math.min(start + samplesPerPeak, regionEnd);
    for (let j = start; j < end; j++) {
      const lSample = leftData[j];
      if (lSample > lMax) lMax = lSample;
      if (lSample < lMin) lMin = lSample;
      const rSample = rightData[j];
      if (rSample > rMax) rMax = rSample;
      if (rSample < rMin) rMin = rSample;
    }
    const idx = i * 4;
    peaks[idx] = lMax;
    peaks[idx + 1] = lMin;
    peaks[idx + 2] = rMax;
    peaks[idx + 3] = rMin;
  }

  return peaks;
}

/** Number of values stored per logical peak (Lmax, Lmin, Rmax, Rmin). */
export const PEAK_STRIDE = 4;
