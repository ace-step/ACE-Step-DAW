import type { LoudnessTarget, MasteringPreset } from './project';

export type PostProductionTaskType = 'repair' | 'extend' | 'polish';

export type PostProductionTaskStatus = 'idle' | 'configured' | 'running' | 'done' | 'error';

export type PostProductionContextMode = 'auto' | 'context' | 'selection' | 'none';

export interface PostProductionTimeRange {
  startTime: number;
  endTime: number;
}

export interface PostProductionTaskInput {
  taskType: PostProductionTaskType;
  targetTrackIds: string[];
  targetClipIds: string[];
  timeRange: PostProductionTimeRange | null;
  prompt: string;
  globalCaption: string;
  lyricsOverride: string;
  contextMode: PostProductionContextMode;
  masteringPreset: MasteringPreset;
  loudnessTarget: LoudnessTarget;
}

export interface PostProductionTaskResult {
  taskType: PostProductionTaskType;
  summary: string;
  nextSuggestedTaskType: PostProductionTaskType | null;
  data: Record<string, unknown>;
  completedAt: number;
}

export interface PostProductionTaskError {
  code:
    | 'PROJECT_REQUIRED'
    | 'TRACK_REQUIRED'
    | 'TRACK_NOT_FOUND'
    | 'CLIP_REQUIRED'
    | 'CLIP_NOT_FOUND'
    | 'AUDIO_SOURCE_REQUIRED'
    | 'TIME_RANGE_REQUIRED'
    | 'INVALID_TIME_RANGE'
    | 'TASK_NOT_READY'
    | 'TASK_FAILED';
  message: string;
  context: Record<string, unknown>;
  recoverySuggestions: string[];
}

export interface PostProductionTaskState {
  taskType: PostProductionTaskType;
  targetTrackIds: string[];
  targetClipIds: string[];
  timeRange: PostProductionTimeRange | null;
  prompt: string;
  globalCaption: string;
  lyricsOverride: string;
  contextMode: PostProductionContextMode;
  masteringPreset: MasteringPreset;
  loudnessTarget: LoudnessTarget;
  status: PostProductionTaskStatus;
  lastResult: PostProductionTaskResult | null;
  lastError: PostProductionTaskError | null;
}

export interface PostProductionStartRepairArgs {
  clipId?: string;
  startTime?: number;
  endTime?: number;
  prompt?: string;
  lyrics?: string;
  globalCaption?: string;
}

export interface PostProductionStartExtendArgs {
  trackIds?: string[];
  startTime?: number;
  endTime?: number;
  prompt?: string;
  lyrics?: string;
  globalCaption?: string;
  contextMode?: PostProductionContextMode;
}

export interface PostProductionStartPolishArgs {
  preset?: MasteringPreset;
  loudnessTarget?: LoudnessTarget;
}
