export type TrackName =
  | 'woodwinds' | 'brass' | 'fx' | 'synth' | 'strings'
  | 'percussion' | 'keyboard' | 'guitar' | 'bass' | 'drums'
  | 'backing_vocals' | 'vocals'
  | 'custom';

export type TrackType = 'stems' | 'mix' | 'sample' | 'sequencer' | 'pianoRoll' | 'drumMachine' | 'strudel' | 'video';
export type InputMonitoringMode = 'off' | 'auto' | 'on';
export type SynthPreset = 'piano' | 'strings' | 'pad' | 'lead' | 'bass' | 'organ' | 'sampler';

// ─── Synth Parameter Types ────────────────────────────────────────────────────

/** ADSR amplitude envelope for a synth track. */
export interface SynthEnvelope {
  /** Attack time in seconds (0.001–5). */
  attack: number;
  /** Decay time in seconds (0.001–5). */
  decay: number;
  /** Sustain level (0–1). */
  sustain: number;
  /** Release time in seconds (0.001–10). */
  release: number;
}

/** Filter envelope (ADSR applied to filter cutoff frequency). */
export interface FilterEnvelope {
  /** Attack time in seconds (0.001–5). */
  attack: number;
  /** Decay time in seconds (0.001–5). */
  decay: number;
  /** Sustain level (0–1, fraction of the frequency range). */
  sustain: number;
  /** Release time in seconds (0.001–10). */
  release: number;
  /** Base frequency in Hz (20–20000) — the resting cutoff when envelope is at 0. */
  baseFrequency: number;
  /** Number of octaves the envelope sweeps above baseFrequency (0–8). */
  octaves: number;
}

export type SynthFilterType = 'lowpass' | 'highpass' | 'bandpass';

/** Filter settings for a synth track. */
export interface SynthFilter {
  type: SynthFilterType;
  /** Cutoff frequency in Hz (20–20000). */
  frequency: number;
  /** Resonance / Q factor (0.1–30). */
  Q: number;
}

export type LfoShape = 'sine' | 'square' | 'triangle' | 'sawtooth';

/** LFO modulation settings for a synth track. */
export interface SynthLfo {
  /** LFO rate in Hz (0.01–50). */
  rate: number;
  /** Modulation depth (0–1). */
  depth: number;
  /** Waveform shape. */
  shape: LfoShape;
}

/** Unison / detune voice-stacking settings for a synth track. */
export interface UnisonSettings {
  /** Number of stacked voices (1–8). 1 = no unison. */
  voices: number;
  /** Detune amount in cents spread across voices (0–100). */
  detune: number;
  /** Stereo spread of detuned voices (0–1). 0 = mono, 1 = full stereo. */
  spread: number;
}

export type DrumKitName = '808' | 'acoustic' | 'electronic' | 'lofi';
export type SamplerPlaybackMode = 'classic' | 'oneShot' | 'loop';
/**
 * Time-stretch algorithm mode.
 * - 'repitch': uses playbackRate (changes pitch)
 * - 'slice': uses warp markers
 * - 'beats': transient-preserving slice for rhythmic material
 * - 'tones': WSOLA for monophonic sources
 * - 'complex': spectral/phase-vocoder-style stretching for general material
 * - 'complexPro': enhanced spectral stretching for mixed or full-range material
 * - 'texture': granular synthesis for ambient/pad material
 */
export type StretchMode = 'repitch' | 'slice' | 'beats' | 'tones' | 'complex' | 'complexPro' | 'texture';
export type PianoRollGrid = '1/4' | '1/8' | '1/16' | '1/32';
export type StrudelMidiNotationType = 'absolute' | 'relative';
export type StrudelMidiTimingStyle = 'subdivision' | 'absoluteDuration';
export type StrudelSoundMapping = 'auto' | 'piano' | 'sawtooth' | 'triangle' | 'square';
export type StrudelTargetTrackMode = 'currentOrNew' | 'alwaysNew';

/** A snapshot of Strudel code captured during editing or evaluation. */
export interface StrudelCodeVersion {
  id: string;
  code: string;
  timestamp: number;
  label?: string;
}

export interface StrudelFromMidiOptions {
  notationType: StrudelMidiNotationType;
  timingStyle: StrudelMidiTimingStyle;
  quantize: boolean;
  measuresPerLine: number;
  keyScale?: string | null;
  soundMapping: StrudelSoundMapping;
  targetTrackMode: StrudelTargetTrackMode;
}

export interface StrudelFromMidiSourceSummary {
  sourceKind: 'clip' | 'track' | 'file';
  label: string;
  trackCount: number;
  noteCount: number;
  drumTrackCount: number;
}

export interface StrudelFromMidiResult {
  code: string;
  warnings: string[];
  sourceSummary: StrudelFromMidiSourceSummary;
  bpm: number;
  timeSignature: {
    numerator: number;
    denominator: number;
  };
}

/** Configuration for the sampler instrument on a pianoRoll track. */
export interface SamplerConfig {
  /** IndexedDB audio key for the loaded sample. */
  audioKey: string;
  /** MIDI note number the sample was recorded at (default 60 = C4). */
  rootNote: number;
  /** Sample trim start in seconds. */
  trimStart: number;
  /** Sample trim end in seconds. */
  trimEnd: number;
  /** Playback mode inspired by Quick Sampler. */
  playbackMode: SamplerPlaybackMode;
  /** Loop region start in seconds. */
  loopStart: number;
  /** Loop region end in seconds. */
  loopEnd: number;
  /** ADSR attack time in seconds. */
  attack: number;
  /** ADSR decay time in seconds. */
  decay: number;
  /** ADSR sustain level (0–1). */
  sustain: number;
  /** ADSR release time in seconds. */
  release: number;
  /** Optional velocity layers for multi-sample velocity switching and crossfading. */
  velocityLayers?: VelocityLayer[];
  /** Multi-sample zones mapped across key and velocity ranges. */
  zones?: SampleZone[];
}

/** A single velocity layer in a sampler instrument zone. */
export interface VelocityLayer {
  /** Minimum velocity that triggers this layer (0–127). */
  minVelocity: number;
  /** Maximum velocity that triggers this layer (0–127). */
  maxVelocity: number;
  /** IndexedDB audio key for the layer's sample. */
  sampleUrl: string;
  /** Output gain multiplier for this layer (0–1, default 1). */
  gain: number;
}

/** A key/velocity zone in a multi-sample instrument. */
export interface SampleZone {
  /** Unique zone identifier. */
  id: string;
  /** IndexedDB audio key for this zone's sample. */
  audioKey: string;
  /** Display name for this zone's sample. */
  sampleName?: string;
  /** MIDI note the sample was recorded at (pitch reference). */
  rootNote: number;
  /** Lowest MIDI note this zone responds to (0–127). */
  lowKey: number;
  /** Highest MIDI note this zone responds to (0–127). */
  highKey: number;
  /** Lowest velocity this zone responds to (0–127). */
  lowVelocity: number;
  /** Highest velocity this zone responds to (0–127). */
  highVelocity: number;
  /** Per-zone volume multiplier (0–1, default 1). */
  volume: number;
  /** Per-zone stereo pan (-1 to 1, default 0). */
  pan: number;
  /** Tuning offset in cents (-1200 to 1200, default 0). */
  tuneOffset: number;
  /** Crossfade width in semitones for smooth transitions between adjacent zones (0–12). */
  crossfadeWidth: number;
}

export type LegacySynthVoicePreset = Exclude<SynthPreset, 'sampler'>;
export type InstrumentKind = 'subtractive' | 'sampler' | 'fm' | 'wavetable' | 'granular' | 'additive' | 'physical';
export type InstrumentWaveform = 'sine' | 'triangle' | 'square' | 'sawtooth';
export type InstrumentLfoTarget = 'off' | 'pitch' | 'filterCutoff' | 'amp' | 'pan';

export interface InstrumentEnvelope {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
}

export interface InstrumentOscillatorSettings {
  waveform: InstrumentWaveform;
  octave: number;
  detuneCents: number;
  level: number;
}

export interface InstrumentFilterSettings {
  enabled: boolean;
  type: 'lowpass' | 'highpass' | 'bandpass';
  cutoffHz: number;
  resonance: number;
  drive: number;
  keyTracking: number;
}

export interface InstrumentFilterEnvelopeSettings extends InstrumentEnvelope {
  amount: number;
}

export interface InstrumentLfoSettings {
  enabled: boolean;
  waveform: InstrumentWaveform;
  target: InstrumentLfoTarget;
  rateHz: number;
  depth: number;
  retrigger: boolean;
}

// ─── Modulation Matrix Types ───────────────────────────────────────────────

export type ModulationSource =
  | 'lfo1'
  | 'lfo2'
  | 'ampEnv'
  | 'filterEnv'
  | 'modEnv'
  | 'velocity'
  | 'modWheel'
  | 'macro1'
  | 'macro2'
  | 'macro3'
  | 'macro4';

export type ModulationDestination =
  | 'pitch'
  | 'filterCutoff'
  | 'filterResonance'
  | 'amp'
  | 'pan'
  | 'oscLevel'
  | 'lfo1Rate'
  | 'lfo2Rate'
  | 'fmIndex'
  | 'wtPosition';

export interface ModulationSlot {
  source: ModulationSource;
  destination: ModulationDestination;
  /** Modulation amount (-1 to 1 for bipolar, 0 to 1 for unipolar). */
  amount: number;
  /** If true, source range is -1..1. If false, source range is 0..1. */
  bipolar: boolean;
}

export interface ModulationLfo {
  waveform: InstrumentWaveform;
  rateHz: number;
  /** Whether LFO resets phase on note-on. */
  retrigger: boolean;
}

export interface ModulationSettings {
  lfo1: ModulationLfo;
  lfo2: ModulationLfo;
  /** Additional ADSR envelope for modulation routing. */
  modEnvelope: InstrumentEnvelope;
  /** Up to 8 modulation routing slots. */
  slots: ModulationSlot[];
  /** 4 macro knob values (0-1), routed via slots with macro1-4 sources. */
  macros: [number, number, number, number];
}

export const DEFAULT_MODULATION_SETTINGS: ModulationSettings = {
  lfo1: { waveform: 'sine', rateHz: 1, retrigger: false },
  lfo2: { waveform: 'triangle', rateHz: 0.5, retrigger: false },
  modEnvelope: { attack: 0.01, decay: 0.3, sustain: 0.5, release: 0.5 },
  slots: [],
  macros: [0, 0, 0, 0],
};

export interface InstrumentUnisonSettings {
  voices: number;
  detuneCents: number;
  stereoSpread: number;
  blend: number;
}

export interface SubtractiveInstrumentSettings {
  oscillator: InstrumentOscillatorSettings;
  ampEnvelope: InstrumentEnvelope;
  filter: InstrumentFilterSettings;
  filterEnvelope: InstrumentFilterEnvelopeSettings;
  lfo: InstrumentLfoSettings;
  unison: InstrumentUnisonSettings;
  glideTime: number;
  outputGain: number;
  /** Modulation matrix — optional for backward compat with existing instruments. */
  modulation?: ModulationSettings;
}

export interface SubtractiveTrackInstrument {
  kind: 'subtractive';
  preset: LegacySynthVoicePreset;
  name: string;
  settings: SubtractiveInstrumentSettings;
}

export interface SamplerInstrumentSettings {
  audioKey?: string;
  sampleName?: string;
  rootNote: number;
  sampleDuration?: number;
  trimStart: number;
  trimEnd: number;
  playbackMode: SamplerPlaybackMode;
  loopStart: number;
  loopEnd: number;
  ampEnvelope: InstrumentEnvelope;
}

export interface SamplerTrackInstrument {
  kind: 'sampler';
  preset: 'sampler';
  name: string;
  settings: SamplerInstrumentSettings;
}

export interface FmOperatorSettings {
  waveform: InstrumentWaveform;
  ratio: number;
  level: number;
}

/**
 * FM synthesis routing algorithm.
 * - `serial`   -- Modulator -> Carrier (classic 2-op FM).
 * - `parallel` -- Both operators output as independent carriers.
 * - `stack`    -- Two modulators feed a single carrier (thick modulation).
 * - `feedback` -- Modulator feeds back into itself, then into the carrier.
 */
export type FmAlgorithm = 'serial' | 'parallel' | 'stack' | 'feedback';

export interface FmInstrumentSettings {
  carrier: FmOperatorSettings;
  modulator: FmOperatorSettings;
  modulationIndex: number;
  harmonicity: number;
  feedback: number;
  algorithm: FmAlgorithm;
  ampEnvelope: InstrumentEnvelope;
  outputGain: number;
}

export interface FmTrackInstrument {
  kind: 'fm';
  preset: 'fm';
  name: string;
  fallbackPreset: LegacySynthVoicePreset;
  settings: FmInstrumentSettings;
}

// ─── Wavetable Synthesis Types ──────────────────────────────────────────────

/** Description of a single waveform in a wavetable — stored as an array of harmonic partial amplitudes. */
export interface WavetableWaveform {
  /** Human-readable label (e.g. "Saw", "Square", "Formant A"). */
  name: string;
  /** Harmonic partial amplitudes. Index 0 = fundamental, 1 = 2nd harmonic, etc. */
  partials: number[];
}

/** Settings for wavetable synthesis on a track. */
export interface WavetableSettings {
  /** Ordered array of waveforms in the wavetable (minimum 2). */
  waveforms: WavetableWaveform[];
  /** Crossfade position between waveforms (0–1). 0 = first waveform, 1 = last. */
  position: number;
  /** Speed of automatic morphing in Hz (0 = static, no modulation). */
  morphSpeed: number;
  /** ADSR amplitude envelope. */
  ampEnvelope: InstrumentEnvelope;
  /** Output gain multiplier (0–2, default 0.55). */
  outputGain: number;
}

export interface WavetableTrackInstrument {
  kind: 'wavetable';
  preset: 'wavetable';
  name: string;
  fallbackPreset: LegacySynthVoicePreset;
  settings: WavetableSettings;
}

/** Grain envelope shape applied to each individual grain. */
export type GrainEnvelopeShape = 'hann' | 'triangle' | 'trapezoid' | 'tukey';

/** Configuration for the granular synthesis engine. */
export interface GranularSettings {
  /** IndexedDB audio key for the granular source sample. */
  audioKey: string;
  /** MIDI root note (default 60 = C4). */
  rootNote: number;
  /** Grain size in milliseconds (1–500). */
  grainSize: number;
  /** Grain density — number of grains triggered per second (1–100). */
  density: number;
  /** Playback position in source buffer (0–1, normalized). */
  position: number;
  /** Position scatter — randomize grain start within this range (0–1). */
  positionScatter: number;
  /** Pitch scatter — randomize pitch per grain in semitones (0–24). */
  pitchScatter: number;
  /** Grain envelope shape. */
  envelopeShape: GrainEnvelopeShape;
  /** Grain attack portion of envelope (0–0.5, fraction of grain size). */
  grainAttack: number;
  /** Grain release portion of envelope (0–0.5, fraction of grain size). */
  grainRelease: number;
  /** Freeze mode — lock grain position for sustained textures. */
  freeze: boolean;
  /** Stereo spray/spread of grains (0–1, 0=mono center, 1=full stereo). */
  spread: number;
  /** Global output gain (0–1). */
  gain: number;
  /** Amplitude envelope attack in seconds. */
  attack: number;
  /** Amplitude envelope release in seconds. */
  release: number;
}

export interface GranularTrackInstrument {
  kind: 'granular';
  preset: 'granular';
  name: string;
  settings: GranularSettings;
}

export type AdditivePreset = 'saw' | 'square' | 'organ' | 'bell' | 'custom';

export interface AdditivePartial {
  ratio: number;      // frequency multiplier (1 = fundamental, 2 = 2nd harmonic, etc.)
  amplitude: number;  // 0–1
  phase: number;      // 0–2π
}

export interface AdditiveSettings {
  partials: AdditivePartial[];
  ampEnvelope: InstrumentEnvelope;
  outputGain: number;
}

export interface AdditiveTrackInstrument {
  kind: 'additive';
  preset: AdditivePreset;
  name: string;
  settings: AdditiveSettings;
}

export type PhysicalExciterType = 'pluck' | 'bow' | 'hammer';
export type PhysicalModelPreset = 'acoustic-guitar' | 'harp' | 'kalimba' | 'marimba' | 'steel-drum' | 'custom';

export interface PhysicalModelSettings {
  exciter: PhysicalExciterType;
  damping: number;       // 0–1 (how quickly the sound decays; higher = more damped)
  brightness: number;    // 0–1 (lowpass filter in feedback; higher = brighter)
  pluckPosition: number; // 0–1 (where along the string the excitation occurs)
  bodySize: number;      // 0–1 (body resonance amount)
  outputGain: number;    // dB
}

export interface PhysicalTrackInstrument {
  kind: 'physical';
  preset: PhysicalModelPreset;
  name: string;
  settings: PhysicalModelSettings;
}

export type TrackInstrument =
  | SubtractiveTrackInstrument
  | SamplerTrackInstrument
  | FmTrackInstrument
  | WavetableTrackInstrument
  | GranularTrackInstrument
  | AdditiveTrackInstrument
  | PhysicalTrackInstrument;

export interface SamplerSettings {
  audioKey?: string;
  sampleName?: string;
  rootNote: number;
  sampleDuration?: number;
}

export interface BounceInPlaceOptions {
  includeEffects: boolean;
  normalize: boolean;
  replaceOriginal: boolean;
}

export type DrumPadFilterType = 'off' | 'lowpass' | 'highpass';

export interface DrumPadFilter {
  type: DrumPadFilterType;
  cutoff: number;          // 20–20000 Hz
}

export interface DrumPadSend {
  reverb: number;          // 0–1
  delay: number;           // 0–1
}

export interface DrumPad {
  id: string;
  name: string;
  sampleKey: string;       // built-in drum name or user sample IndexedDB key
  color: string;
  volume: number;          // 0–1
  pan: number;             // -1 to +1
  tune: number;            // -24 to +24 semitones
  decay: number;           // 0–1 (relative decay length)
  filter: DrumPadFilter;
  drive: number;           // 0–1 saturation amount
  send: DrumPadSend;
}

export interface DrumMachineConfig {
  pads: DrumPad[];
  kitName: DrumKitName;
}

export type ClipGenerationStatus =
  | 'empty' | 'idle' | 'queued' | 'generating' | 'processing' | 'ready' | 'error' | 'stale';

/** A time-stamped expression point for MPE expression curves. */
export interface ExpressionPoint {
  /** Beat position relative to note start. */
  beat: number;
  /** Value (0–127 for pressure/timbre, -8192–8191 for pitch bend). */
  value: number;
}

/** Per-note MPE expression data recorded from an MPE controller. */
export interface MpeExpressionData {
  /** Channel pressure curve (0–127). */
  pressureCurve?: ExpressionPoint[];
  /** CC74 timbre/slide curve (0–127). */
  timbreCurve?: ExpressionPoint[];
  /** Pitch bend curve (-8192 to 8191). */
  pitchBendCurve?: ExpressionPoint[];
}

export interface MidiNote {
  id: string;
  pitch: number;
  startBeat: number;
  durationBeats: number;
  velocity: number;
  isSlide?: boolean;
  /** Per-note MPE expression data (optional, populated from MPE recording). */
  mpeExpression?: MpeExpressionData;
}

export interface MidiClipData {
  notes: MidiNote[];
  grid: PianoRollGrid;
}

/** A timing/velocity groove template extracted from a MIDI clip. */
export interface GrooveTemplate {
  id: string;
  name: string;
  /** Normalized timing offsets per grid position (beat delta from quantized grid). */
  timingOffsets: number[];
  /** Normalized velocity multipliers per grid position (1.0 = original). */
  velocityPattern: number[];
  /** Grid size in beats used when extracting this groove. */
  gridBeats: number;
  /** Number of beats this groove pattern spans before looping. */
  lengthBeats: number;
  createdAt: number;
}

export interface EffectBase<T extends string, P> {
  id: string;
  type: T;
  enabled: boolean;
  params: P;
}

export interface EQ3Params {
  low: number;
  mid: number;
  high: number;
  lowFrequency: number;
  highFrequency: number;
}

export type ParametricEQBandType =
  | 'peaking'
  | 'lowshelf'
  | 'highshelf'
  | 'notch'
  | 'highpass'
  | 'lowpass'
  | 'tiltshelf'
  | 'bandpass'
  | 'allpass';

export interface ParametricEQBand {
  id: string;
  enabled: boolean;
  type: ParametricEQBandType;
  frequency: number;
  gain: number;
  q: number;
  solo?: boolean;
  bypass?: boolean;
}

export interface ParametricEQParams {
  mode: 'simple' | 'parametric';
  bands: ParametricEQBand[];
}

export interface CompressorParams {
  threshold: number;
  ratio: number;
  attack: number;
  release: number;
  knee: number;
  sidechainSourceTrackId?: string;
  detectionMode?: 'peak' | 'rms';
  lookahead?: number;
  autoMakeupGain?: boolean;
  sidechainHpf?: number;
  sidechainLpf?: number;
  mix?: number;
}

export interface GateParams {
  threshold: number;
  range: number;
  attack: number;
  hold: number;
  release: number;
  hysteresis: number;
  mode: 'gate' | 'expander';
  sidechainHpf: number;
  sidechainLpf: number;
}

export interface DeEsserParams {
  frequency: number;
  bandwidth: number;
  threshold: number;
  mode: 'wideband' | 'split';
  listen: boolean;
  range: number;
}

export interface TransientShaperParams {
  attack: number;
  sustain: number;
  mix: number;
  output: number;
}

export interface LimiterParams {
  ceiling: number;
  release: number;
  lookahead: number;
  gain: number;
  style: 'transparent' | 'aggressive' | 'warm';
}

export type SaturationType = 'tape' | 'tube' | 'transistor' | 'soft' | 'hard';

export interface SaturationParams {
  drive: number;
  saturationType: SaturationType;
  harmonicMix: number;
  inputGain: number;
  outputGain: number;
  mix: number;
}

export interface StereoImagerParams {
  width: number;
  midGain: number;
  sideGain: number;
  monoFreq: number;
  pan: number;
}

export type AlgorithmicReverbType = 'plate' | 'hall' | 'room' | 'chamber' | 'spring';

export interface AlgorithmicReverbParams {
  reverbType: AlgorithmicReverbType;
  decay: number;
  preDelay: number;
  damping: number;
  size: number;
  modRate: number;
  modDepth: number;
  erLevel: number;
  lowCut: number;
  highCut: number;
  mix: number;
}

export interface NoiseGateReductionParams {
  amount: number;
  threshold: number;
  mode: 'fast' | 'smooth';
  hfEmphasis: number;
  mix: number;
}

export interface ReverbParams {
  decay: number;
  preDelay: number;
  wet: number;
}

export interface DelayParams {
  time: number;
  feedback: number;
  wet: number;
}

export type MasteringPreset = 'balanced' | 'loud' | 'warm' | 'bright';
export type MasteringStatus = 'idle' | 'analyzing' | 'ready' | 'error';
export type MasteringTonalBalance = 'warm' | 'balanced' | 'bright';
export type LoudnessTarget = -14 | -11 | -8;

export interface MasteringAnalysis {
  inputLufs: number;
  peakDb: number;
  dynamicRangeDb: number;
  stereoWidth: number;
  tonalBalance: MasteringTonalBalance;
  recommendedPreset: MasteringPreset;
  trackCount: number;
  activeTrackCount: number;
  clipCount: number;
  analyzedAt: number;
}

export interface MasteringChain {
  lowShelfGain: number;
  midGain: number;
  highShelfGain: number;
  compressorThreshold: number;
  compressorRatio: number;
  stereoWidth: number;
  limiterThreshold: number;
  makeupGain: number;
}

export interface MasteringState {
  enabled: boolean;
  status: MasteringStatus;
  preset: MasteringPreset;
  loudnessTarget: LoudnessTarget;
  previewOriginal: boolean;
  analysis: MasteringAnalysis | null;
  chain: MasteringChain;
  outputLufs: number | null;
  error?: string;
}

export interface DistortionParams {
  amount: number;
  wet: number;
  distortionType: 'soft' | 'overdrive' | 'fuzz';
}

export interface FilterParams {
  frequency: number;
  resonance: number;
  filterType: 'lowpass' | 'highpass' | 'bandpass';
  lfoEnabled: boolean;
  lfoRate: number;
  lfoDepth: number;
}

export interface ChorusParams {
  frequency: number;    // LFO rate in Hz (0.1–10)
  delayTime: number;    // base delay in ms (0.5–20)
  depth: number;        // modulation depth (0–1)
  feedback: number;     // feedback amount (0–0.95)
  wet: number;          // dry/wet mix (0–1)
}

export interface FlangerParams {
  frequency: number;    // LFO rate in Hz (0.05–5)
  delayTime: number;    // base delay in ms (0.5–10)
  depth: number;        // modulation depth (0–1)
  feedback: number;     // feedback amount (-0.95 to 0.95)
  wet: number;          // dry/wet mix (0–1)
}

export interface PhaserParams {
  frequency: number;    // LFO rate in Hz (0.1–8)
  octaves: number;      // sweep range in octaves (1–6)
  stages: number;       // number of allpass stages (2–12, even only)
  Q: number;            // filter Q factor (0.1–20)
  baseFrequency: number; // base filter frequency (100–4000 Hz)
  wet: number;          // dry/wet mix (0–1)
}

export type FactoryIRType = 'smallRoom' | 'largeHall' | 'plate' | 'spring';

export interface ConvolverParams {
  irType: FactoryIRType | 'custom';  // factory preset or custom URL
  irUrl?: string;                     // URL for custom impulse response
  wet: number;                        // dry/wet mix (0–1)
  preDelay: number;                   // pre-delay in ms (0–100)
}

// ─── Spectral Processing Types ─────────────────────────────────────────────

export interface SpectralFreezeParams {
  frozen: boolean;             // true = freeze active
  mix: number;                 // dry/wet (0–1)
  decay: number;               // spectral decay/sustain (0–1, 1 = infinite hold)
  brightness: number;          // high-frequency emphasis (-1 to 1)
  fftSize: 2048 | 4096;       // FFT window size
}

export interface SpectralBlurParams {
  blurAmount: number;          // temporal smoothing in frames (0–1 mapped to 1–64 frames)
  frequencySpread: number;     // cross-bin smearing (0–1)
  mix: number;                 // dry/wet (0–1)
  brightness: number;          // tilt EQ on blurred signal (-1 to 1)
  fftSize: 2048 | 4096;       // FFT window size
}

export interface SpectralFilterPoint {
  frequency: number;           // Hz (20–20000)
  gain: number;                // dB (-48 to +12)
}

export interface SpectralFilterParams {
  points: SpectralFilterPoint[]; // user-drawn filter curve control points
  resolution: number;            // interpolation smoothness (0–1)
  mix: number;                   // dry/wet (0–1)
  fftSize: 2048 | 4096;         // FFT window size
}

export interface SpectralMorphParams {
  morphAmount: number;         // crossfade position (0 = source A, 1 = source B)
  sourceTrackId?: string;      // track B for morphing (undefined = self-morph with frozen snapshot)
  frozen: boolean;             // freeze source B snapshot
  mix: number;                 // dry/wet (0–1)
  fftSize: 2048 | 4096;       // FFT window size
}

export type TrackEffect =
  | EffectBase<'eq3', EQ3Params>
  | EffectBase<'parametricEq', ParametricEQParams>
  | EffectBase<'compressor', CompressorParams>
  | EffectBase<'reverb', ReverbParams>
  | EffectBase<'delay', DelayParams>
  | EffectBase<'distortion', DistortionParams>
  | EffectBase<'filter', FilterParams>
  | EffectBase<'chorus', ChorusParams>
  | EffectBase<'flanger', FlangerParams>
  | EffectBase<'phaser', PhaserParams>
  | EffectBase<'convolver', ConvolverParams>
  | EffectBase<'gate', GateParams>
  | EffectBase<'deesser', DeEsserParams>
  | EffectBase<'transientShaper', TransientShaperParams>
  | EffectBase<'limiter', LimiterParams>
  | EffectBase<'saturation', SaturationParams>
  | EffectBase<'stereoImager', StereoImagerParams>
  | EffectBase<'algorithmicReverb', AlgorithmicReverbParams>
  | EffectBase<'noiseReduction', NoiseGateReductionParams>
  | EffectBase<'spectralFreeze', SpectralFreezeParams>
  | EffectBase<'spectralBlur', SpectralBlurParams>
  | EffectBase<'spectralFilter', SpectralFilterParams>
  | EffectBase<'spectralMorph', SpectralMorphParams>;

export type TrackEffectType = TrackEffect['type'];

// ─── MIDI Effect Types ──────────────────────────────────────────────────────

export type MidiEffectType = 'arpeggiator' | 'chord-gen' | 'scale-lock';

export interface ArpeggiatorParams {
  rate: '1/4' | '1/8' | '1/16' | '1/32';
  pattern: 'up' | 'down' | 'up-down' | 'random';
  octaves: number;
}

export interface ChordGenParams {
  chordType: 'major' | 'minor' | 'diminished' | 'augmented' | 'sus2' | 'sus4';
  inversion: number;
}

export interface ScaleLockParams {
  root: number;
  scale: 'major' | 'minor' | 'pentatonic' | 'blues' | 'chromatic';
}

export type MidiEffect =
  | EffectBase<'arpeggiator', ArpeggiatorParams>
  | EffectBase<'chord-gen', ChordGenParams>
  | EffectBase<'scale-lock', ScaleLockParams>;

export interface InferredMetas {
  bpm?: number;
  keyScale?: string;
  timeSignature?: string;
  genres?: string;
  seed?: string;
  ditModel?: string;
  /** Detected beat positions (local analysis). */
  beats?: import('./analysis').BeatEvent[];
  /** Detected chord regions (local analysis). */
  chords?: import('./analysis').ChordEvent[];
  /** Whether metas came from server or local ONNX analysis. */
  analysisSource?: 'server' | 'local';
}

/** A snapshot of a clip's audio state, stored as part of version history. */
export interface ClipVersion {
  id: string;
  cumulativeMixKey: string | null;
  isolatedAudioKey: string | null;
  waveformPeaks: number[] | null;
  inferredMetas?: InferredMetas;
  generatedFromContext?: boolean;
  serverCumulativePath?: string;
  generatedAt: number;
}

export interface Take {
  id: string;
  audioKey: string;
  selected: boolean;
  /** Waveform peaks for visual display in take lanes. */
  waveformPeaks: number[] | null;
}

/** A point in a clip-level gain envelope (non-destructive volume automation). */
export interface GainEnvelopePoint {
  time: number;   // seconds relative to clip start
  gain: number;   // 0–2 (1 = unity, >1 = boost)
}

export type ClipGenerationType = 'text2music' | 'lego';

/** Persisted generation form values for re-editing and re-generating a clip. */
export interface ClipGenerationParams {
  type: ClipGenerationType;
  prompt: string;
  lyrics: string;
  // text2music params
  durationSeconds?: number;
  thinking?: boolean;
  seed?: number;
  useRandomSeed?: boolean;
  vocalLanguage?: string;
  instrumental?: boolean;
  splitToStems?: boolean;
  stemCount?: 2 | 4 | 6;
  useProjectMeta?: boolean;
  inferenceSteps?: number;
  guidanceScale?: number;
  temperature?: number;
  shift?: number;
  negativePrompt?: string;
  /** Style tags persisted for edit/regenerate — prepended to prompt at generation time */
  styleTags?: string[];
  // lego params
  globalCaption?: string;
  sampleMode?: boolean;
  autoExpandPrompt?: boolean;
  /** Context window used for lego generation — persisted for edit/regenerate.
   *  New format stores relative offsets + trackIds; legacy format has absolute startTime/endTime. */
  contextWindow?: {
    offsetStart: number;   // ctxStart - clip.startTime (typically negative)
    offsetEnd: number;     // ctxEnd - clip.startTime
    trackIds: string[];    // tracks that were in the context (for timeline visualization)
  } | {
    startTime: number;     // legacy absolute format
    endTime: number;
  } | null;
  /** Chunk mask mode persisted for regeneration. */
  chunkMaskMode?: 'explicit' | 'auto';
  /** Voice profile ID used for voice-conditioned generation. */
  voiceProfileId?: string;
  /** Audio Influence (0–100) — how much reference voice is preserved. */
  audioInfluence?: number;
  /** Style Influence (0–100) — how much AI's trained style is applied. */
  styleInfluence?: number;
}

export interface Clip {
  id: string;
  trackId: string;
  color?: string;
  startTime: number;
  duration: number;
  prompt: string;
  globalCaption?: string;  // Global/full-song description for SFT-stems lego tasks
  lyrics: string;
  generationStatus: ClipGenerationStatus;
  generationJobId: string | null;
  cumulativeMixKey: string | null;
  isolatedAudioKey: string | null;
  waveformPeaks: number[] | null;
  errorMessage?: string;
  // Per-clip overrides: 'auto' = ACE-Step infers, undefined/null = project defaults, value = manual
  bpm?: number | 'auto' | null;
  keyScale?: string | 'auto' | null;
  timeSignature?: number | 'auto' | null;
  inferredMetas?: InferredMetas;
  sampleMode?: boolean;
  autoExpandPrompt?: boolean;
  // Crop support: original audio duration and offset into it
  audioDuration?: number;  // Full audio buffer duration (set at gen/import)
  audioOffset?: number;    // Offset into audio buffer (seconds), default 0
  contentOffset?: number;  // Silent padding before audible content inside the clip container
  /** True when this clip was generated with a previous cumulative as context (not from silence). */
  generatedFromContext?: boolean;
  /** Server-side file path of the cumulative audio, used to skip re-upload on next context generation. */
  serverCumulativePath?: string;
  /** Previous generation snapshots for version navigation. */
  versions?: ClipVersion[];
  /** Currently displayed version index (0 = oldest). When undefined, live fields are used. */
  activeVersionIdx?: number;
  /** Origin of this clip: AI-generated or user-uploaded audio. */
  source?: 'generated' | 'uploaded';
  /** User bookmark flag for quick access in the Assets panel. */
  starred?: boolean;
  /** Fade in duration in seconds. */
  fadeInDuration?: number;
  /** Fade out duration in seconds. */
  fadeOutDuration?: number;
  /** Fade in curve shape. */
  fadeInCurve?: 'linear' | 'exponential' | 'equal-power';
  /** Fade out curve shape. */
  fadeOutCurve?: 'linear' | 'exponential' | 'equal-power';
  /**
   * Optional bezier control point for the fade-in curve, in normalized
   * coordinates. The bezier passes through (0, 0) silence at fade start
   * and (1, 1) unity at fade end; the curve's geometric midpoint is dragged
   * to {x, y} (so x runs along the fade duration, y is gain at that point).
   * When set, this overrides `fadeInCurve` for both audio playback and the
   * waveform amplitude rendering. Old projects without this field continue
   * to use the preset.
   */
  fadeInCurvePoint?: { x: number; y: number };
  /** Same as fadeInCurvePoint, for the fade-out region. */
  fadeOutCurvePoint?: { x: number; y: number };
  /** Time-stretch playback rate (1 = original speed, 0.5 = half, 2 = double). */
  timeStretchRate?: number;
  /** Pitch shift in semitones (0 = original pitch). */
  pitchShift?: number;
  /** Time-stretch algorithm: 'repitch' (playbackRate) or 'slice' (warp markers). */
  stretchMode?: StretchMode;
  /** Optional MIDI region data for piano roll tracks. */
  midiData?: MidiClipData;
  /** Comping takes for this clip. */
  takes?: Take[];
  /** Warp markers for audio quantize (transient-to-grid alignment). */
  warpMarkers?: AudioWarpMarker[];
  /** Per-clip gain envelope for non-destructive volume automation. */
  gainEnvelope?: GainEnvelopePoint[];
  /** Per-clip mute for A/B variation comparison. */
  muted?: boolean;
  /** Generation parameters used to create this clip, for edit/regenerate. */
  generationParams?: ClipGenerationParams;
  /** Video-specific metadata (only for clips on video tracks). */
  videoMeta?: VideoClipData;
  /** User-assigned tags for clip organization (e.g. "verse", "favorite"). */
  tags?: string[];
}

// ─── Video Track Types ────────────────────────────────────────────────────────

/** Video-specific clip metadata for clips on video tracks. */
export interface VideoClipData {
  /** Video codec identifier (e.g. 'h264', 'vp9', 'prores'). */
  codec: string;
  /** Video width in pixels. */
  width: number;
  /** Video height in pixels. */
  height: number;
  /** Frame rate (fps). */
  frameRate: number;
  /** Full duration of the source video file in seconds. */
  fileDuration: number;
  /** Offset into the source video in seconds (for non-destructive trimming). */
  sourceOffset: number;
  /** IndexedDB key where the video file blob is stored. */
  indexedDbKey: string;
  /** Whether the source video contains an audio stream (stripped on import). */
  hasAudioStream: boolean;
  /** Group of Pictures size — distance between keyframes. */
  gopSize: number;
  /** True if codec is intra-frame only (e.g. ProRes, MJPEG). */
  isIntraOnly: boolean;
  /** IndexedDB key for cached filmstrip thumbnail data. */
  filmstripCacheKey?: string;
}

export type VideoPreviewSize = 'small' | 'medium' | 'large';
export type VideoPreviewDock = 'top' | 'float';

/** Per-track settings for video preview and display. */
export interface VideoTrackSettings {
  /** Preview panel size. */
  previewSize: VideoPreviewSize;
  /** Preview panel docking mode. */
  previewDock: VideoPreviewDock;
  /** Show filmstrip thumbnails in the timeline lane. */
  showFilmstrip: boolean;
  /** Filmstrip thumbnail opacity (0–1). */
  filmstripOpacity: number;
  /** Show timecode overlay on the preview panel. */
  showTimecodeOverlay: boolean;
  /** Update preview panel in real-time during timeline editing. */
  videoFollowsEdit: boolean;
}

export const DEFAULT_VIDEO_TRACK_SETTINGS: VideoTrackSettings = {
  previewSize: 'medium',
  previewDock: 'top',
  showFilmstrip: true,
  filmstripOpacity: 0.8,
  showTimecodeOverlay: false,
  videoFollowsEdit: true,
};

export interface BounceInPlaceOptions {
  includeEffects: boolean;
  includeAutomation: boolean;
  normalize: boolean;
  replaceOriginal: boolean;
  startTime?: number;
  duration?: number;
}

/** A warp marker on a clip mapping an original transient time to a grid-snapped position. */
export interface AudioWarpMarker {
  /** Original transient position in seconds (relative to clip audio start). */
  originalTime: number;
  /** Quantized position snapped to the beat grid in seconds. */
  quantizedTime: number;
}

export interface SequencerStep {
  active: boolean;
  velocity: number;      // 0–1, default 0.8
  probability: number;   // 0–1, default 1 (100%). Probability the step triggers during playback.
  stepParams: Record<string, number>;  // Per-step parameter locks (e.g. { pitch: 0.7, decay: 0.3 })
}

export interface SequencerRow {
  id: string;
  name: string;           // e.g. "Kick", "Snare", "Hi-Hat"
  sampleKey: string;      // built-in sample id or IndexedDB key for user sample
  sampleName?: string;    // display name for user-loaded samples (undefined for built-in)
  steps: SequencerStep[];
  volume: number;         // 0–1
  pan: number;            // -1 (full left) to +1 (full right), default 0
  muted: boolean;
  color: string;
}

export interface SequencerPattern {
  id: string;
  name: string;
  rows: SequencerRow[];
  stepsPerBar: number;    // default 16 (16th notes)
  bars: number;           // default 1
  swing: number;          // 0–1, 0 = straight, 0.67 = heavy swing
}

export interface Send {
  returnTrackId: string;
  amount: number;  // 0–1
  /** Pre-fader sends tap before the channel fader; post-fader sends tap after. Default: 'post'. */
  prePost: 'pre' | 'post';
}

export interface ReturnTrack {
  id: string;
  name: string;
  effects: TrackEffect[];
  volume: number;  // 0–1
  pan: number;     // -1 (full left) to +1 (full right)
}

export interface TrackPresetSettings {
  color: string;
  volume: number;
  laneHeight?: number;
  instrument?: TrackInstrument;
  synthPreset?: SynthPreset;
  sampler?: SamplerSettings;
  samplerConfig?: SamplerConfig;
  drumKit?: DrumKitName;
  pan?: number;
  panMode?: 'stereo' | 'dual-mono';
  panLeft?: number;
  panRight?: number;
  eqLowGain?: number;
  eqMidGain?: number;
  eqHighGain?: number;
  compressorEnabled?: boolean;
  compressorThreshold?: number;
  compressorRatio?: number;
  effectsBypassed?: boolean;
  reverbMix?: number;
  reverbRoomSize?: number;
  localCaption?: string;
}

export interface TrackPreset {
  id: string;
  name: string;
  trackName: TrackName;
  trackType: TrackType;
  settings: TrackPresetSettings;
  effects: TrackEffect[];
  midiEffects: MidiEffect[];
  createdAt: number;
}

export interface AssetTrackSnapshot {
  trackName: TrackName;
  trackType: TrackType;
  displayName: string;
  muted: boolean;
  soloed: boolean;
  armed?: boolean;
  inputMonitoring?: InputMonitoringMode;
  settings: TrackPresetSettings;
  effects: TrackEffect[];
  midiEffects: MidiEffect[];
}

export interface AssetClipSnapshot extends Omit<
  Clip,
  | 'id'
  | 'trackId'
  | 'startTime'
  | 'generationJobId'
  | 'versions'
  | 'activeVersionIdx'
  | 'midiData'
  | 'takes'
  | 'warpMarkers'
  | 'gainEnvelope'
> {}

export interface Track {
  id: string;
  trackType?: TrackType;
  trackName: TrackName;
  displayName: string;
  color: string;
  order: number;
  volume: number;
  muted: boolean;
  soloed: boolean;
  armed?: boolean;
  inputMonitoring?: InputMonitoringMode;
  clips: Clip[];
  // Track grouping / folder tracks
  parentTrackId?: string;
  isGroup?: boolean;
  collapsed?: boolean;
  sequencerPattern?: SequencerPattern;
  /** Canonical instrument model used by synth/sampler editors and agent automation. */
  instrument?: TrackInstrument;
  /** Legacy mirror of the instrument kind for existing engine/UI paths. */
  synthPreset?: SynthPreset;
  /** ID of the active synth preset definition (factory or user). */
  synthPresetDefinitionId?: string;
  /** Oscillator waveform type (overrides preset default when set). */
  synthOscillatorType?: 'sine' | 'triangle' | 'sawtooth' | 'square';
  /** Custom ADSR envelope overriding the preset defaults. */
  synthEnvelope?: SynthEnvelope;
  /** Synth filter settings (lowpass/highpass/bandpass). */
  synthFilter?: SynthFilter;
  /** Filter envelope (ADSR modulating filter cutoff). */
  filterEnvelope?: FilterEnvelope;
  /** LFO modulation settings. */
  synthLfo?: SynthLfo;
  /** Unison / detune voice-stacking settings. */
  unisonSettings?: UnisonSettings;
  /** Wavetable synthesis settings (only for wavetable instruments). */
  wavetableSettings?: WavetableSettings;
  /** Legacy sampler metadata mirrored from `instrument.kind === 'sampler'`. */
  sampler?: SamplerSettings;
  effects?: TrackEffect[];
  effectsBypassed?: boolean;
  midiEffects?: MidiEffect[];
  drumKit?: DrumKitName;
  drumMachine?: DrumMachineConfig;
  /** Sampler instrument config — when set on a pianoRoll track, uses loaded audio sample instead of synth preset. */
  samplerConfig?: SamplerConfig;
  /** Granular synthesis config — when set on a pianoRoll track, uses granular engine. */
  granularConfig?: GranularSettings;
  // Mixer / channel-strip settings
  pan?: number;               // -1 (full left) to +1 (full right), default 0
  panMode?: 'stereo' | 'dual-mono';  // default 'stereo'
  panLeft?: number;            // dual-mono left channel pan, -1 to +1, default -1
  panRight?: number;           // dual-mono right channel pan, -1 to +1, default 1
  eqLowGain?: number;         // dB ±15, low shelf at 250 Hz, default 0
  eqMidGain?: number;         // dB ±15, peak at 1 kHz, default 0
  eqHighGain?: number;        // dB ±15, high shelf at 8 kHz, default 0
  compressorEnabled?: boolean; // default false
  compressorThreshold?: number; // dB, default -24
  compressorRatio?: number;    // 1–20, default 4
  // Reverb
  reverbMix?: number;          // 0–1 wet/dry, default 0
  reverbRoomSize?: number;     // 0–1, controls IR length, default 0.5
  // Track Inspector
  /** Default prompt for clips on this track; falls back to track display name if empty. */
  localCaption?: string;
  /** Per-track lane height in pixels (default 80, min 40, max 200). */
  laneHeight?: number;
  /** Sends to return tracks (mixer bus routing). */
  sends?: Send[];
  /** Whether the track is frozen (bounced to audio for CPU savings). */
  frozen?: boolean;
  /** IndexedDB key of the frozen audio bounce. */
  frozenAudioKey?: string;
  /** Whether take lanes are visible for comping on this track. */
  showTakeLanes?: boolean;
  /** Strudel pattern code (only for strudel tracks). */
  strudelCode?: string;
  /** Strudel cycle length in bars (default 1 = 1 bar = 1 cycle). */
  strudelCycleLength?: number;
  /** Captured Strudel snapshots for quick rollback. */
  strudelVersions?: StrudelCodeVersion[];
  /** WAP plugin instances on this track (effect & instrument plugins). */
  plugins?: import('./plugin').PluginInstance[];
  /** ID of the voice profile assigned to this track for voice cloning. */
  voiceProfileId?: string;
  /** Video track display/preview settings (only for video tracks). */
  videoSettings?: VideoTrackSettings;
}

/** Persistent asset entry — survives clip/track removal. Only deleted explicitly from the Assets panel. */
export interface AssetClip {
  id: string;
  clipId: string;
  trackDisplayName: string;
  prompt: string;
  source: 'generated' | 'uploaded';
  isolatedAudioKey: string | null;
  cumulativeMixKey: string | null;
  waveformPeaks: number[] | null;
  starred: boolean;
  createdAt: number;
  duration: number;
  originTrackSnapshot?: AssetTrackSnapshot;
  originClipSnapshot?: AssetClipSnapshot;
}

export interface GenerationDefaults {
  inferenceSteps: number;
  guidanceScale: number;
  shift: number;
  thinking: boolean;
  model: string;
}

export type PlaybackLatencySource = 'auto' | 'manual' | 'fallback';
export type PlaybackLatencyBrowserSupport = 'available' | 'missing';

export interface PlaybackLatencySettings {
  detectedBaseLatencyMs: number | null;
  detectedOutputLatencyMs: number | null;
  detectedLatencyMs: number | null;
  manualOverrideMs: number | null;
  compensationMs: number;
  source: PlaybackLatencySource;
  browserSupport: PlaybackLatencyBrowserSupport;
  updatedAt: number | null;
}

export type MarkerType = 'generic' | 'scene' | 'cue' | 'hit';

export interface Marker {
  id: string;
  time: number;
  name: string;
  color: string;
  /** Marker type for categorization and filtering. */
  type?: MarkerType;
  /** Optional end time for range markers (undefined = point marker). */
  endTime?: number;
}

export type SessionLaunchQuantization = 'none' | '1/32' | '1/16' | '1/8' | '1/4' | '1/2' | '1 bar' | '2 bars' | '4 bars' | '8 bars';

/** Clip launch behavior mode for session view slots. */
export type SessionLaunchMode = 'trigger' | 'gate' | 'toggle' | 'repeat';

/** Action to perform automatically when a scene finishes playing. */
export type SceneFollowActionType = 'none' | 'next' | 'previous' | 'first' | 'last' | 'random' | 'again' | 'any' | 'stop';

/** Dual follow action for scenes with probability weighting (Ableton-style A/B split). */
export interface SceneFollowActionConfig {
  actionA: SceneFollowActionType;
  actionB: SceneFollowActionType;
  /** Probability of action A (0–1). Action B gets 1 − chanceA. */
  chanceA: number;
}

// ─── Follow Action Types ─────────────────────────────────────────────────────

/** The type of follow action to perform when a clip finishes playing. */
export type FollowActionType = 'stop' | 'again' | 'previous' | 'next' | 'first' | 'last' | 'any' | 'other';

/** Configuration for a follow action on a session clip slot. */
export interface FollowActionConfig {
  /** Primary follow action. */
  actionA: FollowActionType;
  /** Secondary follow action. */
  actionB: FollowActionType;
  /** Probability of action A (0-1). Action B probability = 1 - chanceA. */
  chanceA: number;
  /** Follow action trigger time in beats (e.g., 4 = 1 bar in 4/4). */
  time: number;
  /** Whether this follow action is enabled. */
  enabled: boolean;
}

export interface SessionScene {
  id: string;
  name: string;
  index: number;
  /** Optional color for this scene header. */
  color?: string;
  /** Optional tempo override (BPM) applied when this scene launches. */
  tempo?: number;
  /** Optional time signature override [numerator, denominator] applied when this scene launches. */
  timeSignature?: [number, number];
  /** Action to trigger after the scene finishes playing. Defaults to 'none'. */
  followAction?: SceneFollowActionType;
  /** Duration in bars after which the follow action triggers. */
  followActionTime?: number;
  /** Dual follow action config with probability weighting. Takes precedence over followAction. */
  followActionConfig?: SceneFollowActionConfig;
}

export interface SessionClipSlot {
  id: string;
  trackId: string;
  sceneId: string;
  clipId: string | null;
  /** Per-slot quantization override. 'global' (or undefined) defers to session quantization. */
  quantization?: 'global' | SessionLaunchQuantization;
  /** Color override for this slot (inherits track color when null). */
  color?: string | null;
  /** When true (default), an empty slot acts as a stop button for the track. */
  hasStopButton?: boolean;
  /** When true, the incoming clip starts at the outgoing clip's current position. */
  legato?: boolean;
  /** Clip launch behavior: trigger (default), gate, toggle, or repeat. */
  launchMode?: SessionLaunchMode;
  /** Optional tempo override (BPM) applied when this clip launches. */
  tempo?: number;
  /** Optional time signature override [numerator, denominator] applied when this clip launches. */
  timeSignature?: [number, number];
  /** Follow action configuration for this clip slot. */
  followAction?: FollowActionConfig;
}

export interface SessionPendingLaunch {
  id: string;
  type: 'clip' | 'scene' | 'stop-track' | 'stop-all' | 'follow-action' | 'scene-follow-action';
  executeAt: number;
  requestedAt: number;
  trackId?: string;
  sceneId?: string;
  clipId?: string | null;
}

export interface SessionLaunchEvent {
  id: string;
  trackId: string;
  clipId: string | null;
  startedAt: number;
  endedAt: number | null;
  sceneId: string | null;
  source: 'clip' | 'scene' | 'stop';
}

export interface SessionState {
  quantization: SessionLaunchQuantization;
  scenes: SessionScene[];
  slots: SessionClipSlot[];
  activeClipIdsByTrackId: Record<string, string | null>;
  pendingLaunches: SessionPendingLaunch[];
  isRecordingToArrangement: boolean;
  arrangementRecordStartTime: number | null;
  arrangementRecordEndTime: number | null;
  recordedLaunches: SessionLaunchEvent[];
  lastLaunchedSceneId: string | null;
  lastLaunchAt: number | null;
  /** Global toggle for follow actions. When false, no follow actions fire. Default true. */
  followActionsEnabled?: boolean;
  /** Slot IDs currently recording (empty when no recording is active). */
  recordingSlotIds?: string[];
  /** Fixed-length recording setting in bars (null = manual stop). */
  fixedLengthBars?: number | null;
}

/** A saved project template — a snapshot of project settings and track layout (without audio). */
export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  /** Musical settings */
  bpm: number;
  keyScale: string;
  timeSignature: number;
  timeSignatureDenominator?: number;
  measures: number;
  /** Track layout snapshot (clips stripped, only structure preserved). */
  tracks: ProjectTemplateTrack[];
  /** Generation defaults captured from the source project. */
  generationDefaults: GenerationDefaults;
}

/** Lightweight track snapshot stored inside a project template (no clips or audio references). */
export interface ProjectTemplateTrack {
  trackName: TrackName;
  trackType: TrackType;
  displayName: string;
  color: string;
  volume: number;
  pan?: number;
  effects?: TrackEffect[];
  midiEffects?: MidiEffect[];
  instrument?: TrackInstrument;
  synthPreset?: SynthPreset;
  drumKit?: DrumKitName;
  localCaption?: string;
  sequencerPattern?: SequencerPattern;
}

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  bpm: number;
  keyScale: string;
  timeSignature: number;
  /** Time signature denominator (bottom number), default 4. */
  timeSignatureDenominator?: number;
  totalDuration: number;
  /** User-configured bar/measure count; timeline is at least this many bars long. */
  measures?: number;
  /** Normalized playback latency compensation used by audio + visuals. */
  playbackLatency?: PlaybackLatencySettings;
  tracks: Track[];
  generationDefaults: GenerationDefaults;
  /** Project-level global song description used as fallback when a clip's globalCaption is empty. */
  globalCaption?: string;
  /** Master output fader level (0–1), default 1.0 */
  masterVolume?: number;
  /** AI mastering state for the master bus. */
  mastering?: MasteringState;
  /** Persistent asset clips — survives clip/track removal. */
  assets?: AssetClip[];
  /** Per-track automation lanes. */
  automationLanes?: AutomationLane[];
  /** Shared effect return tracks (mixer buses). */
  returnTracks?: ReturnTrack[];
  /** Reusable track templates saved from existing tracks. */
  trackPresets?: TrackPreset[];
  /** Timeline markers (sorted by time). */
  markers?: Marker[];
  /** Reusable groove templates (extracted timing/velocity patterns). */
  groovePool?: GrooveTemplate[];
  /** Session View clip launcher state and arrangement print history. */
  session?: SessionState;
  /** Tempo map: discrete tempo changes sorted by beat. Empty = use project.bpm everywhere. */
  tempoMap?: TempoEvent[];
  /** Time signature map: changes sorted by bar. Empty = use project.timeSignature everywhere. */
  timeSignatureMap?: TimeSignatureEvent[];
}

// ─── Tempo & Time Signature Map Types ────────────────────────────────────────

/** A discrete tempo change at a specific beat position. */
export interface TempoEvent {
  /** Beat position (0-indexed) where the tempo change occurs. */
  beat: number;
  /** BPM value at this point. */
  bpm: number;
  /** Optional: if set, linearly ramp from previous BPM to this BPM over the beat range. */
  ramp?: boolean;
}

/** A time signature change at a specific bar position. */
export interface TimeSignatureEvent {
  /** Bar number (1-indexed) where the time signature change occurs. */
  bar: number;
  /** Numerator (beats per bar). */
  numerator: number;
  /** Denominator (beat unit, e.g. 4 = quarter note). */
  denominator: number;
}

// ─── Automation Types ────────────────────────────────────────────────────────

/** Curve interpolation mode between automation points */
export type AutomationCurveType = 'linear' | 'exponential' | 's-curve' | 'step';

/** Recording mode for automation lanes */
export type AutomationRecordingMode = 'touch' | 'latch' | 'write';

/** LFO waveform shape for automation generation */
export type LFOShape = 'sine' | 'triangle' | 'saw' | 'square';

/** Parameters for LFO automation generation */
export interface LFOAutomationParams {
  shape: LFOShape;
  /** Cycles per beat-range (e.g. 1 = one full cycle over the range) */
  rate: number;
  /** Amplitude 0–1 (1 = full range) */
  depth: number;
  /** Phase offset in degrees (0–360) */
  phase: number;
  /** Start beat (inclusive) */
  startBeat: number;
  /** End beat (exclusive) */
  endBeat: number;
}

export interface AutomationPoint {
  time: number;   // seconds
  value: number;  // normalized 0–1
  curve?: number; // -1 (ease-in) to +1 (ease-out), 0 = linear
  curveType?: AutomationCurveType; // interpolation mode to next point
}

export type AutomatableEffectTarget =
  | { effectType: 'eq3'; param: keyof EQ3Params }
  | { effectType: 'compressor'; param: Exclude<keyof CompressorParams, 'sidechainSourceTrackId' | 'detectionMode' | 'autoMakeupGain'> }
  | { effectType: 'reverb'; param: keyof ReverbParams }
  | { effectType: 'delay'; param: keyof DelayParams }
  | { effectType: 'distortion'; param: Exclude<keyof DistortionParams, 'distortionType'> }
  | { effectType: 'filter'; param: Exclude<keyof FilterParams, 'filterType' | 'lfoEnabled'> }
  | { effectType: 'chorus'; param: keyof ChorusParams }
  | { effectType: 'flanger'; param: keyof FlangerParams }
  | { effectType: 'phaser'; param: Exclude<keyof PhaserParams, 'stages'> }
  | { effectType: 'convolver'; param: Exclude<keyof ConvolverParams, 'irType' | 'irUrl'> }
  | { effectType: 'gate'; param: Exclude<keyof GateParams, 'mode'> }
  | { effectType: 'deesser'; param: Exclude<keyof DeEsserParams, 'mode' | 'listen'> }
  | { effectType: 'transientShaper'; param: keyof TransientShaperParams }
  | { effectType: 'limiter'; param: Exclude<keyof LimiterParams, 'style'> }
  | { effectType: 'saturation'; param: Exclude<keyof SaturationParams, 'saturationType'> }
  | { effectType: 'stereoImager'; param: keyof StereoImagerParams }
  | { effectType: 'algorithmicReverb'; param: Exclude<keyof AlgorithmicReverbParams, 'reverbType'> }
  | { effectType: 'noiseReduction'; param: Exclude<keyof NoiseGateReductionParams, 'mode'> }
  | { effectType: 'spectralFreeze'; param: Exclude<keyof SpectralFreezeParams, 'frozen' | 'fftSize'> }
  | { effectType: 'spectralBlur'; param: Exclude<keyof SpectralBlurParams, 'fftSize'> }
  | { effectType: 'spectralFilter'; param: Exclude<keyof SpectralFilterParams, 'points' | 'fftSize'> }
  | { effectType: 'spectralMorph'; param: Exclude<keyof SpectralMorphParams, 'sourceTrackId' | 'frozen' | 'fftSize'> };

export type AutomationParameter =
  | { type: 'mixer'; param: 'volume' | 'pan' }
  | ({ type: 'effect'; effectId: string } & AutomatableEffectTarget)
  | { type: 'send'; sendIndex: number; param: 'amount' };

export interface AutomationLane {
  id: string;
  trackId: string;
  parameter: AutomationParameter;
  points: AutomationPoint[];
  recordingMode?: AutomationRecordingMode;
}

/** Compare two AutomationParameter values for equality */
export function automationParamEquals(a: AutomationParameter, b: AutomationParameter): boolean {
  if (a.type !== b.type) return false;
  if (a.type === 'mixer' && b.type === 'mixer') {
    return a.param === b.param;
  }
  if (a.type === 'effect' && b.type === 'effect') {
    return a.effectId === b.effectId && a.effectType === b.effectType && a.param === b.param;
  }
  if (a.type === 'send' && b.type === 'send') {
    return a.sendIndex === b.sendIndex && a.param === b.param;
  }
  return false;
}

/** Map normalized 0–1 value to mixer parameter range */
export function normalizedToMixerValue(param: 'volume' | 'pan', normalized: number): number {
  if (param === 'volume') return normalized; // 0–1
  return normalized * 2 - 1;                // -1..+1
}
