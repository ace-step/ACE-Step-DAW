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
   * `SlotHandle` + last-known mixer params. The handle may be `null`
   * while the `audio_add_track` IPC is in-flight — this sentinel
   * prevents double-allocation if `ensureTrack` is called twice
   * before the first invoke resolves. Found by codex review on
   * PR #1700.
   */
  private _trackEntries = new Map<string, {
    handle: NativeSlotHandle | null;
    params: NativeTrackParams;
  }>();

  // ── Lifecycle ─────────────────────────────────────────────────────

  async resume(): Promise<void> {
    await invoke('audio_start_engine', {
      config: { sampleRate: 48000, bufferSize: 256, deviceName: null },
    });
  }

  dispose(): void {
    invoke('audio_stop_engine').catch(() => {});
    this._trackEntries.clear();
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
    if (this._trackEntries.has(trackId)) return;
    // Insert a sentinel entry synchronously so a second ensureTrack
    // call before the IPC resolves sees it and returns early — codex
    // found that without this, two rapid calls would allocate two
    // native slots for the same logical track. PR #1700.
    const defaultParams: NativeTrackParams = {
      volume: 1,
      pan: 0,
      mute: false,
      solo: false,
    };
    this._trackEntries.set(trackId, { handle: null, params: defaultParams });
    invoke<NativeSlotHandle>('audio_add_track', { params: defaultParams })
      .then((handle) => {
        const entry = this._trackEntries.get(trackId);
        if (entry) {
          entry.handle = handle;
        }
        // If removeTrack was called while the IPC was in-flight, the
        // entry has already been deleted — send a compensating remove
        // so the native side doesn't leak the slot.
        if (!this._trackEntries.has(trackId)) {
          invoke('audio_remove_track', { handle }).catch(() => {});
        }
      })
      .catch(() => {
        // IPC failed — remove the sentinel so the caller can retry.
        this._trackEntries.delete(trackId);
      });
  }

  removeTrack(trackId: string): void {
    const entry = this._trackEntries.get(trackId);
    if (!entry) return;
    this._trackEntries.delete(trackId);
    // If the handle hasn't resolved yet (null), the then() handler
    // above will detect the missing entry and send a compensating
    // remove. If it has resolved, we remove immediately.
    if (entry.handle) {
      invoke('audio_remove_track', { handle: entry.handle }).catch(() => {});
    }
  }

  setTrackParams(trackId: string, params: TrackParams): void {
    const entry = this._trackEntries.get(trackId);
    if (!entry || !entry.handle) return;
    // Merge incoming partial params into the cached full state so
    // omitted fields preserve their existing values — codex found
    // that defaulting omitted fields to 1/0/false clobbers prior
    // user settings (e.g. `{ muted: true }` would reset volume to
    // 1.0 and pan to center). PR #1700.
    if (params.volume !== undefined) entry.params.volume = params.volume;
    if (params.pan !== undefined) entry.params.pan = params.pan;
    if (params.muted !== undefined) entry.params.mute = params.muted;
    if (params.soloed !== undefined) entry.params.solo = params.soloed;
    invoke('audio_set_track_params', {
      handle: entry.handle,
      params: entry.params,
    }).catch(() => {});
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
