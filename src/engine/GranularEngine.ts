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
        window[i] = attackSamples > 1 ? i / (attackSamples - 1) : 1;
      } else if (i >= sustainEnd) {
        window[i] = releaseSamples > 1 ? (length - 1 - i) / (releaseSamples - 1) : 1;
      } else {
        window[i] = 1;
      }
    } else {
      // tukey — cosine-tapered
      if (i < attackSamples) {
        const denom = attackSamples > 1 ? attackSamples - 1 : 1;
        window[i] = 0.5 * (1 - Math.cos((Math.PI * i) / denom));
      } else if (i >= sustainEnd) {
        const denom = releaseSamples > 1 ? releaseSamples - 1 : 1;
        window[i] = 0.5 * (1 - Math.cos((Math.PI * (length - 1 - i)) / denom));
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

/** Simple seeded PRNG for deterministic scatter (xorshift32). */
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
  startTime: number;
}

interface GrainWindowCache {
  size: number;
  shape: GrainEnvelopeShape;
  attackFrac: number;
  releaseFrac: number;
  data: Float32Array;
}

interface GranularInstance {
  audioBuffer: AudioBuffer;
  audioKey: string;
  settings: GranularSettings;
  output: GainNode;
  voices: Map<number, GranularVoice[]>;
  /** Cached grain window (invalidated on settings change). */
  grainWindowCache: GrainWindowCache | null;
}

// ── Engine ───────────────────────────────────────────────────────────────────

class GranularEngine {
  private instances = new Map<string, GranularInstance>();
  private readonly bufferCache = new Map<string, AudioBuffer>();

  private getContext(): AudioContext {
    // Route through AudioEngine rather than Tone.getContext() —
    // both return the same underlying AudioContext (AudioEngine's
    // constructor calls Tone.setContext(ctx) on its own Web Audio
    // context). Codex verified the shared-context invariant in
    // PR #1727. Phase 5D migration.
    return getAudioEngine().ctx;
  }

  async ensureStarted(): Promise<void> {
    // Cache the engine handle into a local — `getAudioEngine()` is
    // a singleton accessor today but taking it once is cheaper and
    // robust against future changes (Copilot review on PR #1729).
    const engine = getAudioEngine();
    if (engine.ctx.state !== 'running') {
      await engine.resume();
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
      existing.grainWindowCache = null; // invalidate cache
      existing.output.gain.value = settings.gain;
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
      grainWindowCache: null,
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
    instance.grainWindowCache = null; // invalidate cache
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
    const audioKey = instance.audioKey;
    this._disposeInstance(instance);
    this.instances.delete(trackId);
    // Evict buffer cache if no other instance references this audioKey
    let stillReferenced = false;
    for (const other of this.instances.values()) {
      if (other.audioKey === audioKey) {
        stillReferenced = true;
        break;
      }
    }
    if (!stillReferenced) {
      this.bufferCache.delete(audioKey);
    }
  }

  setParameter(trackId: string, name: string, value: number | string | boolean): void {
    const instance = this.instances.get(trackId);
    if (!instance) return;

    if (name in instance.settings) {
      (instance.settings as unknown as Record<string, unknown>)[name] = value;
      instance.grainWindowCache = null;
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
    for (const instance of this.instances.values()) {
      this._disposeInstance(instance);
    }
    this.instances.clear();
    this.bufferCache.clear();
  }

  // ── Grain Scheduling ─────────────────────────────────────────────────────

  private _scheduleGrain(instance: GranularInstance, voice: GranularVoice): void {
    const ctx = this.getContext();
    const { settings, audioBuffer } = instance;
    const sampleRate = audioBuffer.sampleRate;
    const bufferLength = audioBuffer.length;

    // Calculate grain size in samples — clamp to buffer length for short buffers
    const grainSizeSamples = Math.min(
      bufferLength,
      Math.max(64, Math.round((settings.grainSize / 1000) * sampleRate)),
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

    // Reuse the original buffer — apply grain envelope via GainNode
    // to avoid per-grain AudioBuffer allocations and sample copies.
    const grainOffsetSeconds = startSample / sampleRate;
    const grainDurationSeconds = grainSizeSamples / sampleRate;
    const clampedRate = Math.max(0.01, playbackRate);
    // Wall-clock duration accounts for playback rate
    const grainDurationSec = grainDurationSeconds / clampedRate;
    const window = this._getGrainWindow(instance, grainSizeSamples);

    // Create source node for this grain
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.playbackRate.value = clampedRate;

    // Apply grain envelope via GainNode + setValueCurveAtTime
    // Use wall-clock duration so envelope matches actual audible grain length
    const grainGain = ctx.createGain();
    grainGain.gain.value = 0;
    grainGain.gain.setValueCurveAtTime(window, ctx.currentTime, grainDurationSec);

    // Apply stereo spread via stereo panner
    const panner = ctx.createStereoPanner();
    const panValue = (seededRandom() - 0.5) * 2 * settings.spread;
    panner.pan.value = clamp(panValue, -1, 1);

    source.connect(grainGain);
    grainGain.connect(panner);
    panner.connect(voice.output);

    voice.activeGrains.add(source);

    source.start(ctx.currentTime, grainOffsetSeconds, grainDurationSeconds);
    source.stop(ctx.currentTime + grainDurationSec + 0.005);

    source.onended = () => {
      voice.activeGrains.delete(source);
      try {
        source.disconnect();
        grainGain.disconnect();
        panner.disconnect();
      } catch {
        // Already disconnected
      }
    };
  }

  private _getGrainWindow(instance: GranularInstance, grainSizeSamples: number): Float32Array {
    const { envelopeShape, grainAttack, grainRelease } = instance.settings;
    const cached = instance.grainWindowCache;
    if (
      cached &&
      cached.size === grainSizeSamples &&
      cached.shape === envelopeShape &&
      cached.attackFrac === grainAttack &&
      cached.releaseFrac === grainRelease
    ) {
      return cached.data;
    }
    const data = buildGrainWindow(grainSizeSamples, envelopeShape, grainAttack, grainRelease);
    instance.grainWindowCache = { size: grainSizeSamples, shape: envelopeShape, attackFrac: grainAttack, releaseFrac: grainRelease, data };
    return data;
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

    // Fade out — use cancelAndHoldAtTime when available to avoid gain clicks
    const ctx = this.getContext();
    const now = ctx.currentTime;
    const releaseEnd = now + Math.max(0.01, release);
    const gainParam = voice.output.gain;
    const holdable = gainParam as AudioParam & {
      cancelAndHoldAtTime?: (cancelTime: number) => void;
    };
    if (typeof holdable.cancelAndHoldAtTime === 'function') {
      holdable.cancelAndHoldAtTime(now);
    } else {
      gainParam.cancelScheduledValues(now);
      gainParam.setValueAtTime(Math.max(0.0001, gainParam.value), now);
    }
    gainParam.linearRampToValueAtTime(0.0001, releaseEnd);

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
