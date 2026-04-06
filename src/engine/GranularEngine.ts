import * as Tone from 'tone';
import type { GranularSettings, GrainEnvelopeShape, Track } from '../types/project';
import { loadAudioBlobByKey } from '../services/audioFileManager';
import { getAudioEngine } from '../hooks/useAudioEngine';

// ── Default Settings ─────────────────────────────────────────────────────────

export const DEFAULT_GRANULAR_SETTINGS: Omit<GranularSettings, 'audioKey'> = {
  rootNote: 60,
  grainSize: 50,
  density: 20,
  position: 0.5,
  positionScatter: 0.1,
  pitchScatter: 0,
  envelopeShape: 'hann',
  grainAttack: 0.3,
  grainRelease: 0.3,
  freeze: false,
  spread: 0.5,
  gain: 0.55,
  attack: 0.01,
  release: 0.3,
};

export function createGranularSettings(
  audioKey: string,
  overrides?: Partial<GranularSettings>,
): GranularSettings {
  return {
    ...DEFAULT_GRANULAR_SETTINGS,
    audioKey,
    ...overrides,
  };
}

// ── Grain Envelope Window ────────────────────────────────────────────────────

function buildGrainWindow(
  length: number,
  shape: GrainEnvelopeShape,
  attackFrac: number,
  releaseFrac: number,
): Float32Array {
  const window = new Float32Array(length);
  const attackSamples = Math.max(1, Math.floor(length * clamp(attackFrac, 0, 0.5)));
  const releaseSamples = Math.max(1, Math.floor(length * clamp(releaseFrac, 0, 0.5)));
  const sustainStart = attackSamples;
  const sustainEnd = length - releaseSamples;

  for (let i = 0; i < length; i++) {
    if (shape === 'hann') {
      window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (length - 1)));
    } else if (shape === 'triangle') {
      const mid = (length - 1) / 2;
      window[i] = 1 - Math.abs((i - mid) / mid);
    } else if (shape === 'trapezoid') {
      if (i < sustainStart) {
        window[i] = i / attackSamples;
      } else if (i >= sustainEnd) {
        window[i] = (length - 1 - i) / releaseSamples;
      } else {
        window[i] = 1;
      }
    } else {
      // tukey — cosine-tapered
      if (i < attackSamples) {
        window[i] = 0.5 * (1 - Math.cos((Math.PI * i) / attackSamples));
      } else if (i >= sustainEnd) {
        window[i] = 0.5 * (1 - Math.cos((Math.PI * (length - 1 - i)) / releaseSamples));
      } else {
        window[i] = 1;
      }
    }
  }
  return window;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Simple seeded PRNG for deterministic scatter (xoshiro128**). */
let _seed = 42;
function seededRandom(): number {
  _seed ^= _seed << 13;
  _seed ^= _seed >> 17;
  _seed ^= _seed << 5;
  return Math.abs(_seed % 10000) / 10000;
}

// ── Types ────────────────────────────────────────────────────────────────────

interface GranularVoice {
  pitch: number;
  output: GainNode;
  schedulerHandle: ReturnType<typeof setInterval> | null;
  activeGrains: Set<AudioBufferSourceNode>;
  releaseTimeoutId: ReturnType<typeof setTimeout> | null;
  /** Position auto-scan offset — advances when not frozen. */
  positionOffset: number;
  startTime: number;
}

interface GranularInstance {
  audioBuffer: AudioBuffer;
  audioKey: string;
  settings: GranularSettings;
  output: GainNode;
  voices: Map<number, GranularVoice[]>;
  /** Shared grain window buffer (recomputed on settings change). */
  grainWindowBuffer: AudioBuffer | null;
}

// ── Engine ───────────────────────────────────────────────────────────────────

class GranularEngine {
  private instances = new Map<string, GranularInstance>();
  private readonly bufferCache = new Map<string, AudioBuffer>();

  private getContext(): AudioContext {
    return Tone.getContext().rawContext as AudioContext;
  }

  async ensureStarted(): Promise<void> {
    if (Tone.getContext().state !== 'running') {
      await Tone.start();
    }
  }

  ensureTrackGranular(
    trackId: string,
    settings: GranularSettings,
    audioBuffer: AudioBuffer,
    connectTo?: AudioNode,
  ): void {
    const existing = this.instances.get(trackId);
    if (existing && existing.audioKey === settings.audioKey) {
      existing.audioBuffer = audioBuffer;
      existing.settings = { ...settings };
      existing.grainWindowBuffer = null; // invalidate cache
      this.bufferCache.set(settings.audioKey, audioBuffer);
      return;
    }

    if (existing) {
      this._disposeInstance(existing);
    }

    const ctx = this.getContext();
    const output = ctx.createGain();
    output.gain.value = settings.gain;

    if (connectTo) {
      output.connect(connectTo);
    } else {
      output.connect(ctx.destination);
    }

    this.instances.set(trackId, {
      audioBuffer,
      audioKey: settings.audioKey,
      settings: { ...settings },
      output,
      voices: new Map(),
      grainWindowBuffer: null,
    });
    this.bufferCache.set(settings.audioKey, audioBuffer);
  }

  async getTrackBuffer(track: Track): Promise<AudioBuffer | null> {
    const config = track.granularConfig;
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

  updateSettings(trackId: string, settings: Partial<GranularSettings>): void {
    const instance = this.instances.get(trackId);
    if (!instance) return;
    Object.assign(instance.settings, settings);
    instance.grainWindowBuffer = null; // invalidate cache
    if (settings.gain !== undefined) {
      instance.output.gain.value = settings.gain;
    }
  }

  // ── Note Triggering ──────────────────────────────────────────────────────

  noteOn(trackId: string, pitch: number, velocity = 100): void {
    const instance = this.instances.get(trackId);
    if (!instance) return;

    const ctx = this.getContext();
    const voiceOutput = ctx.createGain();
    const velocityGain = velocity / 127;

    // Apply attack envelope
    const now = ctx.currentTime;
    const attackEnd = now + Math.max(0.001, instance.settings.attack);
    voiceOutput.gain.setValueAtTime(0.0001, now);
    voiceOutput.gain.linearRampToValueAtTime(velocityGain, attackEnd);
    voiceOutput.connect(instance.output);

    const voice: GranularVoice = {
      pitch,
      output: voiceOutput,
      schedulerHandle: null,
      activeGrains: new Set(),
      releaseTimeoutId: null,
      positionOffset: 0,
      startTime: now,
    };

    // Start grain scheduler
    const intervalMs = Math.max(5, 1000 / Math.max(1, instance.settings.density));
    voice.schedulerHandle = globalThis.setInterval(() => {
      this._scheduleGrain(instance, voice);
    }, intervalMs);

    // Schedule first grain immediately
    this._scheduleGrain(instance, voice);

    const existing = instance.voices.get(pitch) ?? [];
    instance.voices.set(pitch, existing.concat(voice));
  }

  noteOff(trackId: string, pitch: number): void {
    const instance = this.instances.get(trackId);
    if (!instance) return;

    const voices = instance.voices.get(pitch) ?? [];
    for (const voice of voices) {
      this._releaseVoice(voice, instance.settings.release);
    }
    instance.voices.delete(pitch);
  }

  triggerAttackRelease(trackId: string, pitch: number, duration: number, velocity = 1): void {
    this.noteOn(trackId, pitch, Math.round(velocity * 127));
    const instance = this.instances.get(trackId);
    if (!instance) return;

    const voices = instance.voices.get(pitch);
    if (!voices || voices.length === 0) return;

    const voice = voices[voices.length - 1];
    voice.releaseTimeoutId = globalThis.setTimeout(() => {
      this._releaseVoice(voice, instance.settings.release);
      const remaining = instance.voices.get(pitch)?.filter((v) => v !== voice) ?? [];
      if (remaining.length > 0) {
        instance.voices.set(pitch, remaining);
      } else {
        instance.voices.delete(pitch);
      }
    }, Math.max(20, duration * 1000));
  }

  releaseAll(): void {
    for (const instance of this.instances.values()) {
      for (const voices of instance.voices.values()) {
        for (const voice of voices) {
          this._releaseVoice(voice, instance.settings.release);
        }
      }
      instance.voices.clear();
    }
  }

  removeTrack(trackId: string): void {
    const instance = this.instances.get(trackId);
    if (!instance) return;
    this._disposeInstance(instance);
    this.instances.delete(trackId);
  }

  setParameter(trackId: string, name: string, value: number | string | boolean): void {
    const instance = this.instances.get(trackId);
    if (!instance) return;

    if (name in instance.settings) {
      (instance.settings as unknown as Record<string, unknown>)[name] = value;
      instance.grainWindowBuffer = null;
      if (name === 'gain' && typeof value === 'number') {
        instance.output.gain.value = value;
      }
      // Update scheduler interval if density changed
      if (name === 'density') {
        for (const voices of instance.voices.values()) {
          for (const voice of voices) {
            this._updateSchedulerInterval(instance, voice);
          }
        }
      }
    }
  }

  dispose(): void {
    for (const trackId of this.instances.keys()) {
      this.removeTrack(trackId);
    }
  }

  // ── Grain Scheduling ─────────────────────────────────────────────────────

  private _scheduleGrain(instance: GranularInstance, voice: GranularVoice): void {
    const ctx = this.getContext();
    const { settings, audioBuffer } = instance;
    const sampleRate = audioBuffer.sampleRate;
    const numChannels = audioBuffer.numberOfChannels;
    const bufferLength = audioBuffer.length;

    // Calculate grain size in samples
    const grainSizeSamples = Math.max(
      64,
      Math.min(bufferLength, Math.round((settings.grainSize / 1000) * sampleRate)),
    );

    // Calculate grain start position
    let position = settings.position;
    if (!settings.freeze) {
      // Auto-scan: slowly advance position over time
      const elapsed = ctx.currentTime - voice.startTime;
      position = (settings.position + elapsed * 0.01) % 1;
    }

    // Apply position scatter
    const scatter = (seededRandom() - 0.5) * 2 * settings.positionScatter;
    position = clamp(position + scatter, 0, 1);

    const startSample = Math.floor(position * Math.max(0, bufferLength - grainSizeSamples));

    // Apply pitch scatter
    const pitchOffset = (seededRandom() - 0.5) * 2 * settings.pitchScatter;
    const midiOffset = voice.pitch - settings.rootNote + pitchOffset;
    const playbackRate = Math.pow(2, midiOffset / 12);

    // Create grain buffer with windowed audio
    const grainBuffer = ctx.createBuffer(numChannels, grainSizeSamples, sampleRate);
    const window = this._getGrainWindow(instance, grainSizeSamples);

    for (let ch = 0; ch < numChannels; ch++) {
      const sourceData = audioBuffer.getChannelData(ch);
      const grainData = grainBuffer.getChannelData(ch);
      for (let i = 0; i < grainSizeSamples; i++) {
        const srcIdx = startSample + i;
        grainData[i] = (srcIdx < bufferLength ? sourceData[srcIdx] : 0) * window[i];
      }
    }

    // Create source node for this grain
    const source = ctx.createBufferSource();
    source.buffer = grainBuffer;
    source.playbackRate.value = Math.max(0.01, playbackRate);

    // Apply stereo spread via stereo panner
    const panner = ctx.createStereoPanner();
    const panValue = (seededRandom() - 0.5) * 2 * settings.spread;
    panner.pan.value = clamp(panValue, -1, 1);

    source.connect(panner);
    panner.connect(voice.output);

    voice.activeGrains.add(source);

    const grainDurationSec = grainSizeSamples / sampleRate / Math.max(0.01, playbackRate);
    source.start(ctx.currentTime);
    source.stop(ctx.currentTime + grainDurationSec + 0.005);

    source.onended = () => {
      voice.activeGrains.delete(source);
      try {
        source.disconnect();
        panner.disconnect();
      } catch {
        // Already disconnected
      }
    };
  }

  private _getGrainWindow(instance: GranularInstance, grainSizeSamples: number): Float32Array {
    // Build and cache window
    const { envelopeShape, grainAttack, grainRelease } = instance.settings;
    return buildGrainWindow(grainSizeSamples, envelopeShape, grainAttack, grainRelease);
  }

  private _updateSchedulerInterval(instance: GranularInstance, voice: GranularVoice): void {
    if (voice.schedulerHandle !== null) {
      globalThis.clearInterval(voice.schedulerHandle);
    }
    const intervalMs = Math.max(5, 1000 / Math.max(1, instance.settings.density));
    voice.schedulerHandle = globalThis.setInterval(() => {
      this._scheduleGrain(instance, voice);
    }, intervalMs);
  }

  // ── Cleanup ──────────────────────────────────────────────────────────────

  private _releaseVoice(voice: GranularVoice, release: number): void {
    // Stop scheduler
    if (voice.schedulerHandle !== null) {
      globalThis.clearInterval(voice.schedulerHandle);
      voice.schedulerHandle = null;
    }

    if (voice.releaseTimeoutId !== null) {
      globalThis.clearTimeout(voice.releaseTimeoutId);
      voice.releaseTimeoutId = null;
    }

    // Fade out
    const ctx = this.getContext();
    const now = ctx.currentTime;
    const releaseEnd = now + Math.max(0.01, release);
    voice.output.gain.cancelScheduledValues(now);
    voice.output.gain.setValueAtTime(Math.max(0.0001, voice.output.gain.value), now);
    voice.output.gain.linearRampToValueAtTime(0.0001, releaseEnd);

    // Clean up after release
    globalThis.setTimeout(() => {
      for (const source of voice.activeGrains) {
        try {
          source.stop();
          source.disconnect();
        } catch {
          // Already stopped/disconnected
        }
      }
      voice.activeGrains.clear();
      try {
        voice.output.disconnect();
      } catch {
        // Already disconnected
      }
    }, Math.ceil((release + 0.05) * 1000));
  }

  private _disposeInstance(instance: GranularInstance): void {
    for (const voices of instance.voices.values()) {
      for (const voice of voices) {
        this._releaseVoice(voice, 0.01);
      }
    }
    instance.voices.clear();
    try {
      instance.output.disconnect();
    } catch {
      // Already disconnected
    }
  }
}

export const granularEngine = new GranularEngine();
