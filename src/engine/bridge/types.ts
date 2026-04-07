/**
 * AudioBridge type definitions.
 *
 * These interfaces decouple the React UI from the concrete audio backend.
 * In browser mode the bridge delegates to WebAudioBackend (AudioEngine + Tone.js).
 * In desktop mode it delegates to TauriBackend (IPC → Rust audio engine).
 */
import type { MasteringState } from '../../types/project';

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
  timeStretchRate?: number;
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

export interface AudioBridge {
  /** Identifies the backend: 'web-audio' | 'tauri' */
  readonly backend: string;

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
