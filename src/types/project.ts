export type TrackName =
  | 'woodwinds' | 'brass' | 'fx' | 'synth' | 'strings'
  | 'percussion' | 'keyboard' | 'guitar' | 'bass' | 'drums'
  | 'backing_vocals' | 'vocals'
  | 'custom';

export type TrackType = 'stems' | 'sample' | 'sequencer' | 'pianoRoll' | 'drumMachine';
export type InputMonitoringMode = 'off' | 'auto' | 'on';
export type SynthPreset = 'piano' | 'strings' | 'pad' | 'lead' | 'bass' | 'organ' | 'sampler';
export type DrumKitName = '808' | 'acoustic' | 'electronic' | 'lofi';
export type SamplerPlaybackMode = 'classic' | 'oneShot' | 'loop';
export type SessionFollowAction = 'loop' | 'next' | 'stop';
/** Time-stretch algorithm mode. 'repitch' uses playbackRate (changes pitch), 'slice' uses warp markers. */
export type StretchMode = 'repitch' | 'slice';
export type PianoRollGrid = '1/4' | '1/8' | '1/16' | '1/32';

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
}

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

export interface DrumPad {
  id: string;
  name: string;
  sampleKey: string;       // built-in drum name or user sample IndexedDB key
  color: string;
  volume: number;          // 0–1
  pan: number;             // -1 to +1
}

export interface DrumMachineConfig {
  pads: DrumPad[];
  kitName: DrumKitName;
}

export type ClipGenerationStatus =
  | 'empty' | 'queued' | 'generating' | 'processing' | 'ready' | 'error' | 'stale';

export interface MidiNote {
  id: string;
  pitch: number;
  startBeat: number;
  durationBeats: number;
  velocity: number;
  isSlide?: boolean;
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
  | 'lowpass';

export interface ParametricEQBand {
  id: string;
  enabled: boolean;
  type: ParametricEQBandType;
  frequency: number;
  gain: number;
  q: number;
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
  | EffectBase<'phaser', PhaserParams>;

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
}

/** A point in a clip-level gain envelope (non-destructive volume automation). */
export interface GainEnvelopePoint {
  time: number;   // seconds relative to clip start
  gain: number;   // 0–2 (1 = unity, >1 = boost)
}

export interface Clip {
  id: string;
  trackId: string;
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
  /** Session View scene index for this clip slot. */
  sessionSceneIndex?: number;
  /** Session View follow action applied after each loop cycle. */
  sessionFollowAction?: SessionFollowAction;
}

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
}

export interface SequencerRow {
  id: string;
  name: string;           // e.g. "Kick", "Snare", "Hi-Hat"
  sampleKey: string;      // built-in sample id or IndexedDB key for user sample
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
  synthPreset?: SynthPreset;
  sampler?: SamplerSettings;
  effects?: TrackEffect[];
  midiEffects?: MidiEffect[];
  drumKit?: DrumKitName;
  drumMachine?: DrumMachineConfig;
  /** Sampler instrument config — when set on a pianoRoll track, uses loaded audio sample instead of synth preset. */
  samplerConfig?: SamplerConfig;
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
  /** Per-track lane height in pixels (default 64, min 40, max 200). */
  laneHeight?: number;
  /** Sends to return tracks (mixer bus routing). */
  sends?: Send[];
  /** Whether the track is frozen (bounced to audio for CPU savings). */
  frozen?: boolean;
  /** IndexedDB key of the frozen audio bounce. */
  frozenAudioKey?: string;
  /** Whether take lanes are visible for comping on this track. */
  showTakeLanes?: boolean;
  /** WAP plugin instances on this track (effect & instrument plugins). */
  plugins?: import('./plugin').PluginInstance[];
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
}

export interface GenerationDefaults {
  inferenceSteps: number;
  guidanceScale: number;
  shift: number;
  thinking: boolean;
  model: string;
}

export interface Marker {
  id: string;
  time: number;
  name: string;
  color: string;
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
  synthPreset?: SynthPreset;
  drumKit?: DrumKitName;
  localCaption?: string;
  sequencerPattern?: SequencerPattern;
}

export interface SessionTrackPlayback {
  clipId: string;
  sceneIndex: number;
  startedAt: number;
  lastCycleAt: number;
}

export interface SessionQueuedLaunch {
  trackId: string;
  clipId: string | null;
  sceneIndex: number | null;
  launchAt: number;
}

export interface SessionPerformanceEvent {
  trackId: string;
  clipId: string;
  sceneIndex: number;
  startTime: number;
  endTime: number | null;
}

export interface SessionSelection {
  trackId: string;
  sceneIndex: number;
}

export interface SessionState {
  sceneCount: number;
  queuedLaunches: SessionQueuedLaunch[];
  activeTrackPlaybacks: Record<string, SessionTrackPlayback | undefined>;
  selectedCell: SessionSelection | null;
  isRecordingToArrangement: boolean;
  recordStartTime: number | null;
  performanceEvents: SessionPerformanceEvent[];
}

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  bpm: number;
  keyScale: string;
  timeSignature: number;
  totalDuration: number;
  /** User-configured bar/measure count; timeline is at least this many bars long. */
  measures?: number;
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
  /** Tempo map: discrete tempo changes sorted by beat. Empty = use project.bpm everywhere. */
  tempoMap?: TempoEvent[];
  /** Time signature map: changes sorted by bar. Empty = use project.timeSignature everywhere. */
  timeSignatureMap?: TimeSignatureEvent[];
  /** Session View / clip launcher state. */
  session?: SessionState;
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

export interface AutomationPoint {
  time: number;   // seconds
  value: number;  // normalized 0–1
  curve?: number; // -1 (ease-in) to +1 (ease-out), 0 = linear
}

export type AutomatableEffectTarget =
  | { effectType: 'eq3'; param: keyof EQ3Params }
  | { effectType: 'compressor'; param: Exclude<keyof CompressorParams, 'sidechainSourceTrackId'> }
  | { effectType: 'reverb'; param: keyof ReverbParams }
  | { effectType: 'delay'; param: keyof DelayParams }
  | { effectType: 'distortion'; param: Exclude<keyof DistortionParams, 'distortionType'> }
  | { effectType: 'filter'; param: Exclude<keyof FilterParams, 'filterType' | 'lfoEnabled'> }
  | { effectType: 'chorus'; param: keyof ChorusParams }
  | { effectType: 'flanger'; param: keyof FlangerParams }
  | { effectType: 'phaser'; param: Exclude<keyof PhaserParams, 'stages'> };

export type AutomationParameter =
  | { type: 'mixer'; param: 'volume' | 'pan' }
  | ({ type: 'effect'; effectId: string } & AutomatableEffectTarget);

export interface AutomationLane {
  id: string;
  trackId: string;
  parameter: AutomationParameter;
  points: AutomationPoint[];
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
  return false;
}

/** Map normalized 0–1 value to mixer parameter range */
export function normalizedToMixerValue(param: 'volume' | 'pan', normalized: number): number {
  if (param === 'volume') return normalized; // 0–1
  return normalized * 2 - 1;                // -1..+1
}
