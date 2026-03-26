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
}

export type StemCount = 2 | 4 | 6;

export interface StemSeparationTaskParams {
  task_type: 'stem_separation';
  stem_count: StemCount;
  audio_format: 'wav';
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

export interface HealthResponse {
  status: string;
  models_initialized?: boolean;
  llm_initialized?: boolean;
  loaded_model?: string | null;
  loaded_lm_model?: string | null;
}

/** Model family: text2music generates full mixed songs, lego generates single tracks with context */
export type ModelCategory = 'text2music' | 'lego';

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
