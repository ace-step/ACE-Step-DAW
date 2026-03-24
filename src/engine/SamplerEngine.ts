import * as Tone from 'tone';
import type { SamplerConfig, Track } from '../types/project';
import { loadAudioBlobByKey } from '../services/audioFileManager';
import { getAudioEngine } from '../hooks/useAudioEngine';

interface SamplerVoice {
  gain: Tone.Gain;
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
    });
    this.bufferCache.set(config.audioKey, audioBuffer);
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
    const voice = this._createVoice(new Tone.ToneAudioBuffer(buffer), previewConfig, pitch, velocity / 127);
    voice.gain.connect(Tone.getDestination());
    this.previewVoices.push(voice);
    this._startVoice(voice, previewConfig, duration);
  }

  triggerAttackRelease(trackId: string, pitch: number, duration: number, velocity = 1) {
    const instance = this.samplers.get(trackId);
    if (!instance) return;
    const voice = this._createVoice(instance.buffer, instance.config, pitch, velocity);
    this._registerVoice(instance, voice);
    this._startVoice(voice, instance.config, duration);
  }

  /** Trigger note on for a track sampler (for live playing / recording). */
  noteOn(trackId: string, pitch: number, velocity = 100) {
    const instance = this.samplers.get(trackId);
    if (!instance) return;

    if (instance.config.playbackMode === 'oneShot') {
      this.triggerAttackRelease(trackId, pitch, 0, velocity / 127);
      return;
    }

    const voice = this._createVoice(instance.buffer, instance.config, pitch, velocity / 127);
    this._registerVoice(instance, voice);
    this._startVoice(voice, instance.config, Number.POSITIVE_INFINITY);
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

  private _createVoice(
    buffer: Tone.ToneAudioBuffer,
    config: SamplerConfig,
    pitch: number,
    velocity: number,
  ): SamplerVoice {
    const trimmedDuration = Math.max(0.01, config.trimEnd - config.trimStart);
    const playbackRate = Math.pow(2, (pitch - config.rootNote) / 12);
    const source = new Tone.BufferSource({
      url: buffer,
      loop: config.playbackMode === 'loop',
      loopStart: config.loopStart,
      loopEnd: config.loopEnd,
      playbackRate,
    });
    const gain = new Tone.Gain(0);
    source.connect(gain);

    const now = Tone.now();
    const attackEnd = now + Math.max(0.001, config.attack);
    const sustainLevel = clamp(velocity * config.sustain, 0, 1);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(Math.max(0.0001, velocity), attackEnd);
    gain.gain.linearRampToValueAtTime(Math.max(0.0001, sustainLevel), attackEnd + Math.max(0, config.decay));

    return {
      gain,
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
    }, Math.max(20, Math.ceil((release + 0.05) * 1000)));
  }

  private _disposeVoices(voices: SamplerVoice[]) {
    for (const voice of voices) {
      if (voice.releaseTimeoutId !== null) {
        globalThis.clearTimeout(voice.releaseTimeoutId);
      }
      voice.source.dispose();
      voice.gain.dispose();
    }
  }

  private _disposeInstance(instance: SamplerInstance) {
    for (const voices of instance.voices.values()) {
      this._disposeVoices(voices);
    }
    instance.voices.clear();
    instance.output.dispose();
  }
}

export const samplerEngine = new SamplerEngine();
