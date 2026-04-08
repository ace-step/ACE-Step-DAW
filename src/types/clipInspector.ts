/**
 * Types for the Clip Inspector panel — audio metrics, tags, and metadata display.
 */

/** Audio quality metrics computed from a clip's audio buffer. */
export interface AudioMetrics {
  /** Integrated loudness in LUFS (ITU-R BS.1770-4). */
  lufs: number;
  /** True peak level in dBFS. */
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

/** A user-assigned tag on a clip for organization. */
export interface ClipTag {
  /** Unique tag identifier. */
  id: string;
  /** Display label (e.g. "verse", "favorite", "needs-work"). */
  label: string;
  /** Optional color for visual distinction. */
  color?: string;
}
