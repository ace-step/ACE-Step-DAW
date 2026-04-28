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
  const regionLength = Math.max(0, regionEnd - startSample);
  if (numPeaks <= 0 || regionLength <= 0) return new Array(Math.max(0, numPeaks * 4)).fill(0);

  const peaks: number[] = new Array(numPeaks * 4);

  for (let i = 0; i < numPeaks; i++) {
    let lMax = 0;
    let lMin = 0;
    let rMax = 0;
    let rMin = 0;
    const start = startSample + Math.floor((i * regionLength) / numPeaks);
    const end = Math.min(
      regionEnd,
      Math.max(start + 1, startSample + Math.ceil(((i + 1) * regionLength) / numPeaks)),
    );
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

/**
 * Compute waveform with mipmap (async, runs in Web Worker via WASM).
 *
 * Side effect: stores a multi-level mipmap in IndexedDB for the given audioKey.
 * Returns legacy stride-4 peaks for backward compatibility with Clip.waveformPeaks.
 *
 * Falls back to synchronous computeWaveformPeaks if Worker is unavailable.
 */
export async function computeWaveformWithMipmap(
  audioKey: string,
  audioBuffer: AudioBuffer,
  numPeaks?: number,
): Promise<number[]> {
  const left = audioBuffer.getChannelData(0);
  const right = audioBuffer.numberOfChannels >= 2
    ? audioBuffer.getChannelData(1)
    : left;

  try {
    const { waveformMipmapService } = await import('../services/waveformMipmapService');
    return await waveformMipmapService.computeMipmap(audioKey, left, right, audioBuffer.sampleRate);
  } catch {
    // Fallback: synchronous computation (no mipmap stored)
    return computeWaveformPeaks(audioBuffer, numPeaks ?? Math.floor(left.length / 32));
  }
}
