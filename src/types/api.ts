export interface LegoTaskParams {
  task_type: 'lego';
  track_name: string;
  prompt: string;
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
}

export interface ModelEntry {
  name: string;
  is_default: boolean;
}

export interface ModelsListResponse {
  models: ModelEntry[];
  default_model: string | null;
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
