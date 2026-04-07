/**
 * TauriBackend — delegates audio operations to the Rust engine via Tauri IPC.
 *
 * This is a stub implementation for Phase 1. Methods are wired to
 * `invoke()` and `listen()` calls but the Rust handlers do not exist yet.
 * The backend will be fleshed out in Phase 2 (Rust audio engine core)
 * and Phase 3 (native transport + clip scheduling).
 *
 * Until the Rust engine is ready, the WebAudioBackend is used instead.
 */
import type {
  AudioBridge,
  BridgeClipInfo,
  MasterMeterData,
  MeterData,
  TrackParams,
} from './types';
import type { MasteringState } from '../../types/project';

// Placeholder — will use @tauri-apps/api/core when Rust handlers exist
async function invoke<T>(_cmd: string, _args?: Record<string, unknown>): Promise<T> {
  throw new Error('TauriBackend: Rust audio engine not yet implemented');
}

const ZERO_METER: MeterData = { level: -Infinity, leftLevel: -Infinity, rightLevel: -Infinity, clipped: false };
const ZERO_MASTER: MasterMeterData = { level: -Infinity, clipped: false };

export class TauriBackend implements AudioBridge {
  readonly backend = 'tauri' as const;
  readonly sampleRate = 48000;

  private _timeUpdateCb: ((time: number) => void) | null = null;
  private _onEndedCb: (() => void) | null = null;

  // ── Lifecycle ─────────────────────────────────────────────────────

  async resume(): Promise<void> {
    await invoke('audio_resume');
  }

  dispose(): void {
    invoke('audio_dispose').catch(() => {});
  }

  // ── Transport ─────────────────────────────────────────────────────

  getCurrentTime(): number {
    // In the Rust backend, time will be pushed via events.
    // For now return 0 as this backend is not yet active.
    return 0;
  }

  getLookAhead(): number {
    return 0.1;
  }

  getCompensatedTime(): number {
    return 0;
  }

  setPlaybackLatencyCompensation(_seconds: number): void {
    // Will invoke Rust command when implemented
  }

  getPlaybackLatencyCompensation(): number {
    return 0;
  }

  // ── Track Management ──────────────────────────────────────────────

  ensureTrack(trackId: string): void {
    invoke('track_ensure', { trackId }).catch(() => {});
  }

  removeTrack(trackId: string): void {
    invoke('track_remove', { trackId }).catch(() => {});
  }

  setTrackParams(trackId: string, params: TrackParams): void {
    invoke('track_set_params', { trackId, params }).catch(() => {});
  }

  setTrackGroupRouting(trackId: string, groupId: string | null): void {
    invoke('track_set_group', { trackId, groupId }).catch(() => {});
  }

  updateSoloState(): void {
    invoke('tracks_update_solo').catch(() => {});
  }

  // ── Metering ──────────────────────────────────────────────────────

  getTrackMeter(_trackId: string): MeterData {
    return ZERO_METER;
  }

  getTrackLevel(_trackId: string): number {
    return -Infinity;
  }

  resetTrackClip(trackId: string): void {
    invoke('track_reset_clip', { trackId }).catch(() => {});
  }

  getTrackSpectrum(_trackId: string): Float32Array | null {
    return null;
  }

  getMasterMeter(_stage: 'input' | 'output'): MasterMeterData {
    return ZERO_MASTER;
  }

  getMasterLevel(_stage: 'input' | 'output'): number {
    return -Infinity;
  }

  resetMasterClip(stage: 'input' | 'output'): void {
    invoke('master_reset_clip', { stage }).catch(() => {});
  }

  getMasterSpectrum(): Float32Array {
    return new Float32Array(0);
  }

  // ── Master ────────────────────────────────────────────────────────

  getMasterVolume(): number {
    return 1;
  }

  setMasterVolume(volume: number): void {
    invoke('master_set_volume', { volume }).catch(() => {});
  }

  applyMastering(mastering: MasteringState | null | undefined): void {
    invoke('master_apply_mastering', { mastering }).catch(() => {});
  }

  // ── Clip Scheduling ───────────────────────────────────────────────

  schedulePlayback(
    _clips: BridgeClipInfo[],
    _fromTime: number,
    _totalDuration: number,
  ): void {
    // Clip audio data will be sent as binary blobs in Phase 3
  }

  stopAllSources(): void {
    invoke('transport_stop_sources').catch(() => {});
  }

  // ── Audio Data ────────────────────────────────────────────────────

  async decodeAudioData(_blob: Blob): Promise<AudioBuffer> {
    // Rust backend will decode audio natively; for now throw
    throw new Error('TauriBackend: decodeAudioData not yet implemented');
  }

  getAudioStream(): MediaStream {
    throw new Error('TauriBackend: getAudioStream not available in desktop mode');
  }

  disposeAudioStream(): void {
    // No-op in desktop mode
  }

  // ── Callbacks ─────────────────────────────────────────────────────

  setTimeUpdateCallback(cb: (time: number) => void): void {
    this._timeUpdateCb = cb;
    // Will subscribe to Tauri event 'audio:time_update' in Phase 3
  }

  setOnEndedCallback(cb: () => void): void {
    this._onEndedCb = cb;
    // Will subscribe to Tauri event 'audio:playback_ended' in Phase 3
  }
}
