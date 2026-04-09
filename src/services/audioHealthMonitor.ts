/**
 * Audio Engine Health Monitor
 *
 * Captures real-time performance metrics from the Web Audio API,
 * detects buffer underruns (xruns), and enumerates I/O devices.
 */

import type {
  AudioHealthSnapshot,
  AudioHealthStatus,
  AudioDeviceInfo,
} from '../types/audioHealth';

// ── Types ──────────────────────────────────────────────────────────────────────

/** Minimal interface for the audio engine properties we read. */
interface AudioEngineLike {
  ctx: {
    state: string;
    sampleRate: number;
    currentTime: number;
    baseLatency?: number;
    outputLatency?: number;
  };
  getMasterMeter(stage: 'output'): { level: number; clipped: boolean };
}

/** Mutable state for xrun detection between calls. */
export interface XrunDetector {
  lastContextTime: number;
  lastWallTime: number;
  xrunCount: number;
}

// ── Constants ──────────────────────────────────────────────────────────────────

/** Load threshold above which we report a warning (0–1 scale). */
const LOAD_WARNING_THRESHOLD = 0.8;

/** Total latency threshold (ms) above which we report a warning. */
const LATENCY_WARNING_MS = 100;

/** Xrun count threshold for error status. */
const XRUN_ERROR_THRESHOLD = 3;

/** Minimum drift in ms between wall-clock and context-time to count as xrun. */
const XRUN_DRIFT_THRESHOLD_MS = 50;

// ── Snapshot Capture ───────────────────────────────────────────────────────────

/**
 * Capture a point-in-time health snapshot from the audio engine.
 * Safe to call from any thread — reads only from the engine and AudioContext.
 */
export function captureHealthSnapshot(engine: AudioEngineLike): AudioHealthSnapshot {
  const { ctx } = engine;
  const meter = engine.getMasterMeter('output');

  const baseLatencyMs =
    typeof ctx.baseLatency === 'number' ? ctx.baseLatency * 1000 : null;
  const outputLatencyMs =
    typeof ctx.outputLatency === 'number' ? ctx.outputLatency * 1000 : null;
  const totalLatencyMs =
    baseLatencyMs !== null && outputLatencyMs !== null
      ? baseLatencyMs + outputLatencyMs
      : null;

  return {
    contextState: ctx.state as AudioHealthSnapshot['contextState'],
    sampleRate: ctx.sampleRate,
    baseLatencyMs,
    outputLatencyMs,
    totalLatencyMs,
    currentTime: ctx.currentTime,
    masterLevelDb: meter.level,
    masterClipping: meter.clipped,
    estimatedLoad: null, // Populated externally by polling loop
    timestamp: Date.now(),
  };
}

// ── Health Status Derivation ───────────────────────────────────────────────────

/**
 * Derive an overall health status from the latest snapshot and counters.
 */
export function deriveHealthStatus(
  snapshot: AudioHealthSnapshot,
  recentClipCount: number,
  xrunCount: number,
): AudioHealthStatus {
  if (snapshot.contextState === 'closed') return 'error';
  if (snapshot.contextState === 'suspended') return 'inactive';

  // Error conditions
  if (xrunCount >= XRUN_ERROR_THRESHOLD) return 'error';

  // Warning conditions
  if (snapshot.masterClipping && recentClipCount > 0) return 'warning';
  if (snapshot.estimatedLoad !== null && snapshot.estimatedLoad >= LOAD_WARNING_THRESHOLD) return 'warning';
  if (snapshot.totalLatencyMs !== null && snapshot.totalLatencyMs >= LATENCY_WARNING_MS) return 'warning';

  return 'good';
}

// ── Xrun Detection ─────────────────────────────────────────────────────────────

/**
 * Detect buffer underruns by comparing wall-clock progression to AudioContext time.
 * Call this at a regular interval (e.g., every 100ms).
 *
 * Returns true if an xrun was detected on this call.
 */
export function detectXrun(
  detector: XrunDetector,
  contextTime: number,
  wallTimeMs: number,
): boolean {
  if (detector.lastWallTime === 0) {
    // First call — initialize baseline
    detector.lastContextTime = contextTime;
    detector.lastWallTime = wallTimeMs;
    return false;
  }

  const wallDeltaMs = wallTimeMs - detector.lastWallTime;
  const contextDeltaMs = (contextTime - detector.lastContextTime) * 1000;

  // Update baseline
  detector.lastContextTime = contextTime;
  detector.lastWallTime = wallTimeMs;

  // If wall time advanced significantly more than context time, it's an xrun
  if (wallDeltaMs > 0 && wallDeltaMs - contextDeltaMs > XRUN_DRIFT_THRESHOLD_MS) {
    detector.xrunCount += 1;
    return true;
  }

  return false;
}

// ── Device Enumeration ─────────────────────────────────────────────────────────

/**
 * Enumerate available audio input/output devices.
 * Returns an empty array if the MediaDevices API is unavailable.
 */
export async function enumerateAudioDevices(): Promise<AudioDeviceInfo[]> {
  if (
    typeof navigator === 'undefined' ||
    !navigator.mediaDevices ||
    typeof navigator.mediaDevices.enumerateDevices !== 'function'
  ) {
    return [];
  }

  const devices = await navigator.mediaDevices.enumerateDevices();

  return devices
    .filter((d): d is MediaDeviceInfo & { kind: 'audioinput' | 'audiooutput' } =>
      d.kind === 'audioinput' || d.kind === 'audiooutput',
    )
    .map((d) => ({
      deviceId: d.deviceId,
      label: d.label || `${d.kind === 'audioinput' ? 'Input' : 'Output'} ${d.deviceId.slice(0, 6)}`,
      kind: d.kind,
      isDefault: d.deviceId === 'default',
    }));
}
