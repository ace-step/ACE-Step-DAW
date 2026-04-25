/**
 * Karplus-Strong physical model synthesis engine.
 *
 * Phase 5M migration: drops Tone.PluckSynth in favour of a local
 * `NativePluckVoice` that implements the Karplus-Strong algorithm
 * in JS and plays the result through an `AudioBufferSourceNode`.
 *
 * The KS loop: initialize a circular delay line (length = sampleRate
 * / freq) with shaped noise, then iterate `delay[n] = lowpass(noise) *
 * feedback`. Output is written to an `AudioBuffer` up to `DECAY_SECONDS`
 * which is sufficient for the resonance range used by the presets.
 *
 * Parameter semantics preserved from the Tone.PluckSynth wrappers:
 *   - `attackNoise` scales the initial delay-line noise amplitude.
 *   - `dampening` is the lowpass cutoff in the feedback path (Hz).
 *   - `resonance` is the feedback multiplier (0..1; higher → longer decay).
 */
import type { PhysicalModelSettings, PhysicalExciterType, PhysicalModelPreset } from '../types/project';
import { getAudioEngine } from '../hooks/useAudioEngine';
import { midiToFrequency } from '../utils/pitch';

/** Number of polyphonic voices (self-decaying, so overlap is common). */
const VOICE_COUNT = 8;
/** Maximum audible tail — keeps the pre-computed buffer bounded. */
const DECAY_SECONDS = 5;

// ─── NativePluckVoice ────────────────────────────────────────────────────

class NativePluckVoice {
  attackNoise = 1;
  dampening = 4000; // Hz — lowpass cutoff in feedback path
  resonance = 0.9; // 0..1 feedback gain
  private _currentSource: AudioBufferSourceNode | null = null;

  constructor(
    private readonly _ctx: AudioContext,
    private readonly _output: AudioNode,
  ) {}

  triggerAttack(freq: number, time: number): void {
    const sampleRate = this._ctx.sampleRate;
    const totalSamples = Math.max(1, Math.ceil(sampleRate * DECAY_SECONDS));
    const N = Math.max(2, Math.round(sampleRate / Math.max(20, freq)));

    // Initialize delay line with shaped noise.
    const delay = new Float32Array(N);
    const noiseScale = Math.min(1, Math.max(0, this.attackNoise));
    for (let i = 0; i < N; i++) {
      delay[i] = (Math.random() * 2 - 1) * noiseScale;
    }

    // One-pole lowpass coefficient: y[n] = (1-a) * x[n] + a * y[n-1].
    const cutoff = Math.max(20, this.dampening);
    const a = Math.exp(-2 * Math.PI * cutoff / sampleRate);
    // Resonance caps at < 1 to guarantee decay.
    const feedback = Math.min(0.999, Math.max(0, this.resonance));

    // Render the KS loop into an AudioBuffer.
    const buf = this._ctx.createBuffer(1, totalSamples, sampleRate);
    const data = buf.getChannelData(0);
    let lp = 0;
    let idx = 0;
    for (let i = 0; i < totalSamples; i++) {
      const sample = delay[idx];
      data[i] = sample;
      lp = (1 - a) * sample + a * lp;
      delay[idx] = lp * feedback;
      idx = (idx + 1) % N;
    }

    // Replace any currently-playing source (trigger re-excites the voice).
    if (this._currentSource) {
      try { this._currentSource.stop(); } catch { /* already stopped */ }
      try { this._currentSource.disconnect(); } catch { /* already disconnected */ }
      this._currentSource = null;
    }

    const source = this._ctx.createBufferSource();
    source.buffer = buf;
    source.connect(this._output);
    source.onended = () => {
      try { source.disconnect(); } catch { /* already disconnected */ }
      if (this._currentSource === source) this._currentSource = null;
    };
    source.start(time);
    this._currentSource = source;
  }

  dispose(): void {
    if (this._currentSource) {
      try { this._currentSource.stop(); } catch { /* already stopped */ }
      try { this._currentSource.disconnect(); } catch { /* already disconnected */ }
      this._currentSource = null;
    }
  }
}

// ─── Presets ────────────────────────────────────────────────────────────────

export const PHYSICAL_PRESETS: Record<PhysicalModelPreset, PhysicalModelSettings> = {
  'acoustic-guitar': {
    exciter: 'pluck',
    damping: 0.3,
    brightness: 0.6,
    pluckPosition: 0.4,
    bodySize: 0.5,
    outputGain: -5,
  },
  'harp': {
    exciter: 'pluck',
    damping: 0.15,
    brightness: 0.8,
    pluckPosition: 0.3,
    bodySize: 0.3,
    outputGain: -5,
  },
  'kalimba': {
    exciter: 'hammer',
    damping: 0.4,
    brightness: 0.9,
    pluckPosition: 0.1,
    bodySize: 0.6,
    outputGain: -5,
  },
  'marimba': {
    exciter: 'hammer',
    damping: 0.5,
    brightness: 0.5,
    pluckPosition: 0.5,
    bodySize: 0.7,
    outputGain: -5,
  },
  'steel-drum': {
    exciter: 'hammer',
    damping: 0.25,
    brightness: 0.7,
    pluckPosition: 0.6,
    bodySize: 0.8,
    outputGain: -5,
  },
  'custom': {
    exciter: 'pluck',
    damping: 0.3,
    brightness: 0.5,
    pluckPosition: 0.5,
    bodySize: 0.4,
    outputGain: -5,
  },
};

// ─── Helpers ─────────────────────────────────────────────────────────────

function exciterToAttackNoise(exciter: PhysicalExciterType): number {
  switch (exciter) {
    case 'pluck': return 1;
    case 'bow': return 4;
    case 'hammer': return 0.5;
    default: return 1;
  }
}

function settingsToPluckParams(settings: PhysicalModelSettings) {
  const pos = Math.max(0, Math.min(1, settings.pluckPosition));
  const edgeFactor = Math.abs(pos - 0.5) * 2;
  const effectiveBrightness = Math.min(1, Math.max(0, settings.brightness * (0.8 + edgeFactor * 0.4)));
  const effectiveResonance = Math.min(1, Math.max(0, (1 - settings.damping) * (0.9 + edgeFactor * 0.2)));

  return {
    attackNoise: exciterToAttackNoise(settings.exciter),
    dampening: 1000 + effectiveBrightness * 14000,
    resonance: effectiveResonance,
  };
}

function dBToLinear(dB: number): number {
  return Math.pow(10, dB / 20);
}

// ─── Engine ────────────────────────────────────────────────────────────────

interface KarplusInstance {
  synths: NativePluckVoice[];
  nextVoice: number;
  filter: BiquadFilterNode;
  bodyFilter: BiquadFilterNode;
  bodyWetGain: GainNode;
  output: GainNode;
  settings: PhysicalModelSettings;
}

class KarplusStrongEngine {
  private instances = new Map<string, KarplusInstance>();

  async ensureStarted() {
    const engine = getAudioEngine();
    if (engine?.ctx?.state && engine.ctx.state !== 'running') {
      await engine.resume();
    }
  }

  async ensureTrack(
    trackId: string,
    settings: PhysicalModelSettings,
    connectTo?: AudioNode,
  ): Promise<KarplusInstance> {
    await this.ensureStarted();

    const existing = this.instances.get(trackId);
    if (existing) {
      this._updateSettings(existing, settings);
      return existing;
    }

    const instance = this._createInstance(settings, connectTo);
    this.instances.set(trackId, instance);
    return instance;
  }

  noteOn(trackId: string, pitch: number, velocity = 100) {
    this._lazyInit(trackId);
    const instance = this.instances.get(trackId);
    if (!instance) return;
    const freq = midiToFrequency(pitch);
    const vel = Math.max(0, Math.min(127, velocity)) / 127;

    const voiceIdx = instance.nextVoice % instance.synths.length;
    instance.nextVoice = (instance.nextVoice + 1) % instance.synths.length;
    const synth = instance.synths[voiceIdx];

    const ctx = getAudioEngine().ctx;
    const now = ctx.currentTime;
    const baseGain = dBToLinear(instance.settings.outputGain);

    // Velocity ramp: briefly scale output, then restore base gain.
    const outGain = instance.output.gain;
    if (typeof outGain.cancelAndHoldAtTime === 'function') {
      outGain.cancelAndHoldAtTime(now);
    } else {
      outGain.cancelScheduledValues(now);
    }
    outGain.setValueAtTime(baseGain * vel, now);
    outGain.linearRampToValueAtTime(baseGain, now + 0.05);

    synth.triggerAttack(freq, now);
  }

  noteOff(_trackId: string, _pitch: number) {
    // KS notes self-decay — no explicit release needed.
  }

  triggerAttackRelease(trackId: string, pitch: number, _duration: number, velocity = 1) {
    // Self-decaying; duration is ignored. Velocity preserved.
    this.noteOn(trackId, pitch, Math.round(velocity * 127));
  }

  setParameter(trackId: string, name: string, value: number | string | boolean) {
    const instance = this.instances.get(trackId);
    if (!instance) return;

    switch (name) {
      case 'damping':
        instance.settings.damping = value as number;
        for (const s of instance.synths) s.resonance = 1 - (value as number);
        break;
      case 'brightness':
        instance.settings.brightness = value as number;
        for (const s of instance.synths) s.dampening = 1000 + (value as number) * 14000;
        instance.filter.frequency.value = 500 + (value as number) * 19500;
        break;
      case 'exciter':
        instance.settings.exciter = value as PhysicalExciterType;
        for (const s of instance.synths) s.attackNoise = exciterToAttackNoise(value as PhysicalExciterType);
        break;
      case 'pluckPosition': {
        instance.settings.pluckPosition = value as number;
        const params = settingsToPluckParams(instance.settings);
        for (const s of instance.synths) {
          s.dampening = params.dampening;
          s.resonance = params.resonance;
        }
        break;
      }
      case 'bodySize': {
        const bs = value as number;
        instance.settings.bodySize = bs;
        instance.bodyFilter.frequency.value = 200 + bs * 2000;
        instance.bodyFilter.Q.value = 1 + bs * 5;
        instance.bodyWetGain.gain.value = bs;
        break;
      }
      case 'outputGain':
        instance.settings.outputGain = value as number;
        instance.output.gain.value = dBToLinear(value as number);
        break;
    }
  }

  releaseAll() {
    // KS notes self-decay.
  }

  removeTrack(trackId: string) {
    const instance = this.instances.get(trackId);
    if (!instance) return;
    this._disposeInstance(instance);
    this.instances.delete(trackId);
  }

  dispose() {
    for (const trackId of [...this.instances.keys()]) {
      this.removeTrack(trackId);
    }
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  /** Lazily create instance with defaults if noteOn arrives before ensureTrack. */
  private _lazyInit(trackId: string) {
    if (!this.instances.has(trackId)) {
      const instance = this._createInstance({ ...PHYSICAL_PRESETS['custom'] });
      this.instances.set(trackId, instance);
    }
  }

  private _createInstance(
    settings: PhysicalModelSettings,
    connectTo?: AudioNode,
  ): KarplusInstance {
    const ctx = getAudioEngine().ctx;
    const params = settingsToPluckParams(settings);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 500 + settings.brightness * 19500;
    filter.Q.value = 0.7;

    const bodyFilter = ctx.createBiquadFilter();
    bodyFilter.type = 'bandpass';
    bodyFilter.frequency.value = 200 + settings.bodySize * 2000;
    bodyFilter.Q.value = 1 + settings.bodySize * 5;

    const bodyWetGain = ctx.createGain();
    bodyWetGain.gain.value = settings.bodySize;

    const output = ctx.createGain();
    output.gain.value = dBToLinear(settings.outputGain);

    // Chain: each voice → filter → output (dry) + filter → bodyFilter → bodyWetGain → output (wet)
    const synths: NativePluckVoice[] = [];
    for (let i = 0; i < VOICE_COUNT; i++) {
      const voice = new NativePluckVoice(ctx, filter);
      voice.attackNoise = params.attackNoise;
      voice.dampening = params.dampening;
      voice.resonance = params.resonance;
      synths.push(voice);
    }
    filter.connect(output);
    filter.connect(bodyFilter);
    bodyFilter.connect(bodyWetGain);
    bodyWetGain.connect(output);

    if (connectTo) {
      output.connect(connectTo);
    } else {
      output.connect(ctx.destination);
    }

    return {
      synths,
      nextVoice: 0,
      filter,
      bodyFilter,
      bodyWetGain,
      output,
      settings: { ...settings },
    };
  }

  private _updateSettings(instance: KarplusInstance, settings: PhysicalModelSettings) {
    const params = settingsToPluckParams(settings);
    for (const synth of instance.synths) {
      synth.attackNoise = params.attackNoise;
      synth.dampening = params.dampening;
      synth.resonance = params.resonance;
    }
    instance.filter.frequency.value = 500 + settings.brightness * 19500;
    instance.bodyFilter.frequency.value = 200 + settings.bodySize * 2000;
    instance.bodyFilter.Q.value = 1 + settings.bodySize * 5;
    instance.bodyWetGain.gain.value = settings.bodySize;
    instance.output.gain.value = dBToLinear(settings.outputGain);
    instance.settings = { ...settings };
  }

  private _disposeInstance(instance: KarplusInstance) {
    for (const s of instance.synths) s.dispose();
    try { instance.filter.disconnect(); } catch { /* already disconnected */ }
    try { instance.bodyFilter.disconnect(); } catch { /* already disconnected */ }
    try { instance.bodyWetGain.disconnect(); } catch { /* already disconnected */ }
    try { instance.output.disconnect(); } catch { /* already disconnected */ }
  }
}

export const karplusStrongEngine = new KarplusStrongEngine();
