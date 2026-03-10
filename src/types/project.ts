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
  tracks: Track[];
  generationDefaults: GenerationDefaults;
}
