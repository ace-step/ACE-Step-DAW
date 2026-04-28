/**
 * DSP Provider Abstraction Layer — Phase 0.
 *
 * Defines TypeScript interfaces between business logic (EffectsEngine,
 * SynthEngine, DrumEngine) and the audio DSP backend.
 *
 * Current implementation: Tone.js (via ToneAdapter).
 * Future implementations: custom AudioWorklet DSP, Rust WASM, etc.
 *
 * Design principle: every interface exposes the *minimum* surface area
 * needed by existing engine code.  The `inputNode`/`outputNode` escape
 * hatch allows gradual migration — engines can still reach the underlying
 * AudioNode(s) when the abstraction doesn't yet cover a use-case.
 */

// ---------------------------------------------------------------------------
// Base
// ---------------------------------------------------------------------------

/** Minimal contract shared by all DSP nodes. */
export interface IDSPNode {
  /** Connect this node's output to another DSP node's input. */
  connect(destination: IDSPNode): IDSPNode;

  /** Connect this node's output to a raw Web Audio AudioNode. */
  connectNative(destination: AudioNode): AudioNode;

  /** Connect this node's output to a raw Web Audio AudioParam. */
  connectParam?(destination: AudioParam): void;

  /** Disconnect from all (or a specific) destination. */
  disconnect(destination?: IDSPNode | AudioNode): void;

  /** Release resources. After calling dispose(), the node must not be used. */
  dispose(): void;

  /**
   * Underlying Web Audio input node.
   * Used when the node is a *destination* — callers connect their output here.
   */
  readonly inputNode: AudioNode;

  /**
   * Underlying Web Audio output node.
   * Used when the node is a *source* — this feeds into the next stage.
   */
  readonly outputNode: AudioNode;
}

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------

export interface IDSPGain extends IDSPNode {
  readonly gain: AudioParam;
}

export interface IDSPFilter extends IDSPNode {
  type: BiquadFilterType;
  readonly frequency: AudioParam;
  readonly Q: AudioParam;
  readonly gain: AudioParam;
}

export interface IDSPCompressor extends IDSPNode {
  readonly threshold: AudioParam;
  readonly ratio: AudioParam;
  readonly attack: AudioParam;
  readonly release: AudioParam;
  readonly knee: AudioParam;
}

export interface IDSPReverb extends IDSPNode {
  decay: number;
  preDelay: number;
  wet: number;
}

export interface IDSPDelay extends IDSPNode {
  readonly delayTime: AudioParam;
  feedback: number;
  wet: number;
}

export interface IDSPDistortion extends IDSPNode {
  distortion: number;
  wet: number;
}

export interface IDSPChorus extends IDSPNode {
  frequency: number;
  delayTime: number;
  depth: number;
  feedback: number;
  wet: number;
  start(): void;
}

export interface IDSPPhaser extends IDSPNode {
  frequency: number;
  octaves: number;
  stages: number;
  Q: number;
  baseFrequency: number;
  wet: number;
}

export interface IDSPEQ3 extends IDSPNode {
  low: number;
  mid: number;
  high: number;
  lowFrequency: number;
  highFrequency: number;
}

export interface IDSPConvolver extends IDSPNode {
  buffer: AudioBuffer | null;
  load(url: string): Promise<void>;
}

export interface IDSPLFO extends IDSPNode {
  frequency: number;
  min: number;
  max: number;
  start(): void;
  stop(): void;
  /** Connect this LFO's output to an AudioParam for modulation. */
  connectParam(destination: AudioParam): void;
}

export interface IDSPPanner extends IDSPNode {
  pan: number;
}

// ---------------------------------------------------------------------------
// Synth interfaces
// ---------------------------------------------------------------------------

/**
 * A polyphonic synthesizer that can trigger notes.
 * Abstracts Tone.PolySynth / future WASM synth.
 */
export interface IDSPPolySynth extends IDSPNode {
  triggerAttack(notes: string | string[], time?: number, velocity?: number): void;
  triggerRelease(notes: string | string[], time?: number): void;
  triggerAttackRelease(
    notes: string | string[],
    duration: number | string,
    time?: number,
    velocity?: number,
  ): void;
  releaseAll(time?: number): void;
  set(options: Record<string, unknown>): void;
}

/**
 * FM synthesizer — abstracts Tone.FMSynth.
 */
export interface IDSPFMSynth extends IDSPNode {
  triggerAttack(note: string, time?: number, velocity?: number): void;
  triggerRelease(time?: number): void;
  triggerAttackRelease(
    note: string,
    duration: number | string,
    time?: number,
    velocity?: number,
  ): void;
}

/**
 * Membrane synthesizer for kicks/toms — abstracts Tone.MembraneSynth.
 */
export interface IDSPMembraneSynth extends IDSPNode {
  triggerAttackRelease(
    note: string,
    duration: number | string,
    time?: number,
    velocity?: number,
  ): void;
}

/**
 * Noise synthesizer for hi-hats/snares — abstracts Tone.NoiseSynth.
 */
export interface IDSPNoiseSynth extends IDSPNode {
  triggerAttackRelease(
    duration: number | string,
    time?: number,
    velocity?: number,
  ): void;
}

/**
 * Metal synthesizer for cymbals — abstracts Tone.MetalSynth.
 */
export interface IDSPMetalSynth extends IDSPNode {
  triggerAttackRelease(
    duration: number | string,
    time?: number,
    velocity?: number,
  ): void;
}

/**
 * Basic mono synth — abstracts Tone.Synth.
 */
export interface IDSPSynth extends IDSPNode {
  triggerAttackRelease(
    note: string,
    duration: number | string,
    time?: number,
    velocity?: number,
  ): void;
}

/**
 * Frequency envelope — abstracts Tone.FrequencyEnvelope.
 */
export interface IDSPFrequencyEnvelope extends IDSPNode {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  baseFrequency: number;
  octaves: number;
  triggerAttack(time?: number): void;
  triggerRelease(time?: number): void;
}

/**
 * Audio buffer source — abstracts Tone.ToneBufferSource.
 */
export interface IDSPBufferSource extends IDSPNode {
  buffer: AudioBuffer | null;
  playbackRate: number;
  loop: boolean;
  loopStart: number;
  loopEnd: number;
  start(time?: number, offset?: number, duration?: number): void;
  stop(time?: number): void;
  onended: (() => void) | null;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export interface IDSPGainOptions {
  gain?: number;
}

export interface IDSPFilterOptions {
  type?: BiquadFilterType;
  frequency?: number;
  Q?: number;
  gain?: number;
}

export interface IDSPCompressorOptions {
  threshold?: number;
  ratio?: number;
  attack?: number;
  release?: number;
  knee?: number;
}

export interface IDSPReverbOptions {
  decay?: number;
  preDelay?: number;
  wet?: number;
}

export interface IDSPDelayOptions {
  delayTime?: number;
  feedback?: number;
  wet?: number;
  maxDelay?: number;
}

export interface IDSPDistortionOptions {
  distortion?: number;
  wet?: number;
}

export interface IDSPChorusOptions {
  frequency?: number;
  delayTime?: number;
  depth?: number;
  feedback?: number;
  wet?: number;
}

export interface IDSPPhaserOptions {
  frequency?: number;
  octaves?: number;
  stages?: number;
  Q?: number;
  baseFrequency?: number;
  wet?: number;
}

export interface IDSPEQ3Options {
  low?: number;
  mid?: number;
  high?: number;
  lowFrequency?: number;
  highFrequency?: number;
}

export interface IDSPLFOOptions {
  frequency?: number;
  min?: number;
  max?: number;
}

export interface IDSPPolySynthOptions {
  maxPolyphony?: number;
  oscillator?: { type: string };
  envelope?: {
    attack?: number;
    decay?: number;
    sustain?: number;
    release?: number;
  };
}

export interface IDSPFMSynthOptions {
  modulationIndex?: number;
  harmonicity?: number;
  oscillator?: { type: string };
  modulation?: { type: string };
  envelope?: {
    attack?: number;
    decay?: number;
    sustain?: number;
    release?: number;
  };
}

export interface IDSPMembraneSynthOptions {
  pitchDecay?: number;
  octaves?: number;
  oscillator?: { type: string };
  envelope?: {
    attack?: number;
    decay?: number;
    sustain?: number;
    release?: number;
  };
}

export interface IDSPNoiseSynthOptions {
  noise?: { type: string };
  envelope?: {
    attack?: number;
    decay?: number;
    sustain?: number;
    release?: number;
  };
}

export interface IDSPMetalSynthOptions {
  frequency?: number;
  envelope?: {
    attack?: number;
    decay?: number;
    release?: number;
  };
  harmonicity?: number;
  modulationIndex?: number;
  resonance?: number;
  octaves?: number;
}

export interface IDSPSynthOptions {
  oscillator?: { type: string };
  envelope?: {
    attack?: number;
    decay?: number;
    sustain?: number;
    release?: number;
  };
}

export interface IDSPFrequencyEnvelopeOptions {
  attack?: number;
  decay?: number;
  sustain?: number;
  release?: number;
  baseFrequency?: number;
  octaves?: number;
}

/**
 * Factory interface for creating DSP nodes.
 *
 * Engines call these methods instead of `new Tone.*()` directly,
 * allowing the underlying DSP backend to be swapped without
 * changing engine code.
 */
export interface IDSPFactory {
  // Basic nodes
  createGain(options?: IDSPGainOptions): IDSPGain;
  createFilter(options?: IDSPFilterOptions): IDSPFilter;
  createPanner(pan?: number): IDSPPanner;

  // Effects
  createCompressor(options?: IDSPCompressorOptions): IDSPCompressor;
  createReverb(options?: IDSPReverbOptions): IDSPReverb;
  createDelay(options?: IDSPDelayOptions): IDSPDelay;
  createDistortion(options?: IDSPDistortionOptions): IDSPDistortion;
  createChorus(options?: IDSPChorusOptions): IDSPChorus;
  createPhaser(options?: IDSPPhaserOptions): IDSPPhaser;
  createEQ3(options?: IDSPEQ3Options): IDSPEQ3;
  createConvolver(): IDSPConvolver;
  createLFO(options?: IDSPLFOOptions): IDSPLFO;

  // Synths
  createPolySynth(options?: IDSPPolySynthOptions): IDSPPolySynth;
  createFMSynth(options?: IDSPFMSynthOptions): IDSPFMSynth;
  createMembraneSynth(options?: IDSPMembraneSynthOptions): IDSPMembraneSynth;
  createNoiseSynth(options?: IDSPNoiseSynthOptions): IDSPNoiseSynth;
  createMetalSynth(options?: IDSPMetalSynthOptions): IDSPMetalSynth;
  createSynth(options?: IDSPSynthOptions): IDSPSynth;
  createFrequencyEnvelope(options?: IDSPFrequencyEnvelopeOptions): IDSPFrequencyEnvelope;
  createBufferSource(): IDSPBufferSource;

  /**
   * Get the raw AudioContext (needed for native operations).
   * Engines may use this for features not yet abstracted.
   */
  getContext(): AudioContext;

  /** Sample rate of the current audio context. */
  readonly sampleRate: number;
}
