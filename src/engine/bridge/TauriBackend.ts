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

const ZERO_METER: MeterData = { level: 0, leftLevel: 0, rightLevel: 0, clipped: false };
const ZERO_MASTER: MasterMeterData = { level: 0, clipped: false };
const TRANSPORT_POSITION_EVENT = 'transport-position';
const METER_REFRESH_INTERVAL_MS = 50;

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

function isAlreadyRunningError(error: unknown): boolean {
  if (typeof error === 'object' && error !== null && 'kind' in error) {
    return (error as { kind?: unknown }).kind === 'alreadyRunning';
  }
  return String(error).includes('alreadyRunning');
}

function getPanGains(pan: number): { left: number; right: number } {
  const clamped = Math.max(-1, Math.min(1, Number.isFinite(pan) ? pan : 0));
  const angle = ((clamped + 1) * Math.PI) / 4;
  return {
    left: Math.cos(angle),
    right: Math.sin(angle),
  };
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
  const volume = Math.max(0, Number.isFinite(trackParams.volume) ? trackParams.volume : 1);
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
  private _lastTrackMeterRefreshMs = new Map<string, number>();
  private _trackMeterRefreshInFlight = new Set<string>();
  private _lastMasterMeterRefreshMs = -Infinity;
  private _masterMeterRefreshInFlight = false;
  private _transportCommandToken = 0;
  private _transportEndArmedToken: number | null = null;
  private _transportCommandQueue: Promise<void> = Promise.resolve();
  private _lastScheduledClips: BridgeClipInfo[] = [];
  private _republishQueued = false;

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
    try {
      await invoke('audio_start_engine', {
        config: { sampleRate: 48000, bufferSize: 256, deviceName: null },
      });
    } catch (error) {
      if (!isAlreadyRunningError(error)) throw error;
    }
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
    this.requestRepublishActiveSchedule();
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
    this.requestRepublishActiveSchedule();
  }

  // ── Metering ──────────────────────────────────────────────────────

  getTrackMeter(_trackId: string): MeterData {
    const scheduledClipMeter = this.getScheduledClipTrackMeter(_trackId);
    if (scheduledClipMeter) {
      this._trackMeters.set(_trackId, scheduledClipMeter);
      return scheduledClipMeter;
    }
    const entry = this._trackEntries.get(_trackId);
    if (entry?.handle && this.shouldRefreshTrackMeter(_trackId)) {
      invoke<NativeMeterReading>('audio_get_track_meter', { handle: entry.handle })
        .then((reading) => {
          this._trackMeters.set(_trackId, toMeterData(reading));
        })
        .catch(() => {})
        .finally(() => {
          this._trackMeterRefreshInFlight.delete(_trackId);
        });
    }
    return this._trackMeters.get(_trackId) ?? ZERO_METER;
  }

  getTrackLevel(trackId: string): number {
    return this.getTrackMeter(trackId).level;
  }

  resetTrackClip(trackId: string): void {
    this._trackMeters.set(trackId, {
      ...(this._trackMeters.get(trackId) ?? ZERO_METER),
      clipped: false,
    });
    const entry = this._trackEntries.get(trackId);
    if (!entry?.handle) return;
    invoke('audio_reset_track_clip', { handle: entry.handle }).catch(() => {});
  }

  getTrackSpectrum(_trackId: string): Float32Array | null {
    return null;
  }

  getMasterMeter(_stage: 'input' | 'output'): MasterMeterData {
    if (this.shouldRefreshMasterMeter()) {
      invoke<NativeMeterReading>('audio_get_master_meter')
        .then((reading) => {
          this._masterMeter = toMasterMeterData(reading);
        })
        .catch(() => {})
        .finally(() => {
          this._masterMeterRefreshInFlight = false;
        });
    }
    return this._masterMeter;
  }

  getMasterLevel(stage: 'input' | 'output'): number {
    return this.getMasterMeter(stage).level;
  }

  resetMasterClip(_stage: 'input' | 'output'): void {
    this._masterMeter = { ...this._masterMeter, clipped: false };
    invoke('audio_reset_master_clip').catch(() => {});
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
  ): Promise<void> {
    const token = ++this._transportCommandToken;
    this._transportEndArmedToken = null;
    this._lastScheduledClips = clips;
    const nativeClips = this.buildNativeClips(clips);
    const seekSamplePosition = Math.max(0, Math.round(fromTime * this.sampleRate));
    this._scheduledEndSample = Math.max(0, Math.round(totalDuration * this.sampleRate));
    this._currentSamplePosition = seekSamplePosition;

    return this.enqueueTransportCommand(async () => {
      if (token !== this._transportCommandToken) return;
      await invoke('audio_clip_set_schedule', { clips: nativeClips });
      if (token !== this._transportCommandToken) return;
      await invoke('audio_transport_seek', { samplePosition: seekSamplePosition });
      if (token !== this._transportCommandToken) return;
      await invoke('audio_transport_play');
      if (token === this._transportCommandToken) {
        this._transportEndArmedToken = token;
      }
    });
  }

  stopAllSources(): Promise<void> {
    const token = ++this._transportCommandToken;
    this._transportEndArmedToken = null;
    this._scheduledEndSample = null;
    this._currentSamplePosition = 0;
    this._lastScheduledClips = [];
    return this.enqueueTransportCommand(async () => {
      if (token !== this._transportCommandToken) return;
      await invoke('audio_clip_set_schedule', { clips: [] });
      if (token !== this._transportCommandToken) return;
      await invoke('audio_transport_stop');
    });
  }

  pauseAllSources(): Promise<void> {
    const token = ++this._transportCommandToken;
    this._transportEndArmedToken = null;
    return this.enqueueTransportCommand(async () => {
      if (token !== this._transportCommandToken) return;
      await invoke('audio_transport_pause');
    });
  }

  private buildNativeClips(clips: BridgeClipInfo[]): NativeClipSource[] {
    const anySoloed = Array.from(this._trackEntries.values()).some((entry) => entry.params.solo);
    return clips
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
  }

  private getScheduledClipTrackMeter(trackId: string): MeterData | null {
    const trackClips = this._lastScheduledClips.filter((clip) => clip.trackId === trackId);
    if (trackClips.length === 0) return null;

    const params = this._trackEntries.get(trackId)?.params ?? {
      volume: 1,
      pan: 0,
      mute: false,
      solo: false,
    };
    const anySoloed = Array.from(this._trackEntries.values()).some((entry) => entry.params.solo);
    if (params.mute || (anySoloed && !params.solo)) return ZERO_METER;

    const currentTime = this.getCurrentTime();
    const pan = getPanGains(params.pan);
    const volume = Math.max(0, Number.isFinite(params.volume) ? params.volume : 1);
    let leftLevel = 0;
    let rightLevel = 0;

    for (const clip of trackClips) {
      const clipEndTime = clip.startTime + clip.clipDuration;
      if (currentTime < clip.startTime || currentTime >= clipEndTime) continue;
      const sourceRate = clip.buffer.sampleRate || this.sampleRate;
      const sourceTime = clip.audioOffset + (currentTime - clip.startTime);
      const sampleIndex = Math.min(
        clip.buffer.length - 1,
        Math.max(0, Math.round(sourceTime * sourceRate)),
      );
      const left = clip.buffer.getChannelData(0);
      const right = clip.buffer.numberOfChannels > 1 ? clip.buffer.getChannelData(1) : left;
      leftLevel += (left[sampleIndex] ?? 0) * volume * pan.left;
      rightLevel += (right[sampleIndex] ?? 0) * volume * pan.right;
    }

    leftLevel = Math.abs(leftLevel);
    rightLevel = Math.abs(rightLevel);
    const level = Math.max(leftLevel, rightLevel);
    return {
      level,
      leftLevel,
      rightLevel,
      clipped: level >= 1,
    };
  }

  private meterNowMs(): number {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  private shouldRefreshTrackMeter(trackId: string): boolean {
    if (this._trackMeterRefreshInFlight.has(trackId)) return false;
    const now = this.meterNowMs();
    const last = this._lastTrackMeterRefreshMs.get(trackId) ?? -Infinity;
    if (now - last < METER_REFRESH_INTERVAL_MS) return false;
    this._lastTrackMeterRefreshMs.set(trackId, now);
    this._trackMeterRefreshInFlight.add(trackId);
    return true;
  }

  private shouldRefreshMasterMeter(): boolean {
    if (this._masterMeterRefreshInFlight) return false;
    const now = this.meterNowMs();
    if (now - this._lastMasterMeterRefreshMs < METER_REFRESH_INTERVAL_MS) return false;
    this._lastMasterMeterRefreshMs = now;
    this._masterMeterRefreshInFlight = true;
    return true;
  }

  private enqueueTransportCommand(command: () => Promise<void>): Promise<void> {
    const run = this._transportCommandQueue.then(command, command);
    this._transportCommandQueue = run.catch(() => {});
    void run.catch(() => {});
    return run;
  }

  private requestRepublishActiveSchedule(): void {
    if (this._scheduledEndSample === null || this._lastScheduledClips.length === 0) return;
    if (this._republishQueued) return;
    this._republishQueued = true;
    queueMicrotask(() => {
      this._republishQueued = false;
      this.republishActiveSchedule();
    });
  }

  private republishActiveSchedule(): void {
    if (this._scheduledEndSample === null || this._lastScheduledClips.length === 0) return;
    const token = this._transportCommandToken;
    const nativeClips = this.buildNativeClips(this._lastScheduledClips);
    this.enqueueTransportCommand(async () => {
      if (token !== this._transportCommandToken) return;
      await invoke('audio_clip_set_schedule', { clips: nativeClips });
    });
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
      const currentTime = this.getCompensatedTime();
      this._timeUpdateCb?.(currentTime);
      if (
        this._scheduledEndSample !== null
        && this._transportEndArmedToken === this._transportCommandToken
        && this._currentSamplePosition >= this._scheduledEndSample
      ) {
        this._transportEndArmedToken = null;
        this._scheduledEndSample = null;
        void this.stopAllSources();
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
    const token = this._transportCommandToken;
    invoke<number>('audio_transport_get_position')
      .then((position) => {
        if (token !== this._transportCommandToken) return;
        if (Number.isFinite(position)) {
          this._currentSamplePosition = Math.max(0, Math.floor(position));
        }
      })
      .catch(() => {});
  }
}
