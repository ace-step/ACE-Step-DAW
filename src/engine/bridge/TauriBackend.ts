/**
 * TauriBackend — delegates audio operations to the Rust engine via Tauri IPC.
 *
 * Phase 2B-1d: track management and master volume are now wired to
 * the real Rust audio engine. The backend maintains an internal
 * `trackId → SlotHandle` map to bridge the AudioBridge's string-based
 * track IDs to the native engine's slot-generation handles.
 *
 * Remaining stubs (metering, clip scheduling, transport callbacks)
 * will be fleshed out in Phase 2B-2, Phase 3, etc.
 *
 * Until the full Rust engine is ready, the WebAudioBackend is the
 * default in browser mode.
 */
import { invoke } from '@tauri-apps/api/core';
import type {
  AudioBridge,
  BridgeClipInfo,
  MasterMeterData,
  MeterData,
  NativeSlotHandle,
  NativeTrackParams,
  TrackParams,
} from './types';
import type { MasteringState } from '../../types/project';

const ZERO_METER: MeterData = { level: -Infinity, leftLevel: -Infinity, rightLevel: -Infinity, clipped: false };
const ZERO_MASTER: MasterMeterData = { level: -Infinity, clipped: false };

export class TauriBackend implements AudioBridge {
  readonly backend = 'tauri' as const;
  readonly sampleRate = 48000;

  private _timeUpdateCb: ((time: number) => void) | null = null;
  private _onEndedCb: (() => void) | null = null;

  /**
   * Maps the AudioBridge's string `trackId` to the native engine's
   * `SlotHandle`. Populated by `ensureTrack`, consumed by
   * `removeTrack` / `setTrackParams`.
   */
  private _trackHandles = new Map<string, NativeSlotHandle>();

  // ── Lifecycle ─────────────────────────────────────────────────────

  async resume(): Promise<void> {
    await invoke('audio_start_engine', {
      config: { sampleRate: 48000, bufferSize: 256, deviceName: null },
    });
  }

  dispose(): void {
    invoke('audio_stop_engine').catch(() => {});
    this._trackHandles.clear();
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
    if (this._trackHandles.has(trackId)) return;
    // Fire-and-forget: the bridge interface is synchronous but the
    // IPC is async. We store a pending promise result in the map
    // once it resolves.
    const defaultParams: NativeTrackParams = {
      volume: 1,
      pan: 0,
      mute: false,
      solo: false,
    };
    invoke<NativeSlotHandle>('audio_add_track', { params: defaultParams })
      .then((handle) => {
        this._trackHandles.set(trackId, handle);
      })
      .catch(() => {});
  }

  removeTrack(trackId: string): void {
    const handle = this._trackHandles.get(trackId);
    if (!handle) return;
    this._trackHandles.delete(trackId);
    invoke('audio_remove_track', { handle }).catch(() => {});
  }

  setTrackParams(trackId: string, params: TrackParams): void {
    const handle = this._trackHandles.get(trackId);
    if (!handle) return;
    // Extract only the fields the Rust mixer supports (volume,
    // pan, mute, solo). Effect parameters (EQ, compressor, reverb)
    // will be forwarded once the effect chain lands in 2B-3.
    const nativeParams: NativeTrackParams = {
      volume: params.volume ?? 1,
      pan: params.pan ?? 0,
      mute: params.muted ?? false,
      solo: params.soloed ?? false,
    };
    invoke('audio_set_track_params', { handle, params: nativeParams }).catch(() => {});
  }

  setTrackGroupRouting(trackId: string, groupId: string | null): void {
    // Group routing will be wired in Phase 2B-4 (send/return).
    void trackId;
    void groupId;
  }

  updateSoloState(): void {
    // Solo state is resolved per-buffer inside the audio callback
    // via `AudioGraph::any_solo()`. No explicit command needed — the
    // individual `setTrackParams` calls with `solo: true/false`
    // already propagate through the command queue.
  }

  // ── Metering ──────────────────────────────────────────────────────

  getTrackMeter(_trackId: string): MeterData {
    return ZERO_METER;
  }

  getTrackLevel(_trackId: string): number {
    return -Infinity;
  }

  resetTrackClip(_trackId: string): void {
    // Will be wired in Phase 2B-2 (metering)
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

  resetMasterClip(_stage: 'input' | 'output'): void {
    // Will be wired in Phase 2B-2 (metering)
  }

  getMasterSpectrum(): Float32Array {
    return new Float32Array(0);
  }

  // ── Master ────────────────────────────────────────────────────────

  getMasterVolume(): number {
    return 1;
  }

  setMasterVolume(volume: number): void {
    invoke('audio_set_master_volume', { volume }).catch(() => {});
  }

  applyMastering(_mastering: MasteringState | null | undefined): void {
    // Will invoke Rust command when effect chain lands (2B-3)
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
    // Will invoke Rust command in Phase 3
  }

  // ── Audio Data ────────────────────────────────────────────────────

  async decodeAudioData(_blob: Blob): Promise<AudioBuffer> {
    // Rust backend will decode audio natively in Phase 2C
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
