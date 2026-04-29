/** Parameters for cover generation — transforms source audio into a new style */
export interface CoverTaskParams {
  task_type: 'cover';
  caption: string;        // Style/genre description
  lyrics: string;
  audio_cover_strength: number; // 0.0–1.0: how much to deviate from original
  audio_duration: number;
  inference_steps: number;
  guidance_scale: number;
  shift: number;
  batch_size: number;
  audio_format: 'wav';
  thinking: boolean;
  model: string;
  seed?: number;
  use_random_seed?: boolean;
  negative_prompt?: string;  // Elements to exclude from generation
}

export type RepaintMode = 'conservative' | 'balanced' | 'aggressive';

/** Parameters for repaint — partially regenerates a section of an existing clip */
export interface RepaintTaskParams {
  task_type: 'repaint';
  prompt: string;
  global_caption: string;
  lyrics: string;
  instruction: string;
  repainting_start: number;
  repainting_end: number;
  audio_duration: number;
  inference_steps: number;
  guidance_scale: number;
  shift: number;
  batch_size: number;
  audio_format: 'wav';
  thinking: boolean;
  model: string;
  repaint_mode?: RepaintMode;
  repaint_strength?: number; // 0.0–1.0: balanced-mode intensity (0=conservative, 1=aggressive)
  seed?: number;
  use_random_seed?: boolean;
  src_audio_path?: string;
  negative_prompt?: string;  // Elements to exclude from generation
}

export type StemCount = 2 | 4 | 6;

/** Preferred separation engine — backend selects best model per stem count if 'auto' */
export type StemSeparationEngine = 'auto' | 'bs-roformer' | 'demucs-v4' | 'htdemucs-6s';

export interface StemSeparationTaskParams {
  task_type: 'stem_separation';
  stem_count: StemCount;
  audio_format: 'wav';
  /** Separation engine preference. 'auto' routes 4-stem to BS-RoFormer, 6-stem to Demucs v4. */
  engine?: StemSeparationEngine;
}

/** Parameters for text2music — generates a full mixed song from text description */
export interface Text2MusicTaskParams {
  task_type: 'text2music';
  prompt: string;              // Song description
  lyrics: string;
  audio_duration: number;
  bpm: number | null;           // null = auto-infer
  key_scale: string;            // "" = auto-infer
  time_signature: string;       // "" = auto-infer
  inference_steps: number;
  guidance_scale: number;
  shift: number;
  batch_size: number;
  audio_format: 'wav';
  thinking: boolean;
  model: string;
  seed?: number;
  use_random_seed?: boolean;
  use_cot_caption?: boolean;
  vocal_language?: string;   // "en", "zh", "ja", etc. — "unknown" = auto-detect
  /** Server-side path to reference audio sample for voice/style conditioning. */
  reference_audio_path?: string;
  /** Reference audio influence strength (0.0–1.0). */
  audio_cover_strength?: number;
  negative_prompt?: string;  // Elements to exclude from generation
}

/**
 * User's generation intent — drives automatic model selection.
 *
 * - `full-song`: text2music model → Text2MusicTaskParams
 * - `single-track`: lego model → LegoTaskParams
 * - `all-tracks`: lego model → LegoTaskParams (batch)
 * - `cover`: either model → CoverTaskParams
 * - `repaint`: either model → RepaintTaskParams
 */
export type GenerationIntent =
  | 'full-song'
  | 'single-track'
  | 'all-tracks'
  | 'cover'
  | 'repaint';

export interface LegoTaskParams {
  task_type: 'lego';
  track_name: string;
  prompt: string;              // Local/per-track description
  global_caption: string;      // Global/full-song description (for SFT-stems lego)
  lyrics: string;
  instruction: string;
  repainting_start: number;
  repainting_end: number;
  audio_duration: number;
  bpm: number | null;           // null = ACE-Step auto-infers
  key_scale: string;            // "" = ACE-Step auto-infers
  time_signature: string;       // "" = ACE-Step auto-infers
  inference_steps: number;
  guidance_scale: number;
  shift: number;
  batch_size: number;
  audio_format: 'wav';
  thinking: boolean;
  model: string;
  sample_mode?: boolean;
  sample_query?: string;
  use_format?: boolean;
  use_cot_caption?: boolean;
  seed?: number;            // explicit seed value; omit for backend-random
  use_random_seed?: boolean; // false = use seed field deterministically
  src_audio_path?: string;  // server-side path; when set, skips blob upload
  chunk_mask_mode?: 'explicit' | 'auto'; // "auto" = model decides where instruments start/stop (value 2); "explicit" = 0/1 mask
  vocal_language?: string;   // "en", "zh", "ja", etc. — "unknown" = auto-detect
  /** Server-side path to reference audio sample for voice/style conditioning. */
  reference_audio_path?: string;
  /** Reference audio influence strength (0.0–1.0). */
  audio_cover_strength?: number;
  negative_prompt?: string;  // Elements to exclude from generation
}

/** All API responses are wrapped in this envelope */
export interface ApiEnvelope<T> {
  data: T;
  code: number;
  error: string | null;
  timestamp: number;
  extra: unknown;
}

export interface ReleaseTaskResponse {
  task_id: string;
  status: string;
  queue_position?: number;
}

export interface TaskResultEntry {
  task_id: string;
  status: number; // 0=processing, 1=done, 2=error
  result: string; // JSON string: array of TaskResultItem
  progress_text: string;
}

/** Individual item inside the result JSON array */
export interface TaskResultItem {
  file: string;       // audio download URL (e.g. /v1/audio?path=...)
  wave: string;
  status: number;
  create_time: number;
  env: string;
  prompt: string;
  lyrics: string;
  metas: {
    bpm?: number;
    duration?: number;
    genres?: string;
    keyscale?: string;
    timesignature?: string;
  };
  seed_value?: string;
  generation_info?: string;
  lm_model?: string;
  dit_model?: string;
  progress?: number;
  stage?: string;
}

// ---------------------------------------------------------------------------
// AI Mixing — GRAFX differentiable audio processing (#738)
// ---------------------------------------------------------------------------

/** Mixing mode: optimize from scratch, match a reference style, or use text guidance */
export type AiMixMode = 'auto' | 'reference' | 'text';

export interface AiMixTaskParams {
  task_type: 'ai_mix';
  mode: AiMixMode;
  /** For 'reference' mode: server-side path to reference audio */
  reference_audio_path?: string;
  /** For 'text' mode: natural language mixing instruction */
  text_prompt?: string;
  /** Target loudness in LUFS (default: -14) */
  target_lufs?: number;
  /** Model to use (default: 'grafx') */
  model?: string;
}

/** Parameter-level mixing result — maps to DAW effect chain */
export interface AiMixResult {
  /** Per-track mix parameters keyed by track name */
  tracks: Record<string, TrackMixParams>;
  /** Master bus parameters */
  master: MasterMixParams;
}

export interface TrackMixParams {
  gain_db: number;
  pan: number;                 // -1.0 (L) to 1.0 (R)
  eq?: EqBand[];
  compressor?: CompressorParams;
  reverb_send?: number;        // 0.0–1.0
  delay_send?: number;         // 0.0–1.0
  mute?: boolean;
  solo?: boolean;
}

export interface EqBand {
  frequency_hz: number;
  gain_db: number;
  q: number;
  type: 'lowshelf' | 'highshelf' | 'peaking' | 'lowpass' | 'highpass';
}

export interface CompressorParams {
  threshold_db: number;
  ratio: number;
  attack_ms: number;
  release_ms: number;
  knee_db?: number;
  makeup_gain_db?: number;
}

export interface MasterMixParams {
  eq?: EqBand[];
  compressor?: CompressorParams;
  limiter_ceiling_db?: number;
  target_lufs?: number;
}

// ---------------------------------------------------------------------------
// MIDI AI Generation — Anticipatory Music Transformer / Moonbeam (#739)
// ---------------------------------------------------------------------------

/** MIDI generation mode */
export type MidiGenerationMode = 'infill' | 'continue' | 'arrange' | 'variation';

export interface MidiGenerationTaskParams {
  task_type: 'midi_generate';
  mode: MidiGenerationMode;
  /** Base64-encoded MIDI context (existing notes in the clip/region) */
  context_midi: string;
  /** Selection range in beats — model generates within this range for 'infill' */
  selection_start?: number;
  selection_end?: number;
  /** Indices of notes in context_midi that are locked (excluded from regeneration) */
  locked_note_indices?: number[];
  /** How many bars to generate for 'continue' mode */
  continuation_bars?: number;
  /** Target track/instrument for 'arrange' mode (e.g. 'bass', 'drums') */
  target_instrument?: string;
  /** Musical constraints */
  key?: string;                // e.g. 'C major', 'A minor'
  time_signature?: string;     // e.g. '4/4', '3/4'
  bpm?: number;
  /** Style/genre hint for conditioned models */
  style?: string;
  /** Temperature for sampling (0.0–2.0, default 1.0) */
  temperature?: number;
  /** Number of variations to generate */
  num_results?: number;
  /** Model to use */
  model?: string;              // 'anticipatory-music-transformer' | 'moonbeam' | 'midi-gpt' | 'notagen'
  seed?: number;
}

/** Single MIDI generation result */
export interface MidiGenerationResultItem {
  /** Base64-encoded generated MIDI data */
  midi_data: string;
  /** Confidence / quality score (0.0–1.0) if available */
  score?: number;
  /** Model that produced this result */
  model: string;
  /** Inferred musical attributes */
  inferred_attributes?: {
    key?: string;
    bpm?: number;
    time_signature?: string;
    genre?: string;
  };
}

// ---------------------------------------------------------------------------
// Chord AI — ChordSeqAI / musicautobot / AccoMontage2 (#740)
// ---------------------------------------------------------------------------

/** Chord generation/harmonization mode */
export type ChordMode = 'suggest' | 'harmonize' | 'continue' | 'from_text';

/** A single chord event in the DAW timeline */
export interface ChordEvent {
  /** Root note: 'C', 'C#', 'D', ... 'B' */
  root: string;
  /** Chord quality: 'maj', 'min', '7', 'maj7', 'min7', 'dim', 'aug', 'sus2', 'sus4', etc. */
  quality: string;
  /** Optional bass note for slash chords (e.g. 'E' for C/E) */
  bass?: string;
  /** Start position in beats */
  start_beat: number;
  /** Duration in beats */
  duration_beats: number;
}

export interface ChordGenerationTaskParams {
  task_type: 'chord_generate';
  mode: ChordMode;
  /** Existing chord progression for 'suggest' and 'continue' modes */
  existing_chords?: ChordEvent[];
  /** Base64-encoded melody MIDI for 'harmonize' mode */
  melody_midi?: string;
  /** Natural language description for 'from_text' mode */
  text_prompt?: string;
  /** Musical context */
  key?: string;
  time_signature?: string;
  bpm?: number;
  /** Genre/style conditioning (e.g. 'jazz', 'pop', 'classical') */
  genre?: string;
  /** Number of suggestions to return */
  num_suggestions?: number;
  /** Model preference */
  model?: string;              // 'chord-seq-ai' | 'musicautobot' | 'accomontage2' | 'remi'
}

export interface ChordGenerationResult {
  /** Primary chord result */
  chords: ChordEvent[];
  /** Confidence score (0.0–1.0) */
  confidence: number;
  /** Alternative suggestions ranked by score */
  alternatives?: ChordEvent[][];
  /** If mode was 'harmonize' with AccoMontage2, optional accompaniment MIDI */
  accompaniment_midi?: string;
}

// ---------------------------------------------------------------------------
// Extended model inventory — unified multi-model support (#741)
// ---------------------------------------------------------------------------

/** Capability categories for the model inventory */
export type ModelCapability =
  | 'music_generation'      // ACE-Step lego/cover/repaint
  | 'stem_separation'       // BS-RoFormer, Demucs
  | 'ai_mixing'             // GRAFX, FxNorm-Automix
  | 'midi_generation'       // Anticipatory Music Transformer, Moonbeam, NotaGen
  | 'chord_generation'      // ChordSeqAI, musicautobot
  | 'lm_reasoning';         // LLM for lyrics/annotation

/** Extended model entry with capability metadata */
export interface ExtendedModelEntry extends ModelEntry {
  /** Human-readable display name */
  display_name?: string;
  /** Model capabilities */
  capabilities?: ModelCapability[];
  /** Approximate VRAM requirement in GB */
  vram_gb?: number;
  /** Whether this model can run client-side (ONNX/WebGPU) */
  client_side?: boolean;
  /** SPDX license identifier */
  license?: string;
  /** Link to model card or paper */
  info_url?: string;
}

/** Extended inventory response grouping models by capability */
export interface ExtendedModelsListResponse extends ModelsListResponse {
  /** All models with extended metadata */
  all_models?: ExtendedModelEntry[];
}

// ---------------------------------------------------------------------------
// Unified task type union
// ---------------------------------------------------------------------------

export type AiTaskParams =
  | LegoTaskParams
  | Text2MusicTaskParams
  | CoverTaskParams
  | RepaintTaskParams
  | StemSeparationTaskParams
  | AiMixTaskParams
  | MidiGenerationTaskParams
  | ChordGenerationTaskParams;

export type AiTaskType = AiTaskParams['task_type'];

export interface HealthResponse {
  status: string;
  models_initialized?: boolean;
  llm_initialized?: boolean;
  loaded_model?: string | null;
  loaded_lm_model?: string | null;
}

/** Model family: text2music generates full mixed songs, lego generates single tracks with context, custom is user-trained */
export type ModelCategory = 'text2music' | 'lego' | 'custom';

// ---------------------------------------------------------------------------
// Custom Model Fine-Tuning (#1089)
// ---------------------------------------------------------------------------

/** Training stage progression */
export type TrainingStage = 'uploading' | 'preprocessing' | 'training' | 'validating' | 'complete' | 'failed';

/** Status of a training job */
export type TrainingJobStatus = 'pending' | 'uploading' | 'preprocessing' | 'training' | 'validating' | 'complete' | 'failed';

/** A reference track uploaded for fine-tuning */
export interface TrainingDataTrack {
  id: string;
  filename: string;
  /** Duration in seconds */
  duration: number;
  /** Detected BPM (null if analysis pending) */
  bpm: number | null;
  /** Detected genre tags */
  genre: string[];
  /** File size in bytes */
  sizeBytes: number;
  /** MIME type */
  mimeType: string;
  /** Timestamp when uploaded */
  uploadedAt: number;
}

/** A custom model created through fine-tuning */
export interface CustomModel {
  id: string;
  name: string;
  description: string;
  /** Number of reference tracks used for training */
  trackCount: number;
  /** Style tags extracted from training data */
  styleTags: string[];
  /** When training completed */
  trainedAt: number;
  /** Training job that created this model */
  trainingJobId: string;
  /** Server-side model path for generation */
  modelPath: string;
}

/** Parameters for submitting a training job */
export interface TrainModelRequest {
  /** User-provided model name */
  name: string;
  /** User-provided description */
  description: string;
  /** IDs of uploaded reference tracks */
  track_ids: string[];
}

/** Response from training job submission */
export interface TrainModelResponse {
  job_id: string;
  status: TrainingJobStatus;
}

/** Training job status from polling */
export interface TrainingJobStatusResponse {
  job_id: string;
  status: TrainingJobStatus;
  stage: TrainingStage;
  progress_percent: number;
  /** Set when complete */
  model_path?: string;
  /** Set on failure */
  error?: string;
}

/** Response from uploading a reference track */
export interface UploadTrainingTrackResponse {
  track_id: string;
  filename: string;
  duration: number;
  bpm: number | null;
  genre: string[];
  size_bytes: number;
}

export interface ModelEntry {
  name: string;
  is_default: boolean;
  is_loaded: boolean;
  supported_task_types?: string[];
  /** Model family — provided by backend, or inferred from supported_task_types */
  category?: ModelCategory;
}

export interface LmModelEntry {
  name: string;
  is_loaded: boolean;
}

export interface ModelsListResponse {
  models: ModelEntry[];
  default_model: string | null;
  lm_models: LmModelEntry[];
  loaded_lm_model?: string | null;
  llm_initialized?: boolean;
}

export interface InitModelRequest {
  model?: string;
  init_llm?: boolean;
  lm_model_path?: string;
}

export interface InitModelResponse {
  message: string;
  loaded_model?: string | null;
  loaded_lm_model?: string | null;
  models?: ModelEntry[];
  lm_models?: LmModelEntry[];
  llm_initialized?: boolean;
}

export interface JobStats {
  total: number;
  succeeded: number;
  failed: number;
  running: number;
  queued: number;
}

export interface StatsResponse {
  jobs: JobStats;
  queue_size: number;
  queue_maxsize: number;
  avg_job_seconds: number;
}

/** Request for Simple mode "Create Sample" — LM infers full metadata from a short description */
export interface CreateSampleRequest {
  query: string;
  vocal_language: string;
  instrumental: boolean;
}

/** Response from Create Sample — all inferred metadata for a song */
export interface CreateSampleResponse {
  caption?: string;
  lyrics?: string;
  bpm?: number;
  keyscale?: string;
  duration?: number;
  timesignature?: string;
  vocal_language?: string;
}

// ---------------------------------------------------------------------------
// Voice Identity Verification (#1096)
// ---------------------------------------------------------------------------

/** Verification status for a voice profile */
export type VoiceVerificationStatus = 'unverified' | 'pending' | 'verified' | 'failed';

/** Response from requesting a verification phrase */
export interface VerificationPhraseResponse {
  phrase_id: string;
  text: string;
  language: string;
}

/** Response from voice verification comparison */
export interface VoiceVerificationResponse {
  match: boolean;
  confidence: number;
  phrase_id: string;
  error?: string;
}

/** A voice profile with verification status */
export interface VoiceProfile {
  id: string;
  name: string;
  /** Timestamp when created */
  createdAt: number;
  /** Reference audio key in storage */
  referenceAudioKey: string | null;
  /** Verification status */
  verificationStatus: VoiceVerificationStatus;
  /** When verification was completed */
  verifiedAt: number | null;
  /** Confidence score from verification (0-1) */
  verificationConfidence: number | null;
}
