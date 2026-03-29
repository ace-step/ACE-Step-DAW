/** A detected beat position in the audio. */
export interface BeatEvent {
  /** Time in seconds from audio start. */
  time: number;
  /** Whether this beat is a downbeat (start of bar). */
  isDownbeat: boolean;
  /** Confidence 0-1. */
  confidence: number;
}

/** A detected chord region in the audio. */
export interface ChordEvent {
  /** Start time in seconds. */
  startTime: number;
  /** End time in seconds. */
  endTime: number;
  /** Chord label, e.g. "C:maj", "E:min7", "N" for no chord. */
  label: string;
  /** Confidence 0-1. */
  confidence: number;
}

/** Full analysis result for a clip. */
export interface LocalAnalysisResult {
  bpm: number;
  beats: BeatEvent[];
  chords: ChordEvent[];
  /** Estimated key/scale from chord distribution, e.g. "C major". */
  keyScale: string | null;
  /** Time signature inferred from downbeat spacing. */
  timeSignature: string | null;
}

/** Status of a local analysis job. */
export type LocalAnalysisStatus =
  | 'idle'
  | 'loading-model'
  | 'decoding-audio'
  | 'computing-features'
  | 'running-bpm'
  | 'running-chords'
  | 'post-processing'
  | 'done'
  | 'error';

/** Progress update from the analysis worker. */
export interface AnalysisWorkerProgress {
  type: 'progress';
  status: LocalAnalysisStatus;
  percent: number;
  message: string;
}

/** Result message from the analysis worker. */
export interface AnalysisWorkerResult {
  type: 'result';
  result: LocalAnalysisResult;
}

/** Error message from the analysis worker. */
export interface AnalysisWorkerError {
  type: 'error';
  error: string;
}

export type AnalysisWorkerMessage =
  | AnalysisWorkerProgress
  | AnalysisWorkerResult
  | AnalysisWorkerError;

/** Message sent to the analysis worker. */
export interface AnalysisWorkerRequest {
  type: 'analyze';
  /** Mono audio samples, already downsampled to target sample rate. */
  samples: Float32Array;
  sampleRate: number;
  /** Which analyses to run. */
  tasks: AnalysisTask[];
}

export type AnalysisTask = 'bpm' | 'chords';

export type AnalysisModelId = 'beat-this-small' | 'consonance-ace';

export interface AnalysisModelMeta {
  id: AnalysisModelId;
  name: string;
  sizeBytes: number;
  url: string;
  /** IndexedDB cache key. */
  cacheKey: string;
}

/** Model download progress. */
export interface ModelDownloadProgress {
  modelName: string;
  bytesLoaded: number;
  bytesTotal: number;
  percent: number;
}
