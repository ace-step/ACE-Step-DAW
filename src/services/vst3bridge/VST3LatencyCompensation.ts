/**
 * Plugin Delay Compensation (PDC) for VST3 plugins.
 *
 * VST3 plugins introduce processing latency that must be compensated
 * so all tracks stay in sync during playback. This class calculates
 * the required delay for each track based on plugin chain latencies.
 */
export class VST3LatencyCompensation {
  /**
   * Calculate required delay compensation for each track.
   *
   * The track with the highest total plugin latency gets 0 delay;
   * all other tracks get compensating delay equal to
   * (maxLatency - trackLatency).
   *
   * @param tracks - Array of tracks with their plugin latency values (in samples).
   * @param _sampleRate - The audio context sample rate (reserved for future use).
   * @returns A map of trackId to delaySamples.
   */
  static calculateCompensation(
    tracks: { id: string; pluginLatencies: number[] }[],
    _sampleRate: number,
  ): Map<string, number> {
    const result = new Map<string, number>();
    if (tracks.length === 0) return result;

    // Sum latency per track
    const trackLatencies = tracks.map((t) => ({
      id: t.id,
      total: VST3LatencyCompensation.getChainLatency(t.pluginLatencies),
    }));

    // Find the maximum latency across all tracks
    const maxLatency = Math.max(...trackLatencies.map((t) => t.total));

    // Each track's compensation = maxLatency - its own latency
    for (const t of trackLatencies) {
      result.set(t.id, maxLatency - t.total);
    }

    return result;
  }

  /**
   * Get total latency for a single plugin chain (in samples).
   *
   * @param pluginLatencies - Array of latency values (samples) for each plugin in the chain.
   * @returns The sum of all plugin latencies.
   */
  static getChainLatency(pluginLatencies: number[]): number {
    let total = 0;
    for (const latency of pluginLatencies) {
      total += latency;
    }
    return total;
  }

  /**
   * Convert a sample count to milliseconds.
   *
   * @param samples - Number of samples.
   * @param sampleRate - Audio context sample rate (e.g. 44100, 48000).
   * @returns Duration in milliseconds.
   */
  static samplesToMs(samples: number, sampleRate: number): number {
    return (samples / sampleRate) * 1000;
  }
}
