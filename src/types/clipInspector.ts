/**
 * Types for the Clip Inspector panel — audio metrics and metadata display.
 */

/** Audio quality metrics computed from a clip's audio buffer. */
export interface AudioMetrics {
  /** Integrated loudness estimate in LUFS (simplified, without K-weighting). */
  lufs: number;
  /** Sample peak level in dBFS. */
  peakDb: number;
  /** Dynamic range in dB (difference between loud and quiet sections). */
  dynamicRangeDb: number;
  /** RMS level in dBFS. */
  rmsDb: number;
  /** Duration in seconds. */
  durationSeconds: number;
  /** Sample rate in Hz. */
  sampleRate: number;
  /** Number of audio channels. */
  channelCount: number;
}
