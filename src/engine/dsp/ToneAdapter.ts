/**
 * ToneAdapter — Tone.js implementation of the DSP Provider interfaces.
 *
 * Centralizes Tone.js-backed DSP factory and node wrapping for the
 * IDSPFactory / IDSPNode abstraction used by the newer DSP layer.
 *
 * As additional backends (for example AudioWorklet or Rust WASM) are added,
 * they can provide alternate factory implementations behind the same
 * abstraction with minimal engine-facing changes.
 */

import * as Tone from 'tone';
import type {
  IDSPNode,
  IDSPGain,
  IDSPFilter,
  IDSPCompressor,
  IDSPReverb,
  IDSPDelay,
  IDSPDistortion,
  IDSPChorus,
  IDSPPhaser,
  IDSPEQ3,
  IDSPConvolver,
  IDSPLFO,
  IDSPPanner,
  IDSPPolySynth,
  IDSPFMSynth,
  IDSPMembraneSynth,
  IDSPNoiseSynth,
  IDSPMetalSynth,
  IDSPSynth,
  IDSPFrequencyEnvelope,
  IDSPBufferSource,
  IDSPFactory,
  IDSPGainOptions,
  IDSPFilterOptions,
  IDSPCompressorOptions,
  IDSPReverbOptions,
  IDSPDelayOptions,
  IDSPDistortionOptions,
  IDSPChorusOptions,
  IDSPPhaserOptions,
  IDSPEQ3Options,
  IDSPLFOOptions,
  IDSPPolySynthOptions,
  IDSPFMSynthOptions,
  IDSPMembraneSynthOptions,
  IDSPNoiseSynthOptions,
  IDSPMetalSynthOptions,
  IDSPSynthOptions,
  IDSPFrequencyEnvelopeOptions,
} from './interfaces';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the native AudioParam from a Tone.js Param/Signal.
 *
 * Tone.Param stores the native AudioParam as its `.input` property.
 * We walk the `.input` chain (same as node unwrapping) to reach it.
 * Falls back to treating the object itself as AudioParam if unwrapping fails.
 */
function toNativeParam(toneParam: unknown): AudioParam {
  let current = toneParam;
  for (let i = 0; i < 3; i++) {
    if (!current || typeof current !== 'object') break;
    // Native AudioParam has no `.input` sub-property — stop if we reach one
    if (typeof AudioParam !== 'undefined' && current instanceof AudioParam) return current;
    const next = (current as Record<string, unknown>).input;
    if (!next || next === current) break;
    current = next;
  }
  return current as AudioParam;
}

/**
 * Unwrap a Tone.js node to its underlying native AudioNode.
 * Walks the `.input` / `.output` chain up to 3 levels deep.
 */
function unwrapToNative(node: unknown, prop: 'input' | 'output'): AudioNode {
  let current = node;
  for (let i = 0; i < 3; i++) {
    if (!current || typeof current !== 'object') break;
    const next = (current as Record<string, unknown>)[prop];
    if (!next || next === current || typeof next !== 'object') break;
    current = next;
  }
  return current as AudioNode;
}

// ---------------------------------------------------------------------------
// Base wrapper
// ---------------------------------------------------------------------------

/** Base class wrapping a Tone.ToneAudioNode behind IDSPNode. */
class ToneNodeWrapper implements IDSPNode {
  constructor(protected readonly _toneNode: Tone.ToneAudioNode) {}

  get inputNode(): AudioNode {
    return unwrapToNative(this._toneNode, 'input');
  }

  get outputNode(): AudioNode {
    return unwrapToNative(this._toneNode, 'output');
  }

  connect(destination: IDSPNode): IDSPNode {
    this._toneNode.connect(destination.inputNode as unknown as Tone.InputNode);
    return destination;
  }

  connectNative(destination: AudioNode): AudioNode {
    this._toneNode.connect(destination as unknown as Tone.InputNode);
    return destination;
  }

  connectParam(destination: AudioParam): void {
    this._toneNode.connect(destination as unknown as Tone.InputNode);
  }

  disconnect(destination?: IDSPNode | AudioNode): void {
    if (!destination) {
      this._toneNode.disconnect();
    } else if ('inputNode' in (destination as IDSPNode)) {
      this._toneNode.disconnect(
        (destination as IDSPNode).inputNode as unknown as Tone.InputNode,
      );
    } else {
      this._toneNode.disconnect(destination as unknown as Tone.InputNode);
    }
  }

  dispose(): void {
    this._toneNode.dispose();
  }
}

// ---------------------------------------------------------------------------
// Effect wrappers
// ---------------------------------------------------------------------------

class ToneGain extends ToneNodeWrapper implements IDSPGain {
  private readonly _gain: Tone.Gain;

  constructor(options?: IDSPGainOptions) {
    const g = new Tone.Gain(options?.gain ?? 1);
    super(g);
    this._gain = g;
  }

  get gain(): AudioParam {
    return toNativeParam(this._gain.gain);
  }
}

class ToneFilter extends ToneNodeWrapper implements IDSPFilter {
  private readonly _filter: Tone.Filter;

  constructor(options?: IDSPFilterOptions) {
    const f = new Tone.Filter({
      type: options?.type ?? 'lowpass',
      frequency: options?.frequency ?? 350,
      Q: options?.Q ?? 1,
    });
    if (options?.gain !== undefined) f.gain.value = options.gain;
    super(f);
    this._filter = f;
  }

  get type(): BiquadFilterType { return this._filter.type as BiquadFilterType; }
  set type(v: BiquadFilterType) { this._filter.type = v; }

  get frequency(): AudioParam { return toNativeParam(this._filter.frequency); }
  get Q(): AudioParam { return toNativeParam(this._filter.Q); }
  get gain(): AudioParam { return toNativeParam(this._filter.gain); }
}

class ToneCompressor extends ToneNodeWrapper implements IDSPCompressor {
  private readonly _comp: Tone.Compressor;

  constructor(options?: IDSPCompressorOptions) {
    const c = new Tone.Compressor({
      threshold: options?.threshold ?? -24,
      ratio: options?.ratio ?? 12,
      attack: options?.attack ?? 0.003,
      release: options?.release ?? 0.25,
      knee: options?.knee ?? 30,
    });
    super(c);
    this._comp = c;
  }

  get threshold(): AudioParam { return this._comp.threshold as unknown as AudioParam; }
  get ratio(): AudioParam { return this._comp.ratio as unknown as AudioParam; }
  get attack(): AudioParam { return this._comp.attack as unknown as AudioParam; }
  get release(): AudioParam { return this._comp.release as unknown as AudioParam; }
  get knee(): AudioParam { return this._comp.knee as unknown as AudioParam; }
}

class ToneReverb extends ToneNodeWrapper implements IDSPReverb {
  private readonly _reverb: Tone.Reverb;

  constructor(options?: IDSPReverbOptions) {
    const r = new Tone.Reverb({
      decay: options?.decay ?? 1.5,
      preDelay: options?.preDelay ?? 0.01,
      wet: options?.wet ?? 1,
    });
    super(r);
    this._reverb = r;
  }

  get decay(): number { return this._reverb.decay as number; }
  set decay(v: number) { this._reverb.decay = v; }

  get preDelay(): number { return this._reverb.preDelay as number; }
  set preDelay(v: number) { this._reverb.preDelay = v; }

  get wet(): number { return this._reverb.wet.value; }
  set wet(v: number) { this._reverb.wet.value = v; }
}

class ToneDelay extends ToneNodeWrapper implements IDSPDelay {
  private readonly _delay: Tone.FeedbackDelay;

  constructor(options?: IDSPDelayOptions) {
    const d = new Tone.FeedbackDelay({
      delayTime: options?.delayTime ?? 0.25,
      feedback: options?.feedback ?? 0.5,
      wet: options?.wet ?? 1,
      maxDelay: options?.maxDelay ?? 1,
    });
    super(d);
    this._delay = d;
  }

  get delayTime(): AudioParam {
    return this._delay.delayTime as unknown as AudioParam;
  }

  get feedback(): number { return this._delay.feedback.value; }
  set feedback(v: number) { this._delay.feedback.value = v; }

  get wet(): number { return this._delay.wet.value; }
  set wet(v: number) { this._delay.wet.value = v; }
}

class ToneDistortion extends ToneNodeWrapper implements IDSPDistortion {
  private readonly _dist: Tone.Distortion;

  constructor(options?: IDSPDistortionOptions) {
    const d = new Tone.Distortion({
      distortion: options?.distortion ?? 0.4,
      wet: options?.wet ?? 1,
    });
    super(d);
    this._dist = d;
  }

  get distortion(): number { return this._dist.distortion; }
  set distortion(v: number) { this._dist.distortion = v; }

  get wet(): number { return this._dist.wet.value; }
  set wet(v: number) { this._dist.wet.value = v; }
}

class ToneChorus extends ToneNodeWrapper implements IDSPChorus {
  private readonly _chorus: Tone.Chorus;

  constructor(options?: IDSPChorusOptions) {
    const c = new Tone.Chorus({
      frequency: options?.frequency ?? 1.5,
      delayTime: options?.delayTime ?? 3.5,
      depth: options?.depth ?? 0.7,
      feedback: options?.feedback ?? 0,
      wet: options?.wet ?? 0.5,
    });
    super(c);
    this._chorus = c;
  }

  get frequency(): number { return this._chorus.frequency.value as number; }
  set frequency(v: number) { this._chorus.frequency.value = v; }

  get delayTime(): number { return this._chorus.delayTime as number; }
  set delayTime(v: number) { this._chorus.delayTime = v; }

  get depth(): number { return this._chorus.depth; }
  set depth(v: number) { this._chorus.depth = v; }

  get feedback(): number { return this._chorus.feedback.value; }
  set feedback(v: number) { this._chorus.feedback.value = v; }

  get wet(): number { return this._chorus.wet.value; }
  set wet(v: number) { this._chorus.wet.value = v; }

  start(): void { this._chorus.start(); }
}

class TonePhaser extends ToneNodeWrapper implements IDSPPhaser {
  private readonly _phaser: Tone.Phaser;

  constructor(options?: IDSPPhaserOptions) {
    const p = new Tone.Phaser({
      frequency: options?.frequency ?? 0.5,
      octaves: options?.octaves ?? 3,
      stages: options?.stages ?? 10,
      Q: options?.Q ?? 10,
      baseFrequency: options?.baseFrequency ?? 350,
      wet: options?.wet ?? 0.5,
    });
    super(p);
    this._phaser = p;
  }

  get frequency(): number { return this._phaser.frequency.value as number; }
  set frequency(v: number) { this._phaser.frequency.value = v; }

  get octaves(): number { return this._phaser.octaves; }
  set octaves(v: number) { this._phaser.octaves = v; }

  get stages(): number { return (this._phaser as unknown as { stages: number }).stages; }
  set stages(v: number) { (this._phaser as unknown as { stages: number }).stages = v; }

  get Q(): number { return this._phaser.Q.value as number; }
  set Q(v: number) { this._phaser.Q.value = v; }

  get baseFrequency(): number { return this._phaser.baseFrequency as number; }
  set baseFrequency(v: number) { this._phaser.baseFrequency = v; }

  get wet(): number { return this._phaser.wet.value; }
  set wet(v: number) { this._phaser.wet.value = v; }
}

class ToneEQ3 extends ToneNodeWrapper implements IDSPEQ3 {
  private readonly _eq: Tone.EQ3;

  constructor(options?: IDSPEQ3Options) {
    const eq = new Tone.EQ3(options?.low ?? 0, options?.mid ?? 0, options?.high ?? 0);
    if (options?.lowFrequency !== undefined) eq.lowFrequency.value = options.lowFrequency;
    if (options?.highFrequency !== undefined) eq.highFrequency.value = options.highFrequency;
    super(eq);
    this._eq = eq;
  }

  get low(): number { return this._eq.low.value; }
  set low(v: number) { this._eq.low.value = v; }

  get mid(): number { return this._eq.mid.value; }
  set mid(v: number) { this._eq.mid.value = v; }

  get high(): number { return this._eq.high.value; }
  set high(v: number) { this._eq.high.value = v; }

  get lowFrequency(): number { return this._eq.lowFrequency.value as number; }
  set lowFrequency(v: number) { this._eq.lowFrequency.value = v; }

  get highFrequency(): number { return this._eq.highFrequency.value as number; }
  set highFrequency(v: number) { this._eq.highFrequency.value = v; }
}

class ToneConvolver extends ToneNodeWrapper implements IDSPConvolver {
  private readonly _conv: Tone.Convolver;

  constructor() {
    const c = new Tone.Convolver();
    super(c);
    this._conv = c;
  }

  get buffer(): AudioBuffer | null {
    const buf = this._conv.buffer;
    if (!buf) return null;
    // Tone.ToneAudioBuffer → native AudioBuffer
    return (buf as unknown as { _buffer?: AudioBuffer })._buffer ??
      buf as unknown as AudioBuffer;
  }

  set buffer(v: AudioBuffer | null) {
    if (v) {
      this._conv.buffer = new Tone.ToneAudioBuffer(v);
    } else {
      this._conv.buffer = undefined as unknown as Tone.ToneAudioBuffer;
    }
  }

  async load(url: string): Promise<void> {
    await this._conv.load(url);
  }
}

class ToneLFO extends ToneNodeWrapper implements IDSPLFO {
  private readonly _lfo: Tone.LFO;

  constructor(options?: IDSPLFOOptions) {
    const l = new Tone.LFO({
      frequency: options?.frequency ?? 1,
      min: options?.min ?? 0,
      max: options?.max ?? 1,
    });
    super(l);
    this._lfo = l;
  }

  get frequency(): number { return this._lfo.frequency.value as number; }
  set frequency(v: number) { this._lfo.frequency.value = v; }

  get min(): number { return this._lfo.min as number; }
  set min(v: number) { this._lfo.min = v; }

  get max(): number { return this._lfo.max as number; }
  set max(v: number) { this._lfo.max = v; }

  start(): void { this._lfo.start(); }
  stop(): void { this._lfo.stop(); }

  override connectParam(destination: AudioParam): void {
    this._lfo.connect(destination as unknown as Tone.InputNode);
  }
}

class TonePanner extends ToneNodeWrapper implements IDSPPanner {
  private readonly _panner: Tone.Panner;

  constructor(pan?: number) {
    const p = new Tone.Panner(pan ?? 0);
    super(p);
    this._panner = p;
  }

  get pan(): number { return this._panner.pan.value; }
  set pan(v: number) { this._panner.pan.value = v; }
}

// ---------------------------------------------------------------------------
// Synth wrappers
// ---------------------------------------------------------------------------

class TonePolySynth extends ToneNodeWrapper implements IDSPPolySynth {
  private readonly _synth: Tone.PolySynth;

  constructor(options?: IDSPPolySynthOptions) {
    const s = new Tone.PolySynth({
      maxPolyphony: options?.maxPolyphony ?? 32,
      options: {
        oscillator: options?.oscillator as Tone.OmniOscillatorOptions | undefined,
        envelope: options?.envelope,
      },
    });
    super(s);
    this._synth = s;
  }

  triggerAttack(notes: string | string[], time?: number, velocity?: number): void {
    this._synth.triggerAttack(notes, time, velocity);
  }

  triggerRelease(notes: string | string[], time?: number): void {
    this._synth.triggerRelease(notes, time);
  }

  triggerAttackRelease(
    notes: string | string[],
    duration: number | string,
    time?: number,
    velocity?: number,
  ): void {
    this._synth.triggerAttackRelease(notes, duration, time, velocity);
  }

  releaseAll(time?: number): void {
    this._synth.releaseAll(time);
  }

  set(options: Record<string, unknown>): void {
    this._synth.set(options as Partial<Tone.SynthOptions>);
  }
}

class ToneFMSynth extends ToneNodeWrapper implements IDSPFMSynth {
  private readonly _synth: Tone.FMSynth;

  constructor(options?: IDSPFMSynthOptions) {
    const s = new Tone.FMSynth({
      modulationIndex: options?.modulationIndex,
      harmonicity: options?.harmonicity,
      oscillator: options?.oscillator as Tone.FMSynthOptions['oscillator'],
      modulation: options?.modulation as Tone.FMSynthOptions['modulation'],
      envelope: options?.envelope as Tone.FMSynthOptions['envelope'],
    });
    super(s);
    this._synth = s;
  }

  triggerAttack(note: string, time?: number, velocity?: number): void {
    this._synth.triggerAttack(note, time, velocity);
  }

  triggerRelease(time?: number): void {
    this._synth.triggerRelease(time);
  }

  triggerAttackRelease(
    note: string,
    duration: number | string,
    time?: number,
    velocity?: number,
  ): void {
    this._synth.triggerAttackRelease(note, duration, time, velocity);
  }
}

class ToneMembraneSynth extends ToneNodeWrapper implements IDSPMembraneSynth {
  private readonly _synth: Tone.MembraneSynth;

  constructor(options?: IDSPMembraneSynthOptions) {
    const s = new Tone.MembraneSynth({
      pitchDecay: options?.pitchDecay,
      octaves: options?.octaves,
      oscillator: options?.oscillator as Tone.MembraneSynthOptions['oscillator'],
      envelope: options?.envelope as Tone.MembraneSynthOptions['envelope'],
    });
    super(s);
    this._synth = s;
  }

  triggerAttackRelease(
    note: string,
    duration: number | string,
    time?: number,
    velocity?: number,
  ): void {
    this._synth.triggerAttackRelease(note, duration, time, velocity);
  }
}

class ToneNoiseSynth extends ToneNodeWrapper implements IDSPNoiseSynth {
  private readonly _synth: Tone.NoiseSynth;

  constructor(options?: IDSPNoiseSynthOptions) {
    const s = new Tone.NoiseSynth({
      noise: options?.noise as Tone.NoiseSynthOptions['noise'],
      envelope: options?.envelope,
    });
    super(s);
    this._synth = s;
  }

  triggerAttackRelease(
    duration: number | string,
    time?: number,
    velocity?: number,
  ): void {
    this._synth.triggerAttackRelease(duration, time, velocity);
  }
}

class ToneMetalSynth extends ToneNodeWrapper implements IDSPMetalSynth {
  private readonly _synth: Tone.MetalSynth;

  constructor(options?: IDSPMetalSynthOptions) {
    const opts: Partial<Tone.MetalSynthOptions> = {};
    if (options?.envelope) opts.envelope = options.envelope as Tone.MetalSynthOptions['envelope'];
    if (options?.harmonicity !== undefined) opts.harmonicity = options.harmonicity;
    if (options?.modulationIndex !== undefined) opts.modulationIndex = options.modulationIndex;
    if (options?.resonance !== undefined) opts.resonance = options.resonance;
    if (options?.octaves !== undefined) opts.octaves = options.octaves;
    const s = new Tone.MetalSynth(opts);
    if (options?.frequency !== undefined) s.frequency.value = options.frequency;
    super(s);
    this._synth = s;
  }

  triggerAttackRelease(
    duration: number | string,
    time?: number,
    velocity?: number,
  ): void {
    this._synth.triggerAttackRelease(duration, time ?? Tone.now(), velocity);
  }
}

class ToneSynth extends ToneNodeWrapper implements IDSPSynth {
  private readonly _synth: Tone.Synth;

  constructor(options?: IDSPSynthOptions) {
    const s = new Tone.Synth({
      oscillator: options?.oscillator as Tone.SynthOptions['oscillator'],
      envelope: options?.envelope as Tone.SynthOptions['envelope'],
    });
    super(s);
    this._synth = s;
  }

  triggerAttackRelease(
    note: string,
    duration: number | string,
    time?: number,
    velocity?: number,
  ): void {
    this._synth.triggerAttackRelease(note, duration, time, velocity);
  }
}

class ToneFrequencyEnvelope extends ToneNodeWrapper implements IDSPFrequencyEnvelope {
  private readonly _env: Tone.FrequencyEnvelope;

  constructor(options?: IDSPFrequencyEnvelopeOptions) {
    const e = new Tone.FrequencyEnvelope({
      attack: options?.attack ?? 0.01,
      decay: options?.decay ?? 0.1,
      sustain: options?.sustain ?? 0.5,
      release: options?.release ?? 0.3,
      baseFrequency: options?.baseFrequency ?? 200,
      octaves: options?.octaves ?? 4,
    });
    super(e);
    this._env = e;
  }

  get attack(): number { return this._env.attack as number; }
  set attack(v: number) { this._env.attack = v; }

  get decay(): number { return this._env.decay as number; }
  set decay(v: number) { this._env.decay = v; }

  get sustain(): number { return this._env.sustain; }
  set sustain(v: number) { this._env.sustain = v; }

  get release(): number { return this._env.release as number; }
  set release(v: number) { this._env.release = v; }

  get baseFrequency(): number { return this._env.baseFrequency as number; }
  set baseFrequency(v: number) { this._env.baseFrequency = v; }

  get octaves(): number { return this._env.octaves; }
  set octaves(v: number) { this._env.octaves = v; }

  triggerAttack(time?: number): void { this._env.triggerAttack(time); }
  triggerRelease(time?: number): void { this._env.triggerRelease(time); }
}

class ToneBufferSource extends ToneNodeWrapper implements IDSPBufferSource {
  private readonly _src: Tone.ToneBufferSource;

  constructor() {
    const s = new Tone.ToneBufferSource();
    super(s);
    this._src = s;
  }

  get buffer(): AudioBuffer | null {
    const buf = this._src.buffer;
    if (!buf) return null;
    return buf.get() as AudioBuffer | null;
  }

  set buffer(v: AudioBuffer | null) {
    if (v === null) {
      this._src.buffer = new Tone.ToneAudioBuffer();
      return;
    }
    this._src.buffer = new Tone.ToneAudioBuffer(v);
  }

  get playbackRate(): number { return this._src.playbackRate.value; }
  set playbackRate(v: number) { this._src.playbackRate.value = v; }

  get loop(): boolean { return this._src.loop; }
  set loop(v: boolean) { this._src.loop = v; }

  get loopStart(): number { return this._src.loopStart as number; }
  set loopStart(v: number) { this._src.loopStart = v; }

  get loopEnd(): number { return this._src.loopEnd as number; }
  set loopEnd(v: number) { this._src.loopEnd = v; }

  start(time?: number, offset?: number, duration?: number): void {
    this._src.start(time, offset, duration);
  }

  stop(time?: number): void {
    this._src.stop(time);
  }

  get onended(): (() => void) | null {
    return this._src.onended as (() => void) | null;
  }

  set onended(fn: (() => void) | null) {
    this._src.onended = fn ?? (() => {});
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Tone.js implementation of IDSPFactory.
 *
 * All Tone.js `new` calls are centralized here. Engines use the factory
 * methods and never import Tone.js directly.
 */
export class ToneDSPFactory implements IDSPFactory {
  createGain(options?: IDSPGainOptions): IDSPGain {
    return new ToneGain(options);
  }

  createFilter(options?: IDSPFilterOptions): IDSPFilter {
    return new ToneFilter(options);
  }

  createPanner(pan?: number): IDSPPanner {
    return new TonePanner(pan);
  }

  createCompressor(options?: IDSPCompressorOptions): IDSPCompressor {
    return new ToneCompressor(options);
  }

  createReverb(options?: IDSPReverbOptions): IDSPReverb {
    return new ToneReverb(options);
  }

  createDelay(options?: IDSPDelayOptions): IDSPDelay {
    return new ToneDelay(options);
  }

  createDistortion(options?: IDSPDistortionOptions): IDSPDistortion {
    return new ToneDistortion(options);
  }

  createChorus(options?: IDSPChorusOptions): IDSPChorus {
    return new ToneChorus(options);
  }

  createPhaser(options?: IDSPPhaserOptions): IDSPPhaser {
    return new TonePhaser(options);
  }

  createEQ3(options?: IDSPEQ3Options): IDSPEQ3 {
    return new ToneEQ3(options);
  }

  createConvolver(): IDSPConvolver {
    return new ToneConvolver();
  }

  createLFO(options?: IDSPLFOOptions): IDSPLFO {
    return new ToneLFO(options);
  }

  createPolySynth(options?: IDSPPolySynthOptions): IDSPPolySynth {
    return new TonePolySynth(options);
  }

  createFMSynth(options?: IDSPFMSynthOptions): IDSPFMSynth {
    return new ToneFMSynth(options);
  }

  createMembraneSynth(options?: IDSPMembraneSynthOptions): IDSPMembraneSynth {
    return new ToneMembraneSynth(options);
  }

  createNoiseSynth(options?: IDSPNoiseSynthOptions): IDSPNoiseSynth {
    return new ToneNoiseSynth(options);
  }

  createMetalSynth(options?: IDSPMetalSynthOptions): IDSPMetalSynth {
    return new ToneMetalSynth(options);
  }

  createSynth(options?: IDSPSynthOptions): IDSPSynth {
    return new ToneSynth(options);
  }

  createFrequencyEnvelope(options?: IDSPFrequencyEnvelopeOptions): IDSPFrequencyEnvelope {
    return new ToneFrequencyEnvelope(options);
  }

  createBufferSource(): IDSPBufferSource {
    return new ToneBufferSource();
  }

  getContext(): AudioContext {
    return Tone.getContext().rawContext as AudioContext;
  }

  get sampleRate(): number {
    return Tone.getContext().sampleRate;
  }
}

/** Singleton default factory — can be replaced for testing or migration. */
let _defaultFactory: IDSPFactory = new ToneDSPFactory();

/** Get the current DSP factory. */
export function getDSPFactory(): IDSPFactory {
  return _defaultFactory;
}

/** Replace the default DSP factory (for testing or backend migration). */
export function setDSPFactory(factory: IDSPFactory): void {
  _defaultFactory = factory;
}
