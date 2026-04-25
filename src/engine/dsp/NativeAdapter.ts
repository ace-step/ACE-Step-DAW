/**
 * NativeAdapter — Pure Web Audio API implementation of DSP Provider interfaces.
 *
 * Eliminates Tone.js dependency for all effect nodes by using:
 * - Native Web Audio nodes where available (Gain, BiquadFilter, DynamicsCompressor, Delay, Panner)
 * - ScriptProcessorNode + Phase 2 Core DSP library for complex effects
 *   (Reverb, Distortion, Chorus, Phaser, EQ3, LFO)
 *
 * Part of Phase 3: Effects Migration (#1126) + Phase 4: Synth Migration (#1127).
 */

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

import {
  NativePolySynth,
  NativeFMSynth,
  NativeMembraneSynth,
  NativeNoiseSynth,
  NativeMetalSynth,
  NativeSynth,
  NativeFrequencyEnvelope,
  NativeBufferSource,
} from './NativeSynths';

import {
  FreeVerb,
  Waveshaper,
  BiquadProcessor,
  calcBiquadCoeffs,
  DelayLine,
} from './core';

// ---------------------------------------------------------------------------
// Helper: create a looping AudioBufferSourceNode that outputs constant 1.0.
// Used as a DC signal source for LFO offset and FrequencyEnvelope.
// A 0Hz OscillatorNode outputs sin(0)=0 which is NOT a usable DC source.
// ---------------------------------------------------------------------------

function createDCSource(ctx: AudioContext): AudioBufferSourceNode {
  const buf = ctx.createBuffer(1, 2, ctx.sampleRate);
  buf.getChannelData(0).fill(1);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  src.start();
  return src;
}

// ---------------------------------------------------------------------------
// Base wrapper for native Web Audio nodes
// ---------------------------------------------------------------------------

class NativeNodeWrapper implements IDSPNode {
  protected readonly _input: AudioNode;
  protected readonly _output: AudioNode;

  constructor(input: AudioNode, output?: AudioNode) {
    this._input = input;
    this._output = output ?? input;
  }

  get inputNode(): AudioNode { return this._input; }
  get outputNode(): AudioNode { return this._output; }

  connect(destination: IDSPNode): IDSPNode {
    this._output.connect(destination.inputNode);
    return destination;
  }

  connectNative(destination: AudioNode): AudioNode {
    this._output.connect(destination);
    return destination;
  }

  connectParam(destination: AudioParam): void {
    this._output.connect(destination);
  }

  disconnect(destination?: IDSPNode | AudioNode): void {
    if (!destination) {
      this._output.disconnect();
    } else if ('inputNode' in (destination as IDSPNode)) {
      this._output.disconnect((destination as IDSPNode).inputNode);
    } else {
      this._output.disconnect(destination as AudioNode);
    }
  }

  dispose(): void {
    this._output.disconnect();
  }
}

// ---------------------------------------------------------------------------
// Helper: Dry/Wet mix node
// ---------------------------------------------------------------------------

class DryWetMix {
  readonly input: GainNode;
  readonly output: GainNode;
  private readonly _dry: GainNode;
  private readonly _wet: GainNode;
  private _wetAmount = 1;

  constructor(ctx: AudioContext) {
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this._dry = ctx.createGain();
    this._wet = ctx.createGain();

    this.input.connect(this._dry);
    this._dry.connect(this.output);
    this._wet.connect(this.output);

    this._dry.gain.value = 0;
    this._wet.gain.value = 1;
  }

  get wetInput(): AudioNode { return this._wet; }

  get wet(): number { return this._wetAmount; }
  set wet(v: number) {
    const clamped = Math.max(0, Math.min(1, v));
    this._wetAmount = clamped;
    this._wet.gain.value = clamped;
    this._dry.gain.value = 1 - clamped;
  }
}

// ---------------------------------------------------------------------------
// Native effect implementations
// ---------------------------------------------------------------------------

class NativeGain extends NativeNodeWrapper implements IDSPGain {
  private readonly _gainNode: GainNode;

  constructor(ctx: AudioContext, options?: IDSPGainOptions) {
    const g = ctx.createGain();
    g.gain.value = options?.gain ?? 1;
    super(g);
    this._gainNode = g;
  }

  get gain(): AudioParam { return this._gainNode.gain; }
}

class NativeFilter extends NativeNodeWrapper implements IDSPFilter {
  private readonly _filter: BiquadFilterNode;

  constructor(ctx: AudioContext, options?: IDSPFilterOptions) {
    const f = ctx.createBiquadFilter();
    f.type = options?.type ?? 'lowpass';
    f.frequency.value = options?.frequency ?? 350;
    f.Q.value = options?.Q ?? 1;
    if (options?.gain !== undefined) f.gain.value = options.gain;
    super(f);
    this._filter = f;
  }

  get type(): BiquadFilterType { return this._filter.type; }
  set type(v: BiquadFilterType) { this._filter.type = v; }

  get frequency(): AudioParam { return this._filter.frequency; }
  get Q(): AudioParam { return this._filter.Q; }
  get gain(): AudioParam { return this._filter.gain; }
}

class NativeCompressor extends NativeNodeWrapper implements IDSPCompressor {
  private readonly _comp: DynamicsCompressorNode;

  constructor(ctx: AudioContext, options?: IDSPCompressorOptions) {
    const c = ctx.createDynamicsCompressor();
    c.threshold.value = options?.threshold ?? -24;
    c.ratio.value = options?.ratio ?? 12;
    c.attack.value = options?.attack ?? 0.003;
    c.release.value = options?.release ?? 0.25;
    c.knee.value = options?.knee ?? 30;
    super(c);
    this._comp = c;
  }

  get threshold(): AudioParam { return this._comp.threshold; }
  get ratio(): AudioParam { return this._comp.ratio; }
  get attack(): AudioParam { return this._comp.attack; }
  get release(): AudioParam { return this._comp.release; }
  get knee(): AudioParam { return this._comp.knee; }
}

class NativePanner extends NativeNodeWrapper implements IDSPPanner {
  private readonly _panner: StereoPannerNode;

  constructor(ctx: AudioContext, pan = 0) {
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    super(p);
    this._panner = p;
  }

  get pan(): number { return this._panner.pan.value; }
  set pan(v: number) { this._panner.pan.value = v; }
}

class NativeDelay extends NativeNodeWrapper implements IDSPDelay {
  private readonly _delay: DelayNode;
  private readonly _feedback: GainNode;
  private readonly _mix: DryWetMix;

  constructor(ctx: AudioContext, options?: IDSPDelayOptions) {
    const mix = new DryWetMix(ctx);
    const delay = ctx.createDelay(options?.maxDelay ?? 1);
    const feedback = ctx.createGain();

    delay.delayTime.value = options?.delayTime ?? 0.25;
    feedback.gain.value = options?.feedback ?? 0.5;

    // Input → delay → feedback loop → wet mix
    mix.input.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay); // feedback loop
    delay.connect(mix.wetInput);

    mix.wet = options?.wet ?? 1;

    super(mix.input, mix.output);
    this._delay = delay;
    this._feedback = feedback;
    this._mix = mix;
  }

  get delayTime(): AudioParam { return this._delay.delayTime; }

  get feedback(): number { return this._feedback.gain.value; }
  set feedback(v: number) { this._feedback.gain.value = Math.max(0, Math.min(0.999, v)); }

  get wet(): number { return this._mix.wet; }
  set wet(v: number) { this._mix.wet = v; }
}

// ---------------------------------------------------------------------------
// AudioWorklet-based effects with ScriptProcessorNode fallback
// ---------------------------------------------------------------------------

import { createDspNode, type DspNodeResult } from './workletLoader';

const BUFFER_SIZE = 2048;

class NativeReverb extends NativeNodeWrapper implements IDSPReverb {
  private readonly _verb: FreeVerb;
  private readonly _mix: DryWetMix;
  private readonly _preDelayNode: DelayNode;
  private _dspNode: DspNodeResult | null = null;
  private _decay = 1.5;
  private _preDelay = 0.01;

  constructor(ctx: AudioContext, options?: IDSPReverbOptions) {
    const mix = new DryWetMix(ctx);
    const verb = new FreeVerb(ctx.sampleRate);
    const preDelayNode = ctx.createDelay(0.5);

    const preDelayTime = options?.preDelay ?? 0.01;
    preDelayNode.delayTime.value = preDelayTime;

    const roomSize = Math.min(1, (options?.decay ?? 1.5) / 10);
    verb.roomSize = roomSize;
    verb.damping = 0.5;
    verb.wet = 1;
    verb.dry = 0;

    // Start with ScriptProcessorNode synchronously; upgrade to AudioWorklet async
    const scriptFallback = ctx.createScriptProcessor(BUFFER_SIZE, 2, 2);
    scriptFallback.onaudioprocess = (e: AudioProcessingEvent) => {
      const inL = e.inputBuffer.getChannelData(0);
      const inR = e.inputBuffer.numberOfChannels > 1
        ? e.inputBuffer.getChannelData(1) : inL;
      const outL = e.outputBuffer.getChannelData(0);
      const outR = e.outputBuffer.getChannelData(1);
      verb.processStereo(inL, inR, outL, outR, 0, BUFFER_SIZE);
    };

    // Signal path: input → preDelay → processor → wet mix
    mix.input.connect(preDelayNode);
    preDelayNode.connect(scriptFallback);
    scriptFallback.connect(mix.wetInput);

    mix.wet = options?.wet ?? 1;

    super(mix.input, mix.output);
    this._verb = verb;
    this._mix = mix;
    this._preDelayNode = preDelayNode;
    this._decay = options?.decay ?? 1.5;
    this._preDelay = preDelayTime;

    // Attempt async upgrade to AudioWorklet
    void this._upgradeToWorklet(ctx, scriptFallback, mix, preDelayNode);
  }

  private async _upgradeToWorklet(
    ctx: AudioContext,
    scriptNode: ScriptProcessorNode,
    mix: DryWetMix,
    preDelayNode: DelayNode,
  ): Promise<void> {
    try {
      // Derive roomSize from current _decay (may have changed since constructor)
      const currentRoomSize = Math.min(1, this._decay / 10);
      const result = await createDspNode(
        ctx,
        '/reverb-worklet-processor.js',
        'reverb-worklet-processor',
        2,
        { roomSize: currentRoomSize, damping: 0.5, wet: 1, dry: 0 },
      );

      if (result) {
        // Swap: disconnect ScriptProcessor, connect AudioWorklet
        preDelayNode.disconnect(scriptNode);
        scriptNode.disconnect();
        preDelayNode.connect(result.node);
        result.node.connect(mix.wetInput);
        this._dspNode = result;
        // Recompute from latest _decay (may have changed during async load)
        const latestRoomSize = Math.min(1, this._decay / 10);
        result.port?.postMessage({ type: 'roomSize', value: latestRoomSize });
      }
    } catch {
      // Keep ScriptProcessorNode fallback — already connected
    }
  }

  get decay(): number { return this._decay; }
  set decay(v: number) {
    this._decay = v;
    this._verb.roomSize = Math.min(1, v / 10);
    this._dspNode?.port?.postMessage({ type: 'roomSize', value: Math.min(1, v / 10) });
  }

  get preDelay(): number { return this._preDelay; }
  set preDelay(v: number) {
    this._preDelay = v;
    this._preDelayNode.delayTime.value = v;
  }

  get wet(): number { return this._mix.wet; }
  set wet(v: number) { this._mix.wet = v; }
}

class NativeDistortion extends NativeNodeWrapper implements IDSPDistortion {
  private readonly _shaper: WaveShaperNode;
  private readonly _mix: DryWetMix;
  private _distortion = 0.4;

  constructor(ctx: AudioContext, options?: IDSPDistortionOptions) {
    const mix = new DryWetMix(ctx);
    const shaper = ctx.createWaveShaper();

    const dist = options?.distortion ?? 0.4;
    shaper.curve = NativeDistortion._makeCurve(dist);
    shaper.oversample = '2x';

    mix.input.connect(shaper);
    shaper.connect(mix.wetInput);

    mix.wet = options?.wet ?? 1;

    super(mix.input, mix.output);
    this._shaper = shaper;
    this._mix = mix;
    this._distortion = dist;
  }

  get distortion(): number { return this._distortion; }
  set distortion(v: number) {
    this._distortion = v;
    this._shaper.curve = NativeDistortion._makeCurve(v);
  }

  get wet(): number { return this._mix.wet; }
  set wet(v: number) { this._mix.wet = v; }

  static _makeCurve(amount: number): Float32Array<ArrayBuffer> {
    const samples = 8192;
    const curve = new Float32Array(new ArrayBuffer(samples * 4));
    const drive = Math.max(1, amount * 100);
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      curve[i] = Math.tanh(x * drive);
    }
    return curve;
  }
}

class NativeChorus extends NativeNodeWrapper implements IDSPChorus {
  private readonly _delay: DelayNode;
  private readonly _feedbackNode: GainNode;
  private readonly _lfo: OscillatorNode;
  private readonly _lfoGain: GainNode;
  private readonly _mix: DryWetMix;
  private _frequency: number;
  private _delayTime: number;
  private _depth: number;
  private _feedback: number;

  constructor(ctx: AudioContext, options?: IDSPChorusOptions) {
    const mix = new DryWetMix(ctx);
    const delay = ctx.createDelay(0.1);
    const feedback = ctx.createGain();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();

    const freq = options?.frequency ?? 1.5;
    const delayMs = options?.delayTime ?? 3.5;
    const depth = options?.depth ?? 0.7;
    const fb = options?.feedback ?? 0;

    delay.delayTime.value = delayMs / 1000;
    feedback.gain.value = fb;
    lfo.frequency.value = freq;
    lfo.type = 'sine';
    lfoGain.gain.value = (depth * delayMs) / 1000;

    // LFO → delay time modulation
    lfo.connect(lfoGain);
    lfoGain.connect(delay.delayTime);

    // Signal path
    mix.input.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(mix.wetInput);

    mix.wet = options?.wet ?? 0.5;

    super(mix.input, mix.output);
    this._delay = delay;
    this._feedbackNode = feedback;
    this._lfo = lfo;
    this._lfoGain = lfoGain;
    this._mix = mix;
    this._frequency = freq;
    this._delayTime = delayMs;
    this._depth = depth;
    this._feedback = fb;

    // Auto-start LFO (consistent with NativePhaser behavior)
    try { lfo.start(); } catch { /* already started */ }
  }

  get frequency(): number { return this._frequency; }
  set frequency(v: number) {
    this._frequency = v;
    this._lfo.frequency.value = v;
  }

  get delayTime(): number { return this._delayTime; }
  set delayTime(v: number) {
    this._delayTime = v;
    this._delay.delayTime.value = v / 1000;
    this._lfoGain.gain.value = (this._depth * v) / 1000;
  }

  get depth(): number { return this._depth; }
  set depth(v: number) {
    this._depth = v;
    this._lfoGain.gain.value = (v * this._delayTime) / 1000;
  }

  get feedback(): number { return this._feedback; }
  set feedback(v: number) {
    this._feedback = v;
    this._feedbackNode.gain.value = v;
  }

  get wet(): number { return this._mix.wet; }
  set wet(v: number) { this._mix.wet = v; }

  start(): void {
    try { this._lfo.start(); } catch { /* already started */ }
  }

  dispose(): void {
    try { this._lfo.stop(); } catch { /* */ }
    try { this._lfo.disconnect(); } catch { /* */ }
    try { this._lfoGain.disconnect(); } catch { /* */ }
    try { this._delay.disconnect(); } catch { /* */ }
    try { this._feedbackNode.disconnect(); } catch { /* */ }
    super.dispose();
  }
}

class NativePhaser extends NativeNodeWrapper implements IDSPPhaser {
  private readonly _filters: BiquadFilterNode[];
  private readonly _lfo: OscillatorNode;
  private readonly _lfoGain: GainNode;
  private readonly _lfoDcGain: GainNode;
  private readonly _lfoDcSource: AudioBufferSourceNode;
  private readonly _mix: DryWetMix;
  private _frequency: number;
  private _octaves: number;
  private _stages: number;
  private _Q: number;
  private _baseFrequency: number;

  constructor(ctx: AudioContext, options?: IDSPPhaserOptions) {
    const mix = new DryWetMix(ctx);
    const stages = options?.stages ?? 4;
    const baseFreq = options?.baseFrequency ?? 350;
    const oct = options?.octaves ?? 3;
    const freq = options?.frequency ?? 0.5;
    const q = options?.Q ?? 10;

    // Create allpass filter chain
    const filters: BiquadFilterNode[] = [];
    let lastNode: AudioNode = mix.input;

    for (let i = 0; i < stages; i++) {
      const f = ctx.createBiquadFilter();
      f.type = 'allpass';
      f.frequency.value = baseFreq;
      f.Q.value = q;
      filters.push(f);
      lastNode.connect(f);
      lastNode = f;
    }
    lastNode.connect(mix.wetInput);

    // LFO modulates all filter frequencies with proper DC offset.
    // Sweep range: baseFreq → baseFreq * 2^oct
    // Using DC offset + amplitude so frequency stays positive:
    //   min = baseFreq, max = baseFreq * 2^oct
    //   offset = (min + max) / 2, amplitude = (max - min) / 2
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    const lfoDcSource = createDCSource(ctx);
    const lfoDcGain = ctx.createGain();

    const maxFreq = baseFreq * Math.pow(2, oct);
    const amplitude = (maxFreq - baseFreq) / 2;
    const offset = (maxFreq + baseFreq) / 2;

    lfo.frequency.value = freq;
    lfo.type = 'sine';
    lfoGain.gain.value = amplitude;
    lfoDcGain.gain.value = offset;

    lfo.connect(lfoGain);
    lfoDcSource.connect(lfoDcGain);
    for (const f of filters) {
      lfoGain.connect(f.frequency);
      lfoDcGain.connect(f.frequency);
    }

    mix.wet = options?.wet ?? 0.5;

    super(mix.input, mix.output);
    this._filters = filters;
    this._lfo = lfo;
    this._lfoGain = lfoGain;
    this._lfoDcGain = lfoDcGain;
    this._lfoDcSource = lfoDcSource;
    this._mix = mix;
    this._frequency = freq;
    this._octaves = oct;
    this._stages = stages;
    this._Q = q;
    this._baseFrequency = baseFreq;

    try { lfo.start(); } catch { /* */ }
  }

  get frequency(): number { return this._frequency; }
  set frequency(v: number) {
    this._frequency = v;
    this._lfo.frequency.value = v;
  }

  get octaves(): number { return this._octaves; }
  set octaves(v: number) {
    this._octaves = v;
    const maxFreq = this._baseFrequency * Math.pow(2, v);
    this._lfoGain.gain.value = (maxFreq - this._baseFrequency) / 2;
    this._lfoDcGain.gain.value = (maxFreq + this._baseFrequency) / 2;
  }

  get stages(): number { return this._stages; }
  set stages(v: number) {
    if (v !== this._stages) {
      throw new Error('NativePhaser does not support changing stages after construction');
    }
  }

  get Q(): number { return this._Q; }
  set Q(v: number) {
    this._Q = v;
    for (const f of this._filters) f.Q.value = v;
  }

  get baseFrequency(): number { return this._baseFrequency; }
  set baseFrequency(v: number) {
    this._baseFrequency = v;
    const maxFreq = v * Math.pow(2, this._octaves);
    for (const f of this._filters) f.frequency.value = (maxFreq + v) / 2;
    this._lfoGain.gain.value = (maxFreq - v) / 2;
    this._lfoDcGain.gain.value = (maxFreq + v) / 2;
  }

  get wet(): number { return this._mix.wet; }
  set wet(v: number) { this._mix.wet = v; }

  dispose(): void {
    try { this._lfo.stop(); } catch { /* */ }
    try { this._lfo.disconnect(); } catch { /* */ }
    try { this._lfoGain.disconnect(); } catch { /* */ }
    try { this._lfoDcSource.stop(); } catch { /* */ }
    try { this._lfoDcSource.disconnect(); } catch { /* */ }
    try { this._lfoDcGain.disconnect(); } catch { /* */ }
    super.dispose();
  }
}

class NativeEQ3 extends NativeNodeWrapper implements IDSPEQ3 {
  private readonly _lowFilter: BiquadFilterNode;
  private readonly _midFilter: BiquadFilterNode;
  private readonly _highFilter: BiquadFilterNode;
  private _lowFrequency: number;
  private _highFrequency: number;

  constructor(ctx: AudioContext, options?: IDSPEQ3Options) {
    const low = ctx.createBiquadFilter();
    const mid = ctx.createBiquadFilter();
    const high = ctx.createBiquadFilter();

    low.type = 'lowshelf';
    low.frequency.value = options?.lowFrequency ?? 400;
    low.gain.value = options?.low ?? 0;

    mid.type = 'peaking';
    mid.frequency.value = Math.sqrt(
      (options?.lowFrequency ?? 400) * (options?.highFrequency ?? 2500),
    );
    mid.Q.value = 0.5;
    mid.gain.value = options?.mid ?? 0;

    high.type = 'highshelf';
    high.frequency.value = options?.highFrequency ?? 2500;
    high.gain.value = options?.high ?? 0;

    // Chain: low → mid → high
    low.connect(mid);
    mid.connect(high);

    super(low, high);
    this._lowFilter = low;
    this._midFilter = mid;
    this._highFilter = high;
    this._lowFrequency = options?.lowFrequency ?? 400;
    this._highFrequency = options?.highFrequency ?? 2500;
  }

  get low(): number { return this._lowFilter.gain.value; }
  set low(v: number) { this._lowFilter.gain.value = v; }

  get mid(): number { return this._midFilter.gain.value; }
  set mid(v: number) { this._midFilter.gain.value = v; }

  get high(): number { return this._highFilter.gain.value; }
  set high(v: number) { this._highFilter.gain.value = v; }

  get lowFrequency(): number { return this._lowFrequency; }
  set lowFrequency(v: number) {
    this._lowFrequency = v;
    this._lowFilter.frequency.value = v;
    this._midFilter.frequency.value = Math.sqrt(v * this._highFrequency);
  }

  get highFrequency(): number { return this._highFrequency; }
  set highFrequency(v: number) {
    this._highFrequency = v;
    this._highFilter.frequency.value = v;
    this._midFilter.frequency.value = Math.sqrt(this._lowFrequency * v);
  }
}

class NativeConvolver extends NativeNodeWrapper implements IDSPConvolver {
  private readonly _convolver: ConvolverNode;
  private readonly _ctx: AudioContext;

  constructor(ctx: AudioContext) {
    const c = ctx.createConvolver();
    super(c);
    this._convolver = c;
    this._ctx = ctx;
  }

  get buffer(): AudioBuffer | null { return this._convolver.buffer; }
  set buffer(v: AudioBuffer | null) { this._convolver.buffer = v; }

  async load(url: string): Promise<void> {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    this._convolver.buffer = await this._ctx.decodeAudioData(arrayBuffer);
  }
}

class NativeLFO extends NativeNodeWrapper implements IDSPLFO {
  private readonly _osc: OscillatorNode;
  private readonly _gain: GainNode;
  private readonly _dcOffset: GainNode;
  private readonly _dcSource: AudioBufferSourceNode;
  private readonly _sum: GainNode;
  private _min: number;
  private _max: number;

  constructor(ctx: AudioContext, options?: IDSPLFOOptions) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const sum = ctx.createGain();

    // DC offset via a looped AudioBufferSourceNode outputting constant 1.0.
    const dcSource = createDCSource(ctx);
    const dcOffset = ctx.createGain();

    const min = options?.min ?? 0;
    const max = options?.max ?? 1;
    const freq = options?.frequency ?? 1;

    osc.frequency.value = freq;
    osc.type = 'sine';

    // LFO output: osc [-1, 1] → gain (amplitude) + dcOffset (DC) → sum → [min, max]
    // amplitude = (max - min) / 2, offset = (max + min) / 2
    gain.gain.value = (max - min) / 2;
    dcOffset.gain.value = (max + min) / 2;
    sum.gain.value = 1;

    osc.connect(gain);
    gain.connect(sum);
    dcSource.connect(dcOffset);
    dcOffset.connect(sum);

    // Gate output until start() — prevents DC offset from shifting
    // connected AudioParams before the LFO is explicitly activated.
    sum.gain.value = 0;

    super(sum, sum);
    this._osc = osc;
    this._gain = gain;
    this._dcOffset = dcOffset;
    this._dcSource = dcSource;
    this._sum = sum;
    this._min = min;
    this._max = max;
  }

  get frequency(): number { return this._osc.frequency.value; }
  set frequency(v: number) { this._osc.frequency.value = v; }

  get min(): number { return this._min; }
  set min(v: number) {
    this._min = v;
    this._gain.gain.value = (this._max - v) / 2;
    this._dcOffset.gain.value = (this._max + v) / 2;
  }

  get max(): number { return this._max; }
  set max(v: number) {
    this._max = v;
    this._gain.gain.value = (v - this._min) / 2;
    this._dcOffset.gain.value = (v + this._min) / 2;
  }

  start(): void {
    this._sum.gain.value = 1;
    try { this._osc.start(); } catch { /* already started */ }
  }

  stop(): void {
    // Gate output to zero instead of stopping the oscillator,
    // since stopped OscillatorNodes cannot be restarted.
    this._sum.gain.value = 0;
  }

  dispose(): void {
    try { this._osc.stop(); } catch { /* already stopped */ }
    try { this._dcSource.stop(); } catch { /* already stopped */ }
    super.dispose();
  }

  connectParam(destination: AudioParam): void {
    this._sum.connect(destination);
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Native Web Audio implementation of IDSPFactory.
 *
 * Fully replaces Tone.js for all effect and synth nodes.
 * Effects use native Web Audio API + Phase 2 Core DSP library.
 * Synths use native OscillatorNode + GainNode + BiquadFilterNode.
 */
export class NativeDSPFactory implements IDSPFactory {
  private readonly _ctx: AudioContext;

  constructor(ctx: AudioContext) {
    this._ctx = ctx;
  }

  // Effects — all native, no Tone.js
  createGain(options?: IDSPGainOptions): IDSPGain {
    return new NativeGain(this._ctx, options);
  }

  createFilter(options?: IDSPFilterOptions): IDSPFilter {
    return new NativeFilter(this._ctx, options);
  }

  createPanner(pan?: number): IDSPPanner {
    return new NativePanner(this._ctx, pan);
  }

  createCompressor(options?: IDSPCompressorOptions): IDSPCompressor {
    return new NativeCompressor(this._ctx, options);
  }

  createReverb(options?: IDSPReverbOptions): IDSPReverb {
    return new NativeReverb(this._ctx, options);
  }

  createDelay(options?: IDSPDelayOptions): IDSPDelay {
    return new NativeDelay(this._ctx, options);
  }

  createDistortion(options?: IDSPDistortionOptions): IDSPDistortion {
    return new NativeDistortion(this._ctx, options);
  }

  createChorus(options?: IDSPChorusOptions): IDSPChorus {
    return new NativeChorus(this._ctx, options);
  }

  createPhaser(options?: IDSPPhaserOptions): IDSPPhaser {
    return new NativePhaser(this._ctx, options);
  }

  createEQ3(options?: IDSPEQ3Options): IDSPEQ3 {
    return new NativeEQ3(this._ctx, options);
  }

  createConvolver(): IDSPConvolver {
    return new NativeConvolver(this._ctx);
  }

  createLFO(options?: IDSPLFOOptions): IDSPLFO {
    return new NativeLFO(this._ctx, options);
  }

  // Synths — all native, no Tone.js (Phase 4)
  createPolySynth(options?: IDSPPolySynthOptions): IDSPPolySynth {
    return new NativePolySynth(this._ctx, options);
  }

  createFMSynth(options?: IDSPFMSynthOptions): IDSPFMSynth {
    return new NativeFMSynth(this._ctx, options);
  }

  createMembraneSynth(options?: IDSPMembraneSynthOptions): IDSPMembraneSynth {
    return new NativeMembraneSynth(this._ctx, options);
  }

  createNoiseSynth(options?: IDSPNoiseSynthOptions): IDSPNoiseSynth {
    return new NativeNoiseSynth(this._ctx, options);
  }

  createMetalSynth(options?: IDSPMetalSynthOptions): IDSPMetalSynth {
    return new NativeMetalSynth(this._ctx, options);
  }

  createSynth(options?: IDSPSynthOptions): IDSPSynth {
    return new NativeSynth(this._ctx, options);
  }

  createFrequencyEnvelope(options?: IDSPFrequencyEnvelopeOptions): IDSPFrequencyEnvelope {
    return new NativeFrequencyEnvelope(this._ctx, options);
  }

  createBufferSource(): IDSPBufferSource {
    return new NativeBufferSource(this._ctx);
  }

  getContext(): AudioContext {
    return this._ctx;
  }

  get sampleRate(): number {
    return this._ctx.sampleRate;
  }
}
