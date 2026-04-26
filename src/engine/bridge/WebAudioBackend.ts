/**
 * WebAudioBackend — wraps the existing AudioEngine singleton for browser mode.
 *
 * This is a thin adapter: every method delegates to AudioEngine.
 * The stores will eventually call AudioBridge instead of AudioEngine directly,
 * but during migration both paths coexist safely.
 */
import type {
  AudioBridge,
  BridgeClipInfo,
  MasterMeterData,
  MeterData,
  TrackParams,
} from './types';
import type { MasteringState } from '../../types/project';
import type { AudioEngine } from '../AudioEngine';
import type { ClipScheduleInfo } from '../AudioEngine';

export class WebAudioBackend implements AudioBridge {
  readonly backend = 'web-audio' as const;

  constructor(private readonly engine: AudioEngine) {}

  // ── Lifecycle ─────────────────────────────────────────────────────

  async resume(): Promise<void> {
    return this.engine.resume();
  }

  dispose(): void {
    this.engine.dispose();
  }

  // ── Transport ─────────────────────────────────────────────────────

  getCurrentTime(): number {
    return this.engine.getCurrentTime();
  }

  getLookAhead(): number {
    return this.engine.getLookAhead();
  }

  getCompensatedTime(): number {
    return this.engine.getCompensatedTime();
  }

  setPlaybackLatencyCompensation(seconds: number): void {
    this.engine.setPlaybackLatencyCompensation(seconds);
  }

  getPlaybackLatencyCompensation(): number {
    return this.engine.getPlaybackLatencyCompensation();
  }

  // ── Track Management ──────────────────────────────────────────────

  ensureTrack(trackId: string): void {
    this.engine.getOrCreateTrackNode(trackId);
  }

  removeTrack(trackId: string): void {
    this.engine.removeTrackNode(trackId);
  }

  setTrackParams(trackId: string, params: TrackParams): void {
    const node = this.engine.getOrCreateTrackNode(trackId);
    if (params.volume !== undefined) node.volume = params.volume;
    if (params.pan !== undefined) node.pan = params.pan;
    if (params.muted !== undefined) node.muted = params.muted;
    if (params.soloed !== undefined) node.soloed = params.soloed;
    if (params.eqLowGain !== undefined) node.eqLowGain = params.eqLowGain;
    if (params.eqMidGain !== undefined) node.eqMidGain = params.eqMidGain;
    if (params.eqHighGain !== undefined) node.eqHighGain = params.eqHighGain;
    if (
      params.compressorEnabled !== undefined ||
      params.compressorThreshold !== undefined ||
      params.compressorRatio !== undefined
    ) {
      node.applyCompressor(
        params.compressorEnabled ?? false,
        params.compressorThreshold ?? -24,
        params.compressorRatio ?? 4,
      );
    }
    if (params.reverbMix !== undefined || params.reverbRoomSize !== undefined) {
      node.setReverb(params.reverbMix ?? 0, params.reverbRoomSize ?? 0.5);
    }
  }

  setTrackGroupRouting(trackId: string, groupId: string | null): void {
    this.engine.setTrackGroupRouting(trackId, groupId);
  }

  updateSoloState(): void {
    this.engine.updateSoloState();
  }

  // ── Metering ──────────────────────────────────────────────────────

  getTrackMeter(trackId: string): MeterData {
    return this.engine.getTrackMeter(trackId);
  }

  getTrackLevel(trackId: string): number {
    return this.engine.getTrackLevel(trackId);
  }

  resetTrackClip(trackId: string): void {
    this.engine.resetTrackClip(trackId);
  }

  getTrackSpectrum(trackId: string): Float32Array | null {
    return this.engine.getTrackSpectrum(trackId);
  }

  getMasterMeter(stage: 'input' | 'output'): MasterMeterData {
    return this.engine.getMasterMeter(stage);
  }

  getMasterLevel(stage: 'input' | 'output'): number {
    return this.engine.getMasterLevel(stage);
  }

  resetMasterClip(stage: 'input' | 'output'): void {
    this.engine.resetMasterClip(stage);
  }

  getMasterSpectrum(): Float32Array {
    return this.engine.getMasterSpectrum();
  }

  // ── Master ────────────────────────────────────────────────────────

  getMasterVolume(): number {
    return this.engine.masterVolume;
  }

  setMasterVolume(volume: number): void {
    this.engine.masterVolume = volume;
  }

  applyMastering(mastering: MasteringState | null | undefined): void {
    this.engine.applyMastering(mastering);
  }

  // ── Clip Scheduling ───────────────────────────────────────────────

  schedulePlayback(
    clips: BridgeClipInfo[],
    fromTime: number,
    totalDuration: number,
  ): void {
    const engineClips: ClipScheduleInfo[] = clips.map((c) => ({
      clipId: c.clipId,
      trackId: c.trackId,
      startTime: c.startTime,
      buffer: c.buffer,
      audioOffset: c.audioOffset,
      clipDuration: c.clipDuration,
      fadeInDuration: c.fadeInDuration,
      fadeOutDuration: c.fadeOutDuration,
      fadeInCurve: c.fadeInCurve,
      fadeOutCurve: c.fadeOutCurve,
      timeStretchRate: c.timeStretchRate,
    }));
    this.engine.schedulePlayback(engineClips, fromTime, totalDuration);
  }

  stopAllSources(): void {
    this.engine.stopAllSources();
  }

  // ── Audio Data ────────────────────────────────────────────────────

  async decodeAudioData(blob: Blob): Promise<AudioBuffer> {
    return this.engine.decodeAudioData(blob);
  }

  getAudioStream(): MediaStream {
    return this.engine.getAudioStream();
  }

  disposeAudioStream(): void {
    this.engine.disposeAudioStream();
  }

  // ── Callbacks ─────────────────────────────────────────────────────

  setTimeUpdateCallback(cb: (time: number) => void): void {
    this.engine.setTimeUpdateCallback(cb);
  }

  setOnEndedCallback(cb: () => void): void {
    this.engine.setOnEndedCallback(cb);
  }

  // ── Sample Rate ───────────────────────────────────────────────────

  get sampleRate(): number {
    return this.engine.sampleRate;
  }
}
