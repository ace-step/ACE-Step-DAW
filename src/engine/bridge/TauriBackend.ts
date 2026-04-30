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
import { listen } from '@tauri-apps/api/event';
import type {
  AudioBridge,
  BridgeClipInfo,
  MasterMeterData,
  MeterData,
  NativeClipSource,
  NativeMeterReading,
  NativeSlotHandle,
  NativeTrackParams,
  TrackParams,
} from './types';
import type { MasteringState } from '../../types/project';

const ZERO_METER: MeterData = { level: -Infinity, leftLevel: -Infinity, rightLevel: -Infinity, clipped: false };
const ZERO_MASTER: MasterMeterData = { level: -Infinity, clipped: false };
const TRANSPORT_POSITION_EVENT = 'transport-position';

function toMeterData(reading: NativeMeterReading): MeterData {
  const level = Number.isFinite(reading.peak) && reading.peak > 0 ? reading.peak : 0;
  return {
    level,
    leftLevel: level,
    rightLevel: level,
    clipped: reading.clipped,
  };
}

function toMasterMeterData(reading: NativeMeterReading): MasterMeterData {
  const level = Number.isFinite(reading.peak) && reading.peak > 0 ? reading.peak : 0;
  return {
    level,
    clipped: reading.clipped,
  };
}

function getPanGains(pan: number): { left: number; right: number } {
  const clamped = Math.max(-1, Math.min(1, Number.isFinite(pan) ? pan : 0));
  if (clamped < 0) return { left: 1, right: 1 + clamped };
  if (clamped > 0) return { left: 1 - clamped, right: 1 };
  return { left: 1, right: 1 };
}

function clipToNative(
  clip: BridgeClipInfo,
  sampleRate: number,
  trackParams: NativeTrackParams,
  anySoloed: boolean,
): NativeClipSource | null {
  if (trackParams.mute || (anySoloed && !trackParams.solo)) return null;
  const startSample = Math.max(0, Math.round(clip.startTime * sampleRate));
  const sourceRate = clip.buffer.sampleRate || sampleRate;
  const sourceStart = Math.max(0, Math.round(clip.audioOffset * sourceRate));
  const availableFrames = Math.max(0, clip.buffer.length - sourceStart);
  const sourceDuration = Math.min(Math.max(0, clip.clipDuration), availableFrames / sourceRate);
  if (sourceDuration <= 0) return null;
  const nativeFrames = Math.max(1, Math.round(sourceDuration * sampleRate));

  const left = clip.buffer.getChannelData(0);
  const right = clip.buffer.numberOfChannels > 1 ? clip.buffer.getChannelData(1) : left;
  const volume = Math.max(0, Math.min(1, Number.isFinite(trackParams.volume) ? trackParams.volume : 1));
  const pan = getPanGains(trackParams.pan);
  const lastSourceIndex = Math.max(sourceStart, clip.buffer.length - 1);
  const sampleAt = (channel: Float32Array, sourcePosition: number): number => {
    const clamped = Math.min(Math.max(sourceStart, sourcePosition), lastSourceIndex);
    const lower = Math.floor(clamped);
    const upper = Math.min(lastSourceIndex, lower + 1);
    const mix = clamped - lower;
    const lowerValue = channel[lower] ?? 0;
    const upperValue = channel[upper] ?? lowerValue;
    return lowerValue + (upperValue - lowerValue) * mix;
  };

  const audioData: number[] = new Array(nativeFrames * 2);
  for (let i = 0; i < nativeFrames; i++) {
    const sourcePosition = sourceStart + (i * sourceRate) / sampleRate;
    audioData[i * 2] = sampleAt(left, sourcePosition) * volume * pan.left;
    audioData[i * 2 + 1] = sampleAt(right, sourcePosition) * volume * pan.right;
  }

  return {
    startSample,
    lengthSamples: nativeFrames,
    gain: 1,
    audioData,
  };
}

export class TauriBackend implements AudioBridge {
  readonly backend = 'tauri' as const;
  readonly sampleRate = 48000;

  private _timeUpdateCb: ((time: number) => void) | null = null;
  private _onEndedCb: (() => void) | null = null;
  private _currentSamplePosition = 0;
  private _playbackLatencyCompensationSeconds = 0;
  private _scheduledEndSample: number | null = null;
  private _transportListenerStarted = false;
  private _transportUnlisten: (() => void) | null = null;
  private _decodeContext: AudioContext | null = null;
  private _trackMeters = new Map<string, MeterData>();
  private _masterMeter: MasterMeterData = ZERO_MASTER;
  private _transportCommandToken = 0;

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
    this.startTransportListener();
    this.refreshTransportPosition();
  }

  dispose(): void {
    if (this._transportUnlisten) {
      this._transportUnlisten();
      this._transportUnlisten = null;
    }
    this._transportListenerStarted = false;
    invoke('audio_stop_engine').catch(() => {});
    this._trackEntries.clear();
    void this._decodeContext?.close();
    this._decodeContext = null;
  }

  // ── Transport ─────────────────────────────────────────────────────

  getCurrentTime(): number {
    return this._currentSamplePosition / this.sampleRate;
  }

  getLookAhead(): number {
    return 0.1;
  }

  getCompensatedTime(): number {
    return Math.max(0, this.getCurrentTime() - this._playbackLatencyCompensationSeconds);
  }

  setPlaybackLatencyCompensation(seconds: number): void {
    this._playbackLatencyCompensationSeconds = Number.isFinite(seconds)
      ? Math.max(0, seconds)
      : 0;
  }

  getPlaybackLatencyCompensation(): number {
    return this._playbackLatencyCompensationSeconds;
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
          invoke('audio_set_track_params', {
            handle,
            params: entry.params,
          }).catch(() => {});
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
    if (!entry) return;
    // Merge incoming partial params into the cached full state so
    // omitted fields preserve their existing values — codex found
    // that defaulting omitted fields to 1/0/false clobbers prior
    // user settings (e.g. `{ muted: true }` would reset volume to
    // 1.0 and pan to center). PR #1700.
    if (params.volume !== undefined) entry.params.volume = params.volume;
    if (params.pan !== undefined) entry.params.pan = params.pan;
    if (params.muted !== undefined) entry.params.mute = params.muted;
    if (params.soloed !== undefined) entry.params.solo = params.soloed;
    if (!entry.handle) return;
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
    const entry = this._trackEntries.get(_trackId);
    if (entry?.handle) {
      invoke<NativeMeterReading>('audio_get_track_meter', { handle: entry.handle })
        .then((reading) => {
          this._trackMeters.set(_trackId, toMeterData(reading));
        })
        .catch(() => {});
    }
    return this._trackMeters.get(_trackId) ?? ZERO_METER;
  }

  getTrackLevel(trackId: string): number {
    return this.getTrackMeter(trackId).level;
  }

  resetTrackClip(_trackId: string): void {
    // Will be wired in Phase 2B-2 (metering)
  }

  getTrackSpectrum(_trackId: string): Float32Array | null {
    return null;
  }

  getMasterMeter(_stage: 'input' | 'output'): MasterMeterData {
    invoke<NativeMeterReading>('audio_get_master_meter')
      .then((reading) => {
        this._masterMeter = toMasterMeterData(reading);
      })
      .catch(() => {});
    return this._masterMeter;
  }

  getMasterLevel(stage: 'input' | 'output'): number {
    return this.getMasterMeter(stage).level;
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
    clips: BridgeClipInfo[],
    fromTime: number,
    totalDuration: number,
  ): void {
    const token = ++this._transportCommandToken;
    const anySoloed = Array.from(this._trackEntries.values()).some((entry) => entry.params.solo);
    const nativeClips = clips
      .map((clip) => {
        const params = this._trackEntries.get(clip.trackId)?.params ?? {
          volume: 1,
          pan: 0,
          mute: false,
          solo: false,
        };
        return clipToNative(clip, this.sampleRate, params, anySoloed);
      })
      .filter((clip): clip is NativeClipSource => clip !== null);
    this._scheduledEndSample = Math.max(0, Math.round(totalDuration * this.sampleRate));
    this._currentSamplePosition = Math.max(0, Math.round(fromTime * this.sampleRate));

    void (async () => {
      await invoke('audio_clip_set_schedule', { clips: nativeClips });
      if (token !== this._transportCommandToken) return;
      await invoke('audio_transport_seek', { samplePosition: this._currentSamplePosition });
      if (token !== this._transportCommandToken) return;
      await invoke('audio_transport_play');
    })().catch(() => {});
  }

  stopAllSources(): void {
    this._transportCommandToken += 1;
    this._scheduledEndSample = null;
    this._currentSamplePosition = 0;
    void (async () => {
      await invoke('audio_clip_set_schedule', { clips: [] });
      await invoke('audio_transport_stop');
    })().catch(() => {});
  }

  pauseAllSources(): void {
    this._transportCommandToken += 1;
    invoke('audio_transport_pause').catch(() => {});
  }

  // ── Audio Data ────────────────────────────────────────────────────

  async decodeAudioData(blob: Blob): Promise<AudioBuffer> {
    this._decodeContext ??= new AudioContext({ sampleRate: this.sampleRate });
    return this._decodeContext.decodeAudioData(await blob.arrayBuffer());
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
    this.startTransportListener();
  }

  setOnEndedCallback(cb: () => void): void {
    this._onEndedCb = cb;
  }

  private startTransportListener(): void {
    if (this._transportListenerStarted) return;
    this._transportListenerStarted = true;
    void listen<number>(TRANSPORT_POSITION_EVENT, (event) => {
      const position = Number(event.payload);
      if (!Number.isFinite(position)) return;
      this._currentSamplePosition = Math.max(0, Math.floor(position));
      const currentTime = this.getCurrentTime();
      this._timeUpdateCb?.(currentTime);
      if (
        this._scheduledEndSample !== null
        && this._currentSamplePosition >= this._scheduledEndSample
      ) {
        this._scheduledEndSample = null;
        this.stopAllSources();
        this._onEndedCb?.();
      }
    })
      .then((unlisten) => {
        this._transportUnlisten = unlisten;
      })
      .catch(() => {
        this._transportListenerStarted = false;
      });
  }

  private refreshTransportPosition(): void {
    invoke<number>('audio_transport_get_position')
      .then((position) => {
        if (Number.isFinite(position)) {
          this._currentSamplePosition = Math.max(0, Math.floor(position));
        }
      })
      .catch(() => {});
  }
}
