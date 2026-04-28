/**
 * @deprecated Use {@link InstrumentEngine} via {@link getEngineForInstrument} instead.
 * This module will be removed once all call-sites migrate to the unified interface.
 *
 * Phase 5L migration: swapped Tone wrappers for native Web Audio
 * primitives. Mapping:
 *   Tone.PolySynth(Tone.Synth, …)   → NativeBasicPolySynth (local class)
 *   Tone.FMSynth                    → NativeFmSynth (local class)
 *   Tone.Filter                     → BiquadFilterNode
 *   Tone.FrequencyEnvelope          → NativeFrequencyEnvelope (local helper)
 *   Tone.Panner                     → StereoPannerNode
 *   Tone.Gain                       → GainNode
 *   Tone.Frequency(midi).toFrequency → midiToFrequency
 *
 * The local synth classes overlap with 5K's `NativeSubtractiveSynth`
 * but intentionally stay inline — this file is deprecated, and
 * consolidating before deletion would just churn.
 */
import type {
  SynthPreset,
  FilterEnvelope,
  FmInstrumentSettings,
  UnisonSettings,
  InstrumentEnvelope,
} from '../types/project';
import { getAudioEngine } from '../hooks/useAudioEngine';
import { midiToFrequency } from '../utils/pitch';

// ─── NativeBasicPolySynth ────────────────────────────────────────────────

interface BasicVoice {
  osc: OscillatorNode | null;
  gain: GainNode;
  freq: number | null;
}

interface BasicEnvelope {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
}

interface BasicSynthOptions {
  oscillator?: { type?: OscillatorType };
  envelope?: Partial<BasicEnvelope>;
  portamento?: number;
  detune?: number;
}

class NativeBasicPolySynth {
  private readonly _ctx: AudioContext;
  private readonly _output: GainNode;
  private readonly _voices: BasicVoice[] = [];
  private readonly _maxPoly: number;
  private _nextVoice = 0;
  private readonly _freqToVoice = new Map<number, number>();
  private _envelope: BasicEnvelope = { attack: 0.01, decay: 0.1, sustain: 0.7, release: 0.3 };
  private _oscType: OscillatorType = 'triangle';
  private _portamento = 0;
  private _detuneCents = 0;
  private _lastFreq: number | null = null;

  constructor(ctx: AudioContext, maxPolyphony = 8) {
    this._ctx = ctx;
    this._maxPoly = maxPolyphony;
    this._output = ctx.createGain();
    for (let i = 0; i < this._maxPoly; i++) {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(this._output);
      this._voices.push({ osc: null, gain, freq: null });
    }
  }

  get outputNode(): GainNode {
    return this._output;
  }

  /**
   * Convenience forwarder — offlineRender.ts (still on Tone in 5L)
   * calls `synth.connect(gain)` expecting the engine-style API. Once
   * offlineRender migrates in 5O this can go away.
   */
  connect(dest: AudioNode): AudioNode {
    this._output.connect(dest);
    return dest;
  }

  disconnect(): void {
    try { this._output.disconnect(); } catch { /* already disconnected */ }
  }

  set(options: BasicSynthOptions): void {
    if (options.oscillator?.type) {
      this._oscType = options.oscillator.type;
      for (const voice of this._voices) {
        if (voice.osc) voice.osc.type = this._oscType;
      }
    }
    if (options.envelope) {
      this._envelope = { ...this._envelope, ...options.envelope };
    }
    if (options.portamento !== undefined) {
      this._portamento = Math.max(0, options.portamento);
    }
    if (options.detune !== undefined) {
      this._detuneCents = options.detune;
      for (const voice of this._voices) {
        if (voice.osc) voice.osc.detune.value = options.detune;
      }
    }
  }

  private _allocVoice(freq: number): BasicVoice {
    const existing = this._freqToVoice.get(freq);
    if (existing !== undefined) return this._voices[existing];
    const idx = this._nextVoice % this._maxPoly;
    this._nextVoice++;
    for (const [f, vi] of this._freqToVoice) {
      if (vi === idx) { this._freqToVoice.delete(f); break; }
    }
    this._freqToVoice.set(freq, idx);
    return this._voices[idx];
  }

  triggerAttack(freq: number, time?: number, velocity = 1): void {
    const t = time ?? this._ctx.currentTime;
    const voice = this._allocVoice(freq);
    const env = this._envelope;

    if (voice.osc) {
      try { voice.osc.stop(t); } catch { /* already stopped */ }
      try { voice.osc.disconnect(); } catch { /* already disconnected */ }
    }

    const osc = this._ctx.createOscillator();
    // 'triangle8' isn't a native OscillatorType; fall back to 'triangle'.
    osc.type = (this._oscType as string) === 'triangle8' ? 'triangle' : this._oscType;
    osc.detune.value = this._detuneCents;

    if (this._portamento > 0 && this._lastFreq !== null && this._lastFreq !== freq) {
      osc.frequency.setValueAtTime(this._lastFreq, t);
      osc.frequency.linearRampToValueAtTime(freq, t + this._portamento);
    } else {
      osc.frequency.setValueAtTime(freq, t);
    }
    osc.connect(voice.gain);

    voice.gain.gain.cancelScheduledValues(t);
    voice.gain.gain.setValueAtTime(0, t);
    voice.gain.gain.linearRampToValueAtTime(velocity, t + env.attack);
    voice.gain.gain.linearRampToValueAtTime(velocity * env.sustain, t + env.attack + env.decay);

    osc.start(t);
    voice.osc = osc;
    voice.freq = freq;
    this._lastFreq = freq;
  }

  triggerRelease(freq: number, time?: number): void {
    const idx = this._freqToVoice.get(freq);
    if (idx === undefined) return;
    const voice = this._voices[idx];
    if (!voice.osc) return;

    const t = time ?? this._ctx.currentTime;
    const env = this._envelope;
    const gainParam = voice.gain.gain;
    if (typeof gainParam.cancelAndHoldAtTime === 'function') {
      gainParam.cancelAndHoldAtTime(t);
    } else {
      gainParam.cancelScheduledValues(t);
      gainParam.setValueAtTime(gainParam.value, t);
    }
    gainParam.linearRampToValueAtTime(0, t + env.release);

    const osc = voice.osc;
    osc.onended = () => { try { osc.disconnect(); } catch { /* already disconnected */ } };
    try { osc.stop(t + env.release + 0.01); } catch { /* already stopped */ }

    voice.osc = null;
    voice.freq = null;
    this._freqToVoice.delete(freq);
  }

  triggerAttackRelease(freq: number, duration: number, time?: number, velocity = 1): void {
    const t = time ?? this._ctx.currentTime;
    this.triggerAttack(freq, t, velocity);
    this.triggerRelease(freq, t + duration);
  }

  releaseAll(time?: number): void {
    const t = time ?? this._ctx.currentTime;
    for (const f of [...this._freqToVoice.keys()]) {
      this.triggerRelease(f, t);
    }
  }

  dispose(): void {
    for (const voice of this._voices) {
      if (voice.osc) {
        try { voice.osc.stop(); } catch { /* already stopped */ }
        try { voice.osc.disconnect(); } catch { /* already disconnected */ }
        voice.osc = null;
      }
      try { voice.gain.disconnect(); } catch { /* already disconnected */ }
    }
    try { this._output.disconnect(); } catch { /* already disconnected */ }
    this._voices.length = 0;
    this._freqToVoice.clear();
  }
}

// ─── NativeFmSynth ───────────────────────────────────────────────────────

interface NativeFmOptions {
  modulationIndex?: number;
  harmonicity?: number;
  oscillator?: { type?: OscillatorType };
  modulation?: { type?: OscillatorType };
  envelope?: Partial<BasicEnvelope>;
}

/**
 * Simple single-operator FM synth (monophonic — matches Tone.FMSynth's
 * mono-by-default behaviour). Modulator frequency is `carrierFreq *
 * harmonicity`, modulator output scaled by `carrierFreq *
 * modulationIndex` and routed to the carrier's `frequency` param.
 */
class NativeFmSynth {
  private readonly _ctx: AudioContext;
  private readonly _output: GainNode;
  private _carrier: OscillatorNode | null = null;
  private _modulator: OscillatorNode | null = null;
  private _modGain: GainNode | null = null;
  private _envGain: GainNode | null = null;
  private _oscType: OscillatorType = 'sine';
  private _modType: OscillatorType = 'sine';
  private _modIndex = 10;
  private _harmonicity = 3;
  private _envelope: BasicEnvelope = { attack: 0.01, decay: 0.1, sustain: 0.7, release: 0.3 };

  constructor(ctx: AudioContext) {
    this._ctx = ctx;
    this._output = ctx.createGain();
  }

  get outputNode(): GainNode {
    return this._output;
  }

  set(options: NativeFmOptions): void {
    if (options.oscillator?.type) this._oscType = options.oscillator.type;
    if (options.modulation?.type) this._modType = options.modulation.type;
    if (options.modulationIndex !== undefined) this._modIndex = options.modulationIndex;
    if (options.harmonicity !== undefined) this._harmonicity = options.harmonicity;
    if (options.envelope) this._envelope = { ...this._envelope, ...options.envelope };
  }

  private _stopActive(t: number): void {
    if (this._carrier) {
      try { this._carrier.stop(t); } catch { /* already stopped */ }
      try { this._carrier.disconnect(); } catch { /* already disconnected */ }
      this._carrier = null;
    }
    if (this._modulator) {
      try { this._modulator.stop(t); } catch { /* already stopped */ }
      try { this._modulator.disconnect(); } catch { /* already disconnected */ }
      this._modulator = null;
    }
    if (this._modGain) {
      try { this._modGain.disconnect(); } catch { /* already disconnected */ }
      this._modGain = null;
    }
    if (this._envGain) {
      try { this._envGain.disconnect(); } catch { /* already disconnected */ }
      this._envGain = null;
    }
  }

  triggerAttack(freq: number, time?: number, velocity = 1): void {
    const t = time ?? this._ctx.currentTime;
    this._stopActive(t);

    const carrier = this._ctx.createOscillator();
    carrier.type = this._oscType;
    carrier.frequency.value = freq;

    const modulator = this._ctx.createOscillator();
    modulator.type = this._modType;
    modulator.frequency.value = freq * this._harmonicity;

    const modGain = this._ctx.createGain();
    modGain.gain.value = freq * this._modIndex;
    modulator.connect(modGain);
    modGain.connect(carrier.frequency);

    const envGain = this._ctx.createGain();
    carrier.connect(envGain);
    envGain.connect(this._output);

    const env = this._envelope;
    envGain.gain.setValueAtTime(0, t);
    envGain.gain.linearRampToValueAtTime(velocity, t + env.attack);
    envGain.gain.linearRampToValueAtTime(velocity * env.sustain, t + env.attack + env.decay);

    carrier.start(t);
    modulator.start(t);
    this._carrier = carrier;
    this._modulator = modulator;
    this._modGain = modGain;
    this._envGain = envGain;
  }

  triggerRelease(time?: number): void {
    const t = time ?? this._ctx.currentTime;
    const env = this._envelope;
    if (this._envGain) {
      const g = this._envGain.gain;
      if (typeof g.cancelAndHoldAtTime === 'function') {
        g.cancelAndHoldAtTime(t);
      } else {
        g.cancelScheduledValues(t);
        g.setValueAtTime(g.value, t);
      }
      g.linearRampToValueAtTime(0, t + env.release);
    }
    if (this._carrier) {
      try { this._carrier.stop(t + env.release + 0.01); } catch { /* already stopped */ }
      this._carrier = null;
    }
    if (this._modulator) {
      try { this._modulator.stop(t + env.release + 0.01); } catch { /* already stopped */ }
      this._modulator = null;
    }
  }

  triggerAttackRelease(freq: number, duration: number, time?: number, velocity = 1): void {
    const t = time ?? this._ctx.currentTime;
    this.triggerAttack(freq, t, velocity);
    this.triggerRelease(t + duration);
  }

  dispose(): void {
    this._stopActive(this._ctx.currentTime);
    try { this._output.disconnect(); } catch { /* already disconnected */ }
  }
}

// ─── NativeFrequencyEnvelope ─────────────────────────────────────────────

/**
 * Schedules ramps on an `AudioParam` to mimic Tone.FrequencyEnvelope:
 * filter freq = baseFrequency at rest, attacks up to
 * `baseFrequency * 2^octaves`, decays to a sustain fraction of that
 * peak, and releases back to baseFrequency.
 */
class NativeFrequencyEnvelope {
  private readonly _param: AudioParam;
  private readonly _ctx: AudioContext;
  private readonly _options: FilterEnvelope;

  constructor(ctx: AudioContext, param: AudioParam, options: FilterEnvelope) {
    this._ctx = ctx;
    this._param = param;
    this._options = options;
    param.value = options.baseFrequency;
  }

  triggerAttack(time?: number): void {
    const t = time ?? this._ctx.currentTime;
    const { baseFrequency, octaves, attack, decay, sustain } = this._options;
    const peak = baseFrequency * Math.pow(2, octaves);
    const sustained = baseFrequency * Math.pow(2, octaves * sustain);
    const g = this._param;
    if (typeof g.cancelAndHoldAtTime === 'function') {
      g.cancelAndHoldAtTime(t);
    } else {
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
    }
    g.linearRampToValueAtTime(peak, t + attack);
    g.linearRampToValueAtTime(sustained, t + attack + decay);
  }

  triggerRelease(time?: number): void {
    const t = time ?? this._ctx.currentTime;
    const { baseFrequency, release } = this._options;
    const g = this._param;
    if (typeof g.cancelAndHoldAtTime === 'function') {
      g.cancelAndHoldAtTime(t);
    } else {
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
    }
    g.linearRampToValueAtTime(baseFrequency, t + release);
  }

  triggerAttackRelease(duration: number, time?: number): void {
    const t = time ?? this._ctx.currentTime;
    this.triggerAttack(t);
    this.triggerRelease(t + duration);
  }

  dispose(): void {
    // No persistent nodes to tear down — this helper just automates
    // the caller-owned AudioParam.
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function getPresetEnvelope(preset: SynthPreset): InstrumentEnvelope {
  switch (preset) {
    case 'piano':   return { attack: 0.005, decay: 0.3,  sustain: 0.2, release: 1.2 };
    case 'strings': return { attack: 0.4,   decay: 0.2,  sustain: 0.8, release: 1.5 };
    case 'pad':     return { attack: 0.8,   decay: 0.5,  sustain: 0.9, release: 2.0 };
    case 'lead':    return { attack: 0.01,  decay: 0.1,  sustain: 0.6, release: 0.3 };
    case 'bass':    return { attack: 0.01,  decay: 0.2,  sustain: 0.4, release: 0.5 };
    case 'organ':   return { attack: 0.01,  decay: 0.01, sustain: 1,   release: 0.1 };
    default:        return { attack: 0.01,  decay: 0.1,  sustain: 0.7, release: 0.3 };
  }
}

function getPresetOscType(preset: SynthPreset): OscillatorType {
  switch (preset) {
    case 'piano':   return 'triangle';  // 'triangle8' is Tone-only; triangle is closest native
    case 'strings': return 'sawtooth';
    case 'pad':     return 'sine';
    case 'lead':    return 'square';
    case 'bass':    return 'sawtooth';
    case 'organ':   return 'sine';
    default:        return 'triangle';
  }
}

/**
 * @deprecated Use {@link InstrumentEngine} via {@link getEngineForInstrument} instead.
 *
 * Accepts an optional context so offline-render callers (which use an
 * `OfflineAudioContext`) can opt out of the default live engine ctx.
 */
export function createSynthForPreset(
  preset: SynthPreset,
  ctx?: BaseAudioContext,
): NativeBasicPolySynth {
  const audioCtx = (ctx ?? getAudioEngine().ctx) as AudioContext;
  const synth = new NativeBasicPolySynth(audioCtx);
  synth.set({
    oscillator: { type: getPresetOscType(preset) },
    envelope: getPresetEnvelope(preset),
  });
  return synth;
}

// ─── Unison helpers ──────────────────────────────────────────────────────

function computeUnisonOffsets(
  extraVoiceCount: number,
  detuneCents: number,
  spread: number,
): Array<{ detune: number; pan: number }> {
  if (extraVoiceCount <= 0) return [];
  const offsets: Array<{ detune: number; pan: number }> = [];
  for (let i = 0; i < extraVoiceCount; i++) {
    const t = extraVoiceCount === 1 ? 0 : (2 * i) / (extraVoiceCount - 1) - 1;
    offsets.push({ detune: t * detuneCents, pan: t * spread });
  }
  return offsets;
}

/** FmParamsEqual — check if two FmInstrumentSettings are identical. */
function fmParamsEqual(a: FmInstrumentSettings, b: FmInstrumentSettings): boolean {
  return (
    a.modulationIndex === b.modulationIndex &&
    a.harmonicity === b.harmonicity &&
    a.feedback === b.feedback &&
    a.algorithm === b.algorithm &&
    a.outputGain === b.outputGain &&
    a.carrier.waveform === b.carrier.waveform &&
    a.carrier.ratio === b.carrier.ratio &&
    a.carrier.level === b.carrier.level &&
    a.modulator.waveform === b.modulator.waveform &&
    a.modulator.ratio === b.modulator.ratio &&
    a.modulator.level === b.modulator.level &&
    a.ampEnvelope.attack === b.ampEnvelope.attack &&
    a.ampEnvelope.decay === b.ampEnvelope.decay &&
    a.ampEnvelope.sustain === b.ampEnvelope.sustain &&
    a.ampEnvelope.release === b.ampEnvelope.release
  );
}

export function buildFmSynthOptions(params: FmInstrumentSettings): NativeFmOptions {
  const { carrier, modulator, modulationIndex, harmonicity, feedback, algorithm, ampEnvelope } = params;
  const base: NativeFmOptions = {
    modulationIndex,
    harmonicity,
    oscillator: { type: carrier.waveform as OscillatorType },
    modulation: { type: modulator.waveform as OscillatorType },
    envelope: {
      attack: ampEnvelope.attack,
      decay: ampEnvelope.decay,
      sustain: ampEnvelope.sustain,
      release: ampEnvelope.release,
    },
  };

  switch (algorithm) {
    case 'serial':
      break;
    case 'parallel':
      base.modulationIndex = modulationIndex * 0.3;
      break;
    case 'stack':
      base.modulationIndex = modulationIndex * 1.5;
      base.harmonicity = harmonicity * 0.5;
      break;
    case 'feedback':
      base.modulationIndex = modulationIndex * (1 + feedback);
      break;
  }

  return base;
}

// ─── SynthEngine instance types ──────────────────────────────────────────

interface UnisonVoice {
  synth: NativeBasicPolySynth;
  panner: StereoPannerNode;
  gain: GainNode;
}

interface SynthInstance {
  synth: NativeBasicPolySynth;
  preset: SynthPreset;
  gain: GainNode;
  filter?: BiquadFilterNode;
  filterEnvelope?: NativeFrequencyEnvelope;
}

interface FmSynthInstance {
  synth: NativeFmSynth;
  params: FmInstrumentSettings;
  gain: GainNode;
  connectTo: AudioNode | undefined;
}

// ─── SynthEngine ─────────────────────────────────────────────────────────

/**
 * @deprecated Use {@link InstrumentEngine} via {@link getEngineForInstrument} instead.
 */
class SynthEngine {
  private synths = new Map<string, SynthInstance>();
  private fmSynths = new Map<string, FmSynthInstance>();
  private unisonVoices = new Map<string, UnisonVoice[]>();
  private previewSynth: NativeBasicPolySynth | null = null;
  private previewGain: GainNode | null = null;

  async ensureStarted() {
    const engine = getAudioEngine();
    if (engine?.ctx?.state && engine.ctx.state !== 'running') {
      await engine.resume();
    }
  }

  ensureTrackSynth(trackId: string, preset: SynthPreset, connectTo?: AudioNode): NativeBasicPolySynth {
    const existing = this.synths.get(trackId);
    if (existing && existing.preset === preset) return existing.synth;

    if (existing) {
      existing.synth.releaseAll();
      existing.synth.dispose();
      try { existing.gain.disconnect(); } catch { /* already disconnected */ }
      existing.filter && (() => { try { existing.filter!.disconnect(); } catch { /* noop */ } })();
      existing.filterEnvelope?.dispose();
    }

    const ctx = getAudioEngine().ctx;
    const synth = createSynthForPreset(preset);
    const gain = ctx.createGain();
    gain.gain.value = 0.55;
    synth.outputNode.connect(gain);
    if (connectTo) {
      gain.connect(connectTo);
    } else {
      gain.connect(ctx.destination);
    }
    this.synths.set(trackId, { synth, preset, gain });
    return synth;
  }

  /**
   * Apply a filter envelope to a track's synth signal chain.
   * Inserts a BiquadFilter between synth and gain, controlled by a NativeFrequencyEnvelope.
   * Pass null to remove the filter envelope.
   */
  setFilterEnvelope(trackId: string, envelope: FilterEnvelope | null): void {
    const instance = this.synths.get(trackId);
    if (!instance) return;
    const ctx = getAudioEngine().ctx;

    if (instance.filterEnvelope) {
      instance.filterEnvelope.dispose();
      instance.filterEnvelope = undefined;
    }
    if (instance.filter) {
      try { instance.synth.outputNode.disconnect(); } catch { /* noop */ }
      try { instance.filter.disconnect(); } catch { /* noop */ }
      instance.filter = undefined;
      instance.synth.outputNode.connect(instance.gain);
    }

    if (!envelope) return;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = envelope.baseFrequency;
    filter.Q.value = 2;

    const freqEnv = new NativeFrequencyEnvelope(ctx, filter.frequency, envelope);

    try { instance.synth.outputNode.disconnect(); } catch { /* noop */ }
    instance.synth.outputNode.connect(filter);
    filter.connect(instance.gain);

    instance.filter = filter;
    instance.filterEnvelope = freqEnv;
  }

  getFilterEnvelope(trackId: string): NativeFrequencyEnvelope | undefined {
    return this.synths.get(trackId)?.filterEnvelope;
  }

  getSynth(trackId: string): NativeBasicPolySynth | null {
    return this.synths.get(trackId)?.synth ?? null;
  }

  ensureFmSynth(trackId: string, params: FmInstrumentSettings, connectTo?: AudioNode): NativeFmSynth {
    const existing = this.fmSynths.get(trackId);
    if (existing && fmParamsEqual(existing.params, params)) {
      if (connectTo && connectTo !== existing.connectTo) {
        try { existing.gain.disconnect(); } catch { /* noop */ }
        existing.gain.connect(connectTo);
        existing.connectTo = connectTo;
      }
      return existing.synth;
    }

    if (existing) {
      existing.synth.dispose();
      try { existing.gain.disconnect(); } catch { /* noop */ }
    }

    const ctx = getAudioEngine().ctx;
    const synth = new NativeFmSynth(ctx);
    synth.set(buildFmSynthOptions(params));

    const gain = ctx.createGain();
    gain.gain.value = params.outputGain ?? 0.55;
    synth.outputNode.connect(gain);
    if (connectTo) {
      gain.connect(connectTo);
    } else {
      gain.connect(ctx.destination);
    }
    this.fmSynths.set(trackId, { synth, params, gain, connectTo });
    return synth;
  }

  getFmSynth(trackId: string): NativeFmSynth | null {
    return this.fmSynths.get(trackId)?.synth ?? null;
  }

  removeFmSynth(trackId: string) {
    const instance = this.fmSynths.get(trackId);
    if (!instance) return;
    instance.synth.dispose();
    try { instance.gain.disconnect(); } catch { /* noop */ }
    this.fmSynths.delete(trackId);
  }

  getUnisonVoices(trackId: string): UnisonVoice[] {
    return this.unisonVoices.get(trackId) ?? [];
  }

  applyUnison(trackId: string, settings: UnisonSettings): void {
    const instance = this.synths.get(trackId);
    if (!instance) return;
    this.disposeUnisonVoices(trackId);

    const extraCount = Math.max(0, settings.voices - 1);
    if (extraCount === 0) return;

    const ctx = getAudioEngine().ctx;
    const offsets = computeUnisonOffsets(extraCount, settings.detune, settings.spread);
    const voices: UnisonVoice[] = [];
    const perVoiceGain = 0.55 / (extraCount + 1);
    instance.gain.gain.value = perVoiceGain;

    for (const offset of offsets) {
      const voiceSynth = createSynthForPreset(instance.preset);
      voiceSynth.set({ detune: offset.detune });
      const panner = ctx.createStereoPanner();
      panner.pan.value = offset.pan;
      const gain = ctx.createGain();
      gain.gain.value = perVoiceGain;
      voiceSynth.outputNode.connect(gain);
      gain.connect(panner);
      panner.connect(ctx.destination);
      voices.push({ synth: voiceSynth, panner, gain });
    }
    this.unisonVoices.set(trackId, voices);
  }

  private disposeUnisonVoices(trackId: string): void {
    const voices = this.unisonVoices.get(trackId);
    if (!voices) return;
    for (const voice of voices) {
      voice.synth.releaseAll();
      voice.synth.dispose();
      try { voice.panner.disconnect(); } catch { /* noop */ }
      try { voice.gain.disconnect(); } catch { /* noop */ }
    }
    this.unisonVoices.delete(trackId);
  }

  async previewNote(pitch: number, velocity = 100, duration = 0.3, preset: SynthPreset = 'piano') {
    await this.ensureStarted();
    const ctx = getAudioEngine().ctx;
    if (!this.previewSynth || !this.previewGain) {
      this.previewSynth = createSynthForPreset(preset);
      this.previewGain = ctx.createGain();
      this.previewGain.gain.value = 0.3;
      this.previewSynth.outputNode.connect(this.previewGain);
      this.previewGain.connect(ctx.destination);
    }
    const freq = midiToFrequency(pitch);
    this.previewSynth.triggerAttackRelease(freq, duration, undefined, velocity / 127);
  }

  async playNote(trackId: string, pitch: number, velocity: number, duration: number, preset: SynthPreset) {
    await this.ensureStarted();
    const synth = this.ensureTrackSynth(trackId, preset);
    const freq = midiToFrequency(pitch);
    const filterEnv = this.synths.get(trackId)?.filterEnvelope;
    if (filterEnv) {
      filterEnv.triggerAttackRelease(duration);
    }
    synth.triggerAttackRelease(freq, duration, undefined, velocity / 127);

    const voices = this.unisonVoices.get(trackId);
    if (voices) {
      for (const voice of voices) {
        voice.synth.triggerAttackRelease(freq, duration, undefined, velocity / 127);
      }
    }
  }

  async playSlideNote(
    trackId: string,
    fromPitch: number,
    toPitch: number,
    velocity: number,
    duration: number,
    preset: SynthPreset,
  ) {
    await this.ensureStarted();
    const synth = this.ensureTrackSynth(trackId, preset);
    const glideTime = Math.max(0.03, Math.min(0.12, duration * 0.35));
    const fromFreq = midiToFrequency(fromPitch);
    const toFreq = midiToFrequency(toPitch);
    const ctx = getAudioEngine().ctx;
    const now = ctx.currentTime;

    synth.set({ portamento: glideTime });
    synth.triggerAttack(fromFreq, now, velocity / 127);
    synth.triggerRelease(fromFreq, now + glideTime);

    const filterEnv = this.synths.get(trackId)?.filterEnvelope;
    if (filterEnv) {
      filterEnv.triggerAttackRelease(Math.max(0.04, duration) + glideTime, now);
    }
    synth.triggerAttackRelease(toFreq, Math.max(0.04, duration), now + glideTime, velocity / 127);
  }

  noteOn(trackId: string, pitch: number, velocity = 100) {
    const instance = this.synths.get(trackId);
    if (!instance) return;
    const freq = midiToFrequency(pitch);
    instance.filterEnvelope?.triggerAttack();
    instance.synth.triggerAttack(freq, undefined, velocity / 127);

    const voices = this.unisonVoices.get(trackId);
    if (voices) {
      for (const voice of voices) {
        voice.synth.triggerAttack(freq, undefined, velocity / 127);
      }
    }
  }

  noteOff(trackId: string, pitch: number) {
    const instance = this.synths.get(trackId);
    if (!instance) return;
    const freq = midiToFrequency(pitch);
    instance.filterEnvelope?.triggerRelease();
    instance.synth.triggerRelease(freq);

    const voices = this.unisonVoices.get(trackId);
    if (voices) {
      for (const voice of voices) {
        voice.synth.triggerRelease(freq);
      }
    }
  }

  releaseAll() {
    for (const instance of this.synths.values()) {
      instance.filterEnvelope?.triggerRelease();
      instance.synth.releaseAll();
    }
    for (const voices of this.unisonVoices.values()) {
      for (const voice of voices) {
        voice.synth.releaseAll();
      }
    }
    for (const instance of this.fmSynths.values()) {
      instance.synth.triggerRelease();
    }
  }

  setOscillatorType(trackId: string, type: 'sine' | 'triangle' | 'sawtooth' | 'square'): void {
    const instance = this.synths.get(trackId);
    if (!instance) return;
    instance.synth.set({ oscillator: { type } });
    const voices = this.unisonVoices.get(trackId);
    if (voices) {
      for (const voice of voices) {
        voice.synth.set({ oscillator: { type } });
      }
    }
  }

  setEnvelope(trackId: string, envelope: { attack?: number; decay?: number; sustain?: number; release?: number }): void {
    const instance = this.synths.get(trackId);
    if (!instance) return;
    instance.synth.set({ envelope });
    const voices = this.unisonVoices.get(trackId);
    if (voices) {
      for (const voice of voices) {
        voice.synth.set({ envelope });
      }
    }
  }

  private ensureTrackFilter(instance: SynthInstance): BiquadFilterNode {
    if (instance.filter) return instance.filter;
    const ctx = getAudioEngine().ctx;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 20000;
    filter.Q.value = 0;
    try { instance.synth.outputNode.disconnect(); } catch { /* noop */ }
    instance.synth.outputNode.connect(filter);
    filter.connect(instance.gain);
    instance.filter = filter;
    return filter;
  }

  setFilter(trackId: string, filter: { type?: string; frequency?: number; Q?: number }): void {
    const instance = this.synths.get(trackId);
    if (!instance) return;
    const filterNode = this.ensureTrackFilter(instance);
    if (filter.type) filterNode.type = filter.type as BiquadFilterType;
    if (filter.frequency !== undefined) filterNode.frequency.value = filter.frequency;
    if (filter.Q !== undefined) filterNode.Q.value = filter.Q;
  }

  removeTrackSynth(trackId: string) {
    this.disposeUnisonVoices(trackId);
    const instance = this.synths.get(trackId);
    if (!instance) return;
    instance.synth.releaseAll();
    instance.synth.dispose();
    try { instance.gain.disconnect(); } catch { /* noop */ }
    if (instance.filter) {
      try { instance.filter.disconnect(); } catch { /* noop */ }
    }
    instance.filterEnvelope?.dispose();
    this.synths.delete(trackId);
  }

  dispose() {
    for (const trackId of this.synths.keys()) {
      this.removeTrackSynth(trackId);
    }
    for (const trackId of this.fmSynths.keys()) {
      this.removeFmSynth(trackId);
    }
    this.previewSynth?.dispose();
    if (this.previewGain) {
      try { this.previewGain.disconnect(); } catch { /* noop */ }
    }
    this.previewSynth = null;
    this.previewGain = null;
  }
}

export const synthEngine = new SynthEngine();
