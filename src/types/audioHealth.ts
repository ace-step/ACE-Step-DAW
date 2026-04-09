/** Audio engine health monitoring types. */

/** Audio context lifecycle state. */
export type AudioContextState = 'suspended' | 'running' | 'closed';

/** Snapshot of audio engine health metrics captured at a point in time. */
export interface AudioHealthSnapshot {
  /** AudioContext state: suspended | running | closed */
  contextState: AudioContextState;
  /** Sample rate in Hz (e.g., 48000) */
  sampleRate: number;
  /** Base latency in ms (from AudioContext.baseLatency) */
  baseLatencyMs: number | null;
  /** Output latency in ms (from AudioContext.outputLatency) */
  outputLatencyMs: number | null;
  /** Total round-trip latency in ms */
  totalLatencyMs: number | null;
  /** Current time of AudioContext in seconds */
  currentTime: number;
  /** Master output level in dB */
  masterLevelDb: number;
  /** Whether master output is clipping */
  masterClipping: boolean;
  /** Estimated callback interval drift as CPU load indicator (0–1, null if unavailable) */
  estimatedLoad: number | null;
  /** Timestamp when this snapshot was taken */
  timestamp: number;
}

/** Aggregated health status derived from snapshots. */
export type AudioHealthStatus = 'good' | 'warning' | 'error' | 'inactive';

/** Audio I/O device info. */
export interface AudioDeviceInfo {
  deviceId: string;
  label: string;
  kind: 'audioinput' | 'audiooutput';
  isDefault: boolean;
}

/** Complete audio health state for the dashboard. */
export interface AudioHealthState {
  /** Latest metrics snapshot */
  snapshot: AudioHealthSnapshot | null;
  /** Derived overall health status */
  status: AudioHealthStatus;
  /** Available audio devices */
  devices: AudioDeviceInfo[];
  /** Whether device enumeration is supported */
  deviceEnumerationSupported: boolean;
  /** Number of clipping events detected in the last 10 seconds */
  recentClipCount: number;
  /** Xrun / buffer underrun count (estimated from timing gaps) */
  xrunCount: number;
}
