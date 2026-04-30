/**
 * AudioBridge type definitions.
 *
 * These interfaces decouple the React UI from the concrete audio backend.
 * In browser mode the bridge delegates to WebAudioBackend (AudioEngine + Tone.js).
 * In desktop mode it delegates to TauriBackend (IPC → Rust audio engine).
 */
import type { MasteringState } from '../../types/project';
import type {
  AudioWarpMarker,
  GainEnvelopePoint,
  StretchMode,
} from '../../types/project';

// ── Metering ────────────────────────────────────────────────────────

export interface MeterData {
  level: number;
  leftLevel: number;
  rightLevel: number;
  clipped: boolean;
}

export interface MasterMeterData {
  level: number;
  clipped: boolean;
}

// ── Clip Scheduling ─────────────────────────────────────────────────

export interface BridgeClipInfo {
  clipId: string;
  trackId: string;
  startTime: number;
  buffer: AudioBuffer;
  audioOffset: number;
  clipDuration: number;
  fadeInDuration?: number;
  fadeOutDuration?: number;
  fadeInCurve?: 'linear' | 'exponential' | 'equal-power';
  fadeOutCurve?: 'linear' | 'exponential' | 'equal-power';
  fadeInCurvePoint?: { x: number; y: number };
  fadeOutCurvePoint?: { x: number; y: number };
  timeStretchRate?: number;
  pitchShift?: number;
  gainEnvelope?: GainEnvelopePoint[];
  warpMarkers?: AudioWarpMarker[];
  stretchMode?: StretchMode;
}

// ── Track Parameters ────────────────────────────────────────────────

export interface TrackParams {
  volume?: number;
  pan?: number;
  muted?: boolean;
  soloed?: boolean;
  eqLowGain?: number;
  eqMidGain?: number;
  eqHighGain?: number;
  compressorEnabled?: boolean;
  compressorThreshold?: number;
  compressorRatio?: number;
  reverbMix?: number;
  reverbRoomSize?: number;
}

// ── Audio Bridge Interface ──────────────────────────────────────────

export type AudioBridgeBackend = 'web-audio' | 'tauri';

export interface AudioBridge {
  /** Identifies the backend. */
  readonly backend: AudioBridgeBackend;

  // ── Lifecycle ───────────────────────────────────────────────────
  /** Resume the audio context (required after user gesture). */
  resume(): Promise<void>;
  /** Clean up all resources. */
  dispose(): void;

  // ── Transport ───────────────────────────────────────────────────
  getCurrentTime(): number;
  getLookAhead(): number;
  getCompensatedTime(): number;
  setPlaybackLatencyCompensation(seconds: number): void;
  getPlaybackLatencyCompensation(): number;

  // ── Track Management ────────────────────────────────────────────
  ensureTrack(trackId: string): void;
  removeTrack(trackId: string): void;
  setTrackParams(trackId: string, params: TrackParams): void;
  setTrackGroupRouting(trackId: string, groupId: string | null): void;
  updateSoloState(): void;

  // ── Metering ────────────────────────────────────────────────────
  getTrackMeter(trackId: string): MeterData;
  getTrackLevel(trackId: string): number;
  resetTrackClip(trackId: string): void;
  getTrackSpectrum(trackId: string): Float32Array | null;

  getMasterMeter(stage: 'input' | 'output'): MasterMeterData;
  getMasterLevel(stage: 'input' | 'output'): number;
  resetMasterClip(stage: 'input' | 'output'): void;
  getMasterSpectrum(): Float32Array;

  // ── Master ──────────────────────────────────────────────────────
  getMasterVolume(): number;
  setMasterVolume(volume: number): void;
  applyMastering(mastering: MasteringState | null | undefined): void;

  // ── Clip Scheduling ─────────────────────────────────────────────
  schedulePlayback(clips: BridgeClipInfo[], fromTime: number, totalDuration: number): void;
  pauseAllSources(): void;
  stopAllSources(): void;

  // ── Audio Data ──────────────────────────────────────────────────
  decodeAudioData(blob: Blob): Promise<AudioBuffer>;
  getAudioStream(): MediaStream;
  disposeAudioStream(): void;

  // ── Callbacks ───────────────────────────────────────────────────
  setTimeUpdateCallback(cb: (time: number) => void): void;
  setOnEndedCallback(cb: () => void): void;

  // ── Sample Rate ─────────────────────────────────────────────────
  readonly sampleRate: number;
}

// ── Native Audio Engine (Tauri / Phase 2A) ──────────────────────────
//
// These types mirror the Rust `EngineConfig` / `AudioDeviceInfo` /
// `EngineStatus` structs in `src-tauri/src/engine/config.rs`. The
// serde `rename_all = "camelCase"` attribute on the Rust side guarantees
// the JSON wire format matches these field names exactly.
//
// Only the TypeScript types are added in Phase 2A — no calls are wired
// into `TauriBackend` yet. That wiring lands in Phase 2B alongside the
// processing graph and metering work.

export const VALID_SAMPLE_RATES: readonly number[] = [44100, 48000, 96000];
export const VALID_BUFFER_SIZES: readonly number[] = [32, 64, 128, 256, 512, 1024];

export type ValidSampleRate = 44100 | 48000 | 96000;
export type ValidBufferSize = 32 | 64 | 128 | 256 | 512 | 1024;

export interface NativeEngineConfig {
  sampleRate: ValidSampleRate;
  bufferSize: ValidBufferSize;
  /** `null` / omitted means "system default output device". */
  deviceName?: string | null;
}

export interface NativeAudioDeviceInfo {
  name: string;
  isDefault: boolean;
  maxChannels: number;
  supportedSampleRates: number[];
  /** `[min, max]` in frames, or `null` if the driver did not report. */
  bufferSizeRange: [number, number] | null;
}

export type NativeEngineStatus =
  | { state: 'stopped' }
  | {
      state: 'running';
      activeConfig: NativeEngineConfig;
      deviceName: string;
      channels: number;
    };

/**
 * Shape of Rust `EngineError` when surfaced through Tauri `invoke`. Serde
 * serializes it as `{ kind: "alreadyRunning" | "config" | "open" | "openTimeout", message?: ... }`.
 */
export type NativeEngineError =
  | { kind: 'alreadyRunning' }
  | { kind: 'config'; message: { kind: 'invalidSampleRate' | 'invalidBufferSize'; message: number } }
  | { kind: 'open'; message: string }
  | { kind: 'openTimeout'; message: { secs: number; nanos: number } };

// ── Track management (Tauri / Phase 2B-1d) ──────────────────────────

/**
 * Opaque handle to a track slot in the native audio engine. Returned
 * by `audio_add_track` and passed back to `audio_remove_track` /
 * `audio_set_track_params`. Contains a slot index + generation counter
 * so stale handles from a previous owner are silently rejected by the
 * audio thread.
 */
export interface NativeSlotHandle {
  slot: number;
  generation: number;
}

/**
 * Per-track parameters for the native mixer. Mirrors Rust `TrackParams`
 * with serde `camelCase` field names.
 */
export interface NativeTrackParams {
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
}

/**
 * Shape of Rust `CommandError` when surfaced through Tauri `invoke`.
 */
export type NativeCommandError =
  | { kind: 'notRunning' }
  | { kind: 'queueFull'; message: number }
  | { kind: 'disconnected' }
  | { kind: 'slotAllocatorFull'; message: number };

export interface NativeMeterReading {
  rms: number;
  peak: number;
  clipped: boolean;
}

export interface NativeClipSource {
  startSample: number;
  lengthSamples: number;
  gain: number;
  audioData: number[];
}
