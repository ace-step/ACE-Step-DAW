export type TrackName =
  | 'woodwinds' | 'brass' | 'fx' | 'synth' | 'strings'
  | 'percussion' | 'keyboard' | 'guitar' | 'bass' | 'drums'
  | 'backing_vocals' | 'vocals'
  | 'custom';

export type TrackType = 'stems' | 'sample' | 'sequencer' | 'pianoRoll';
export type InputMonitoringMode = 'off' | 'auto' | 'on';
export type SynthPreset = 'piano' | 'strings' | 'pad' | 'lead' | 'bass' | 'organ';
export type DrumKitName = '808' | 'acoustic' | 'electronic' | 'lofi';
export type PianoRollGrid = '1/4' | '1/8' | '1/16' | '1/32';

export type ClipGenerationStatus =
  | 'empty' | 'queued' | 'generating' | 'processing' | 'ready' | 'error' | 'stale';

export interface MidiNote {
  id: string;
  pitch: number;
  startBeat: number;
  durationBeats: number;
  velocity: number;
}

export interface MidiClipData {
  notes: MidiNote[];
  grid: PianoRollGrid;
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

export type TrackEffect =
  | EffectBase<'eq3', EQ3Params>
  | EffectBase<'compressor', CompressorParams>
  | EffectBase<'reverb', ReverbParams>
  | EffectBase<'delay', DelayParams>
  | EffectBase<'distortion', DistortionParams>
  | EffectBase<'filter', FilterParams>;

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
  /** Optional MIDI region data for piano roll tracks. */
  midiData?: MidiClipData;
  /** Comping takes for this clip. */
  takes?: Take[];
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
  effects?: TrackEffect[];
  midiEffects?: MidiEffect[];
  drumKit?: DrumKitName;
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
  /** Persistent asset clips — survives clip/track removal. */
  assets?: AssetClip[];
  /** Per-track automation lanes. */
  automationLanes?: AutomationLane[];
  /** Shared effect return tracks (mixer buses). */
  returnTracks?: ReturnTrack[];
  /** Timeline markers (sorted by time). */
  markers?: Marker[];
}

// ─── Automation Types ────────────────────────────────────────────────────────

export interface AutomationPoint {
  time: number;   // seconds
  value: number;  // normalized 0–1
  curve?: number; // -1 (ease-in) to +1 (ease-out), 0 = linear
}

export type AutomationParameter =
  | { type: 'mixer'; param: 'volume' | 'pan' };

export interface AutomationLane {
  id: string;
  trackId: string;
  parameter: AutomationParameter;
  points: AutomationPoint[];
}

/** Compare two AutomationParameter values for equality */
export function automationParamEquals(a: AutomationParameter, b: AutomationParameter): boolean {
  return a.type === b.type && a.param === b.param;
}

/** Map normalized 0–1 value to mixer parameter range */
export function normalizedToMixerValue(param: 'volume' | 'pan', normalized: number): number {
  if (param === 'volume') return normalized; // 0–1
  return normalized * 2 - 1;                // -1..+1
}
