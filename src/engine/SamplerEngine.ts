import * as Tone from 'tone';
import type { SamplerConfig, Track } from '../types/project';
import { loadAudioBlobByKey } from '../services/audioFileManager';
import { getAudioEngine } from '../hooks/useAudioEngine';
import { resolveZonePlayback, type ZonePlaybackInfo } from './samplerZoneResolver';

interface SamplerVoice {
  gain: Tone.Gain;
  panner: Tone.Panner | null;
  pitch: number;
  releaseTimeoutId: ReturnType<typeof setTimeout> | null;
  source: Tone.ToneBufferSource;
}

interface SamplerInstance {
  audioBuffer: AudioBuffer;
  audioKey: string;
  buffer: Tone.ToneAudioBuffer;
  config: SamplerConfig;
  output: Tone.Gain;
  voices: Map<number, SamplerVoice[]>;
  /** Cached zone buffers keyed by zone audioKey. */
  zoneBuffers: Map<string, Tone.ToneAudioBuffer>;
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
    if (Tone.getContext().state !== 'running') {
      await Tone.start();
    }
  }

  ensureTrackSampler(
    trackId: string,
    config: SamplerConfig,
    audioBuffer: AudioBuffer,
    connectTo?: Tone.InputNode,
  ) {
    const nextConfig = buildPlaybackConfig(config, audioBuffer.duration);
    const existing = this.samplers.get(trackId);
    if (existing && existing.audioKey === config.audioKey) {
      existing.audioBuffer = audioBuffer;
      existing.buffer = new Tone.ToneAudioBuffer(audioBuffer);
      existing.config = nextConfig;
      this.bufferCache.set(config.audioKey, audioBuffer);
      // Refresh zone buffers if zones changed; prune stale entries
      this._pruneZoneBuffers(existing, nextConfig);
      if (nextConfig.zones && nextConfig.zones.length > 0) {
        void this._loadZoneBuffers(trackId, nextConfig);
      }
      return;
    }

    if (existing) {
      this._disposeInstance(existing);
    }

    const output = new Tone.Gain(0.55);
    if (connectTo) {
      output.connect(connectTo);
    } else {
      output.toDestination();
    }

    this.samplers.set(trackId, {
      audioBuffer,
      audioKey: config.audioKey,
      buffer: new Tone.ToneAudioBuffer(audioBuffer),
      config: nextConfig,
      output,
      voices: new Map(),
      zoneBuffers: new Map(),
    });
    this.bufferCache.set(config.audioKey, audioBuffer);

    // Preload zone buffers asynchronously
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
      // Skip zones with empty audioKey (e.g., unresolved SFZ imports)
      if (!zone.audioKey) continue;
      if (instance.zoneBuffers.has(zone.audioKey)) continue;

      // Check the global buffer cache first
      const cached = this.bufferCache.get(zone.audioKey);
      if (cached) {
        instance.zoneBuffers.set(zone.audioKey, new Tone.ToneAudioBuffer(cached));
        continue;
      }

      const blob = await loadAudioBlobByKey(zone.audioKey);
      if (!blob) continue;

      const buffer = await engine.decodeAudioData(blob);
      this.bufferCache.set(zone.audioKey, buffer);
      // Re-check instance in case it was removed while loading
      const current = this.samplers.get(trackId);
      if (current) {
        current.zoneBuffers.set(zone.audioKey, new Tone.ToneAudioBuffer(buffer));
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
    const toneBuffer = new Tone.ToneAudioBuffer(buffer);
    const zoneInfos = resolveZonePlayback(previewConfig, pitch, velocity);

    for (const info of zoneInfos) {
      // Preview always uses primary buffer (zone buffers may not be loaded in preview context)
      const voice = this._createVoice(toneBuffer, previewConfig, pitch, vel01, info);
      voice.gain.connect(Tone.getDestination());
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
    // Fallback to primary sample if no zone buffers were available
    if (!played) {
      const voice = this._createVoice(instance.buffer, instance.config, pitch, velocity);
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
    // Fallback to primary sample if no zone buffers were available
    if (!played) {
      const voice = this._createVoice(instance.buffer, instance.config, pitch, vel01);
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
  private _getZoneBuffer(instance: SamplerInstance, audioKey: string): Tone.ToneAudioBuffer | null {
    if (audioKey === instance.audioKey) return instance.buffer;
    return instance.zoneBuffers.get(audioKey) ?? null;
  }

  private _createVoice(
    buffer: Tone.ToneAudioBuffer,
    config: SamplerConfig,
    pitch: number,
    velocity: number,
    zoneInfo?: ZonePlaybackInfo,
  ): SamplerVoice {
    const rootNote = zoneInfo?.rootNote ?? config.rootNote;
    const tuneOffsetSemitones = (zoneInfo?.tuneOffsetCents ?? 0) / 100;
    const playbackRate = Math.pow(2, (pitch - rootNote + tuneOffsetSemitones) / 12);
    const zoneGain = zoneInfo?.gain ?? 1;
    const zonePan = zoneInfo?.pan ?? 0;

    const source = new Tone.BufferSource({
      url: buffer,
      loop: config.playbackMode === 'loop',
      loopStart: config.loopStart,
      loopEnd: config.loopEnd,
      playbackRate,
    });

    const gain = new Tone.Gain(0);
    let panner: Tone.Panner | null = null;

    if (zonePan !== 0) {
      panner = new Tone.Panner(zonePan);
      source.connect(panner);
      panner.connect(gain);
    } else {
      source.connect(gain);
    }

    const now = Tone.now();
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
    };
  }

  private _registerVoice(instance: SamplerInstance, voice: SamplerVoice) {
    voice.gain.connect(instance.output);
    const existing = instance.voices.get(voice.pitch) ?? [];
    instance.voices.set(voice.pitch, existing.concat(voice));
  }

  private _startVoice(voice: SamplerVoice, config: SamplerConfig, requestedDuration: number) {
    const startTime = Tone.now();
    const trimmedDuration = Math.max(0.01, config.trimEnd - config.trimStart);
    const playbackRate = Math.max(0.001, voice.source.playbackRate.value);
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

    const now = Tone.now();
    const releaseEnd = now + Math.max(0.01, release);
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(Math.max(0.0001, voice.gain.gain.value), now);
    voice.gain.gain.linearRampToValueAtTime(0.0001, releaseEnd);
    voice.source.stop(releaseEnd + 0.005);
    globalThis.setTimeout(() => {
      voice.source.dispose();
      voice.gain.dispose();
      voice.panner?.dispose();
    }, Math.max(20, Math.ceil((release + 0.05) * 1000)));
  }

  private _disposeVoices(voices: SamplerVoice[]) {
    for (const voice of voices) {
      if (voice.releaseTimeoutId !== null) {
        globalThis.clearTimeout(voice.releaseTimeoutId);
      }
      voice.source.dispose();
      voice.gain.dispose();
      voice.panner?.dispose();
    }
  }

  private _disposeInstance(instance: SamplerInstance) {
    for (const voices of instance.voices.values()) {
      this._disposeVoices(voices);
    }
    instance.voices.clear();
    instance.zoneBuffers.clear();
    instance.output.dispose();
  }
}

export const samplerEngine = new SamplerEngine();
