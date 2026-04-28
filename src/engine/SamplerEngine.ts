/**
 * SamplerEngine — chromatic sample playback per track.
 *
 * Phase 5H migration: removed Tone.js dependency. Tone was being used
 * purely as a thin wrapper over native Web Audio nodes —
 * `Tone.Gain`/`Tone.Panner`/`Tone.BufferSource`/`Tone.ToneAudioBuffer`
 * all map 1:1 onto native `GainNode`/`StereoPannerNode`/`AudioBufferSourceNode`/
 * `AudioBuffer`, so this is a mechanical swap rather than a DSP rewrite.
 */
import type { SamplerConfig, Track } from '../types/project';
import { loadAudioBlobByKey } from '../services/audioFileManager';
import { getAudioEngine } from '../hooks/useAudioEngine';
import { resolveZonePlayback, type ZonePlaybackInfo } from './samplerZoneResolver';

interface SamplerVoice {
  gain: GainNode;
  panner: StereoPannerNode | null;
  pitch: number;
  releaseTimeoutId: ReturnType<typeof setTimeout> | null;
  source: AudioBufferSourceNode;
  /** Cached because AudioBufferSourceNode.playbackRate is an AudioParam,
   *  but downstream timing math only needs the scalar. */
  playbackRate: number;
  /** Disposal timer — cleared in `_disposeVoice` so we don't drop nodes twice. */
  disposeTimeoutId: ReturnType<typeof setTimeout> | null;
}

interface SamplerInstance {
  audioBuffer: AudioBuffer;
  audioKey: string;
  config: SamplerConfig;
  output: GainNode;
  voices: Map<number, SamplerVoice[]>;
  /** Cached zone buffers keyed by zone audioKey. */
  zoneBuffers: Map<string, AudioBuffer>;
}

/** Default ADSR values for new sampler configs. */
export const DEFAULT_SAMPLER_CONFIG: Omit<SamplerConfig, 'audioKey'> = {
  rootNote: 60,
  trimStart: 0,
  trimEnd: 1,
  playbackMode: 'classic',
  loopStart: 0,
  loopEnd: 1,
  attack: 0.005,
  decay: 0.1,
  sustain: 1,
  release: 0.3,
};

/**
 * Create a SamplerConfig with sensible defaults.
 */
export function createSamplerConfig(audioKey: string, overrides?: Partial<SamplerConfig>): SamplerConfig {
  const sampleDuration = Math.max(0.01, overrides?.trimEnd ?? overrides?.loopEnd ?? 1);
  const trimStart = clamp(overrides?.trimStart ?? 0, 0, Math.max(0, sampleDuration - 0.01));
  const trimEnd = clamp(overrides?.trimEnd ?? sampleDuration, trimStart + 0.01, sampleDuration);
  const loopStart = clamp(overrides?.loopStart ?? trimStart, trimStart, Math.max(trimStart, trimEnd - 0.01));
  const loopEnd = clamp(overrides?.loopEnd ?? trimEnd, loopStart + 0.01, trimEnd);

  return {
    ...DEFAULT_SAMPLER_CONFIG,
    audioKey,
    trimStart,
    trimEnd,
    loopStart,
    loopEnd,
    ...overrides,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getTrackSamplerConfig(track: Track): SamplerConfig | null {
  if (track.samplerConfig) return track.samplerConfig;
  if (!track.sampler?.audioKey) return null;
  return createSamplerConfig(track.sampler.audioKey, {
    rootNote: track.sampler.rootNote ?? DEFAULT_SAMPLER_CONFIG.rootNote,
    trimEnd: track.sampler.sampleDuration ?? DEFAULT_SAMPLER_CONFIG.trimEnd,
    loopEnd: track.sampler.sampleDuration ?? DEFAULT_SAMPLER_CONFIG.loopEnd,
  });
}

function buildPlaybackConfig(config: SamplerConfig, sampleDuration: number): SamplerConfig {
  return createSamplerConfig(config.audioKey, {
    ...config,
    trimStart: clamp(config.trimStart, 0, Math.max(0, sampleDuration - 0.01)),
    trimEnd: clamp(config.trimEnd, 0.01, sampleDuration),
    loopStart: clamp(config.loopStart, 0, Math.max(0, sampleDuration - 0.01)),
    loopEnd: clamp(config.loopEnd, 0.01, sampleDuration),
  });
}

/**
 * Engine that manages one-sample chromatic playback per track.
 */
class SamplerEngine {
  private samplers = new Map<string, SamplerInstance>();
  private previewVoices: SamplerVoice[] = [];
  private readonly bufferCache = new Map<string, AudioBuffer>();

  async ensureStarted() {
    const engine = getAudioEngine();
    if (engine.ctx.state !== 'running') {
      await engine.resume();
    }
  }

  ensureTrackSampler(
    trackId: string,
    config: SamplerConfig,
    audioBuffer: AudioBuffer,
    connectTo?: AudioNode,
  ) {
    const nextConfig = buildPlaybackConfig(config, audioBuffer.duration);
    const existing = this.samplers.get(trackId);
    if (existing && existing.audioKey === config.audioKey) {
      existing.audioBuffer = audioBuffer;
      existing.config = nextConfig;
      this.bufferCache.set(config.audioKey, audioBuffer);
      this._pruneZoneBuffers(existing, nextConfig);
      if (nextConfig.zones && nextConfig.zones.length > 0) {
        void this._loadZoneBuffers(trackId, nextConfig);
      }
      return;
    }

    if (existing) {
      this._disposeInstance(existing);
    }

    const ctx = getAudioEngine().ctx;
    const output = ctx.createGain();
    output.gain.value = 0.55;
    if (connectTo) {
      output.connect(connectTo);
    } else {
      output.connect(ctx.destination);
    }

    this.samplers.set(trackId, {
      audioBuffer,
      audioKey: config.audioKey,
      config: nextConfig,
      output,
      voices: new Map(),
      zoneBuffers: new Map(),
    });
    this.bufferCache.set(config.audioKey, audioBuffer);

    if (nextConfig.zones && nextConfig.zones.length > 0) {
      void this._loadZoneBuffers(trackId, nextConfig);
    }
  }

  /** Remove zone buffer entries that no longer correspond to any zone in the config. */
  private _pruneZoneBuffers(instance: SamplerInstance, config: SamplerConfig): void {
    const activeKeys = new Set((config.zones ?? []).map((z) => z.audioKey));
    for (const key of instance.zoneBuffers.keys()) {
      if (!activeKeys.has(key)) {
        instance.zoneBuffers.delete(key);
      }
    }
  }

  /** Load audio buffers for all zones in a config. */
  private async _loadZoneBuffers(trackId: string, config: SamplerConfig): Promise<void> {
    const zones = config.zones;
    if (!zones) return;

    const instance = this.samplers.get(trackId);
    if (!instance) return;

    const engine = getAudioEngine();
    await engine.resume();

    for (const zone of zones) {
      if (!zone.audioKey) continue;
      if (instance.zoneBuffers.has(zone.audioKey)) continue;

      const cached = this.bufferCache.get(zone.audioKey);
      if (cached) {
        instance.zoneBuffers.set(zone.audioKey, cached);
        continue;
      }

      const blob = await loadAudioBlobByKey(zone.audioKey);
      if (!blob) continue;

      const buffer = await engine.decodeAudioData(blob);
      this.bufferCache.set(zone.audioKey, buffer);
      const current = this.samplers.get(trackId);
      if (current) {
        current.zoneBuffers.set(zone.audioKey, buffer);
      }
    }
  }

  async getTrackBuffer(track: Track): Promise<AudioBuffer | null> {
    const config = getTrackSamplerConfig(track);
    if (!config) return null;

    const cached = this.bufferCache.get(config.audioKey);
    if (cached) return cached;

    const blob = await loadAudioBlobByKey(config.audioKey);
    if (!blob) return null;

    const engine = getAudioEngine();
    await engine.resume();
    const buffer = await engine.decodeAudioData(blob);
    this.bufferCache.set(config.audioKey, buffer);
    return buffer;
  }

  /**
   * Preview a sample at a given pitch (for audition / piano roll click).
   */
  async previewTrackNote(
    track: Track,
    pitch: number,
    velocity = 100,
    duration = 0.3,
  ): Promise<void> {
    const config = getTrackSamplerConfig(track);
    if (!config) return;

    const buffer = await this.getTrackBuffer(track);
    if (!buffer) return;

    await this.ensureStarted();
    this._disposeVoices(this.previewVoices);
    this.previewVoices = [];

    const previewConfig = buildPlaybackConfig(config, buffer.duration);
    const vel01 = velocity / 127;
    const zoneInfos = resolveZonePlayback(previewConfig, pitch, velocity);
    const ctx = getAudioEngine().ctx;

    for (const info of zoneInfos) {
      const voice = this._createVoice(buffer, previewConfig, pitch, vel01, info);
      voice.gain.connect(ctx.destination);
      this.previewVoices.push(voice);
      this._startVoice(voice, previewConfig, duration);
      break; // Preview plays first matching zone only
    }
  }

  triggerAttackRelease(trackId: string, pitch: number, duration: number, velocity = 1) {
    const instance = this.samplers.get(trackId);
    if (!instance) return;

    const zoneInfos = resolveZonePlayback(instance.config, pitch, Math.round(velocity * 127));
    let played = false;
    for (const info of zoneInfos) {
      const buffer = this._getZoneBuffer(instance, info.audioKey);
      if (!buffer) continue;
      const voice = this._createVoice(buffer, instance.config, pitch, velocity, info);
      this._registerVoice(instance, voice);
      this._startVoice(voice, instance.config, duration);
      played = true;
    }
    if (!played) {
      const voice = this._createVoice(instance.audioBuffer, instance.config, pitch, velocity);
      this._registerVoice(instance, voice);
      this._startVoice(voice, instance.config, duration);
    }
  }

  /** Trigger note on for a track sampler (for live playing / recording). */
  noteOn(trackId: string, pitch: number, velocity = 100) {
    const instance = this.samplers.get(trackId);
    if (!instance) return;

    if (instance.config.playbackMode === 'oneShot') {
      this.triggerAttackRelease(trackId, pitch, 0, velocity / 127);
      return;
    }

    const vel01 = velocity / 127;
    const zoneInfos = resolveZonePlayback(instance.config, pitch, velocity);
    let played = false;
    for (const info of zoneInfos) {
      const buffer = this._getZoneBuffer(instance, info.audioKey);
      if (!buffer) continue;
      const voice = this._createVoice(buffer, instance.config, pitch, vel01, info);
      this._registerVoice(instance, voice);
      this._startVoice(voice, instance.config, Number.POSITIVE_INFINITY);
      played = true;
    }
    if (!played) {
      const voice = this._createVoice(instance.audioBuffer, instance.config, pitch, vel01);
      this._registerVoice(instance, voice);
      this._startVoice(voice, instance.config, Number.POSITIVE_INFINITY);
    }
  }

  /** Trigger note off for a track sampler. */
  noteOff(trackId: string, pitch: number) {
    const instance = this.samplers.get(trackId);
    if (!instance) return;

    const voices = instance.voices.get(pitch) ?? [];
    for (const voice of voices) {
      this._releaseVoice(voice, instance.config.release);
    }
    instance.voices.delete(pitch);
  }

  /** Release all currently sounding notes on all track samplers. */
  releaseAll() {
    for (const instance of this.samplers.values()) {
      for (const voices of instance.voices.values()) {
        for (const voice of voices) {
          this._releaseVoice(voice, instance.config.release);
        }
      }
      instance.voices.clear();
    }
    this._disposeVoices(this.previewVoices);
    this.previewVoices = [];
  }

  removeTrackSampler(trackId: string) {
    const instance = this.samplers.get(trackId);
    if (!instance) return;
    this._disposeInstance(instance);
    this.samplers.delete(trackId);
  }

  removeTrack(trackId: string) {
    this.removeTrackSampler(trackId);
  }

  /**
   * Set a named parameter on the sampler for a track.
   *
   * This is a stub that will be wired up when real-time parameter automation
   * is added to the sampler engine. For now, parameter changes should go
   * through {@link ensureTrackSampler} with an updated config.
   */
  setParameter(_trackId: string, _name: string, _value: number | string | boolean): void {
    // No-op stub — see InstrumentEngine interface.
  }

  stopAll() {
    this.releaseAll();
  }

  dispose() {
    for (const trackId of this.samplers.keys()) {
      this.removeTrackSampler(trackId);
    }
    this._disposeVoices(this.previewVoices);
    this.previewVoices = [];
  }

  /** Get the buffer for a zone audioKey, falling back to primary. */
  private _getZoneBuffer(instance: SamplerInstance, audioKey: string): AudioBuffer | null {
    if (audioKey === instance.audioKey) return instance.audioBuffer;
    return instance.zoneBuffers.get(audioKey) ?? null;
  }

  private _createVoice(
    buffer: AudioBuffer,
    config: SamplerConfig,
    pitch: number,
    velocity: number,
    zoneInfo?: ZonePlaybackInfo,
  ): SamplerVoice {
    const ctx = getAudioEngine().ctx;
    const rootNote = zoneInfo?.rootNote ?? config.rootNote;
    const tuneOffsetSemitones = (zoneInfo?.tuneOffsetCents ?? 0) / 100;
    const playbackRate = Math.pow(2, (pitch - rootNote + tuneOffsetSemitones) / 12);
    const zoneGain = zoneInfo?.gain ?? 1;
    const zonePan = zoneInfo?.pan ?? 0;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = config.playbackMode === 'loop';
    source.loopStart = config.loopStart;
    source.loopEnd = config.loopEnd;
    source.playbackRate.value = playbackRate;

    const gain = ctx.createGain();
    let panner: StereoPannerNode | null = null;

    if (zonePan !== 0) {
      panner = ctx.createStereoPanner();
      panner.pan.value = zonePan;
      source.connect(panner);
      panner.connect(gain);
    } else {
      source.connect(gain);
    }

    const now = ctx.currentTime;
    const attackEnd = now + Math.max(0.001, config.attack);
    const peakLevel = clamp(velocity * zoneGain, 0, 1);
    const sustainLevel = clamp(peakLevel * config.sustain, 0, 1);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(Math.max(0.0001, peakLevel), attackEnd);
    gain.gain.linearRampToValueAtTime(Math.max(0.0001, sustainLevel), attackEnd + Math.max(0, config.decay));

    return {
      gain,
      panner,
      pitch,
      releaseTimeoutId: null,
      source,
      playbackRate,
      disposeTimeoutId: null,
    };
  }

  private _registerVoice(instance: SamplerInstance, voice: SamplerVoice) {
    voice.gain.connect(instance.output);
    const existing = instance.voices.get(voice.pitch) ?? [];
    instance.voices.set(voice.pitch, existing.concat(voice));
  }

  private _startVoice(voice: SamplerVoice, config: SamplerConfig, requestedDuration: number) {
    const ctx = getAudioEngine().ctx;
    const startTime = ctx.currentTime;
    const trimmedDuration = Math.max(0.01, config.trimEnd - config.trimStart);
    const playbackRate = Math.max(0.001, voice.playbackRate);
    const naturalDuration = trimmedDuration / playbackRate;

    if (config.playbackMode === 'loop') {
      voice.source.start(startTime, config.trimStart);
      if (Number.isFinite(requestedDuration)) {
        this._scheduleRelease(voice, Math.max(0.02, requestedDuration), config.release);
      }
      return;
    }

    const playbackDuration = config.playbackMode === 'oneShot'
      ? naturalDuration
      : Number.isFinite(requestedDuration)
        ? Math.max(0.02, Math.min(naturalDuration, requestedDuration))
        : naturalDuration;
    const sourceDuration = Math.min(trimmedDuration, playbackDuration * playbackRate);
    voice.source.start(startTime, config.trimStart, sourceDuration);
    this._scheduleRelease(voice, playbackDuration, config.release);
  }

  private _scheduleRelease(voice: SamplerVoice, holdDuration: number, release: number) {
    const totalDuration = Math.max(0.02, holdDuration);
    voice.releaseTimeoutId = globalThis.setTimeout(() => {
      this._releaseVoice(voice, release);
    }, totalDuration * 1000);
  }

  private _releaseVoice(voice: SamplerVoice, release: number) {
    if (voice.releaseTimeoutId !== null) {
      globalThis.clearTimeout(voice.releaseTimeoutId);
      voice.releaseTimeoutId = null;
    }

    const ctx = getAudioEngine().ctx;
    const now = ctx.currentTime;
    const releaseEnd = now + Math.max(0.01, release);
    const currentGain = voice.gain.gain.value;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(Math.max(0.0001, currentGain), now);
    voice.gain.gain.linearRampToValueAtTime(0.0001, releaseEnd);
    try { voice.source.stop(releaseEnd + 0.005); } catch { /* already stopped */ }

    if (voice.disposeTimeoutId !== null) {
      globalThis.clearTimeout(voice.disposeTimeoutId);
    }
    voice.disposeTimeoutId = globalThis.setTimeout(() => {
      this._disposeVoice(voice);
    }, Math.max(20, Math.ceil((release + 0.05) * 1000)));
  }

  private _disposeVoice(voice: SamplerVoice): void {
    if (voice.releaseTimeoutId !== null) {
      globalThis.clearTimeout(voice.releaseTimeoutId);
      voice.releaseTimeoutId = null;
    }
    if (voice.disposeTimeoutId !== null) {
      globalThis.clearTimeout(voice.disposeTimeoutId);
      voice.disposeTimeoutId = null;
    }
    try { voice.source.stop(); } catch { /* already stopped */ }
    try { voice.source.disconnect(); } catch { /* already disconnected */ }
    try { voice.gain.disconnect(); } catch { /* already disconnected */ }
    if (voice.panner) {
      try { voice.panner.disconnect(); } catch { /* already disconnected */ }
    }
  }

  private _disposeVoices(voices: SamplerVoice[]) {
    for (const voice of voices) {
      this._disposeVoice(voice);
    }
  }

  private _disposeInstance(instance: SamplerInstance) {
    for (const voices of instance.voices.values()) {
      this._disposeVoices(voices);
    }
    instance.voices.clear();
    instance.zoneBuffers.clear();
    try { instance.output.disconnect(); } catch { /* already disconnected */ }
  }
}

export const samplerEngine = new SamplerEngine();
