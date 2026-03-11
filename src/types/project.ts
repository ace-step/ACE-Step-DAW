export type TrackName =
  | 'woodwinds' | 'brass' | 'fx' | 'synth' | 'strings'
  | 'percussion' | 'keyboard' | 'guitar' | 'bass' | 'drums'
  | 'backing_vocals' | 'vocals'
  | 'custom';

export type ClipGenerationStatus =
  | 'empty' | 'queued' | 'generating' | 'processing' | 'ready' | 'error' | 'stale';

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
}

export interface Track {
  id: string;
  trackName: TrackName;
  displayName: string;
  color: string;
  order: number;
  volume: number;
  muted: boolean;
  soloed: boolean;
  clips: Clip[];
  // Mixer / channel-strip settings
  pan?: number;               // -1 (full left) to +1 (full right), default 0
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
}

export interface GenerationDefaults {
  inferenceSteps: number;
  guidanceScale: number;
  shift: number;
  thinking: boolean;
  model: string;
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
}
