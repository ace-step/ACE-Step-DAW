/**
 * Zustand store for tracking local audio analysis jobs.
 */
import { create } from 'zustand';
import type {
  LocalAnalysisResult,
  LocalAnalysisStatus,
  AnalysisWorkerProgress,
} from '../types/analysis';

export interface AnalysisJob {
  id: string;
  clipId: string;
  status: LocalAnalysisStatus;
  progress: number;
  message: string;
  result: LocalAnalysisResult | null;
  error: string | null;
  startedAt: number;
  completedAt: number | null;
}

interface AnalysisState {
  jobs: Record<string, AnalysisJob>;

  /** Create a new job entry. Returns the job ID. */
  createJob: (clipId: string) => string;

  /** Update job progress from worker message. */
  updateJobProgress: (jobId: string, progress: AnalysisWorkerProgress) => void;

  /** Mark job as completed with result. */
  completeJob: (jobId: string, result: LocalAnalysisResult) => void;

  /** Mark job as failed. */
  failJob: (jobId: string, error: string) => void;

  /** Remove a job from tracking. */
  clearJob: (jobId: string) => void;

  /** Get the active/latest job for a clip. */
  getJobForClip: (clipId: string) => AnalysisJob | undefined;
}

let jobCounter = 0;

export const useAnalysisStore = create<AnalysisState>((set, get) => ({
  jobs: {},

  createJob(clipId: string): string {
    const seq = ++jobCounter;
    const id = `analysis-${seq}-${Date.now()}`;
    const job: AnalysisJob = {
      id,
      clipId,
      status: 'idle',
      progress: 0,
      message: 'Starting analysis...',
      result: null,
      error: null,
      startedAt: performance.now() + seq, // monotonic + unique
      completedAt: null,
    };
    set((state) => ({ jobs: { ...state.jobs, [id]: job } }));
    return id;
  },

  updateJobProgress(jobId: string, progress: AnalysisWorkerProgress) {
    set((state) => {
      const job = state.jobs[jobId];
      if (!job) return state;
      return {
        jobs: {
          ...state.jobs,
          [jobId]: {
            ...job,
            status: progress.status,
            progress: progress.percent,
            message: progress.message,
          },
        },
      };
    });
  },

  completeJob(jobId: string, result: LocalAnalysisResult) {
    set((state) => {
      const job = state.jobs[jobId];
      if (!job) return state;
      return {
        jobs: {
          ...state.jobs,
          [jobId]: {
            ...job,
            status: 'done',
            progress: 100,
            message: 'Analysis complete',
            result,
            completedAt: Date.now(),
          },
        },
      };
    });
  },

  failJob(jobId: string, error: string) {
    set((state) => {
      const job = state.jobs[jobId];
      if (!job) return state;
      return {
        jobs: {
          ...state.jobs,
          [jobId]: {
            ...job,
            status: 'error',
            message: error,
            error,
            completedAt: Date.now(),
          },
        },
      };
    });
  },

  clearJob(jobId: string) {
    set((state) => {
      const { [jobId]: _removed, ...rest } = state.jobs;
      return { jobs: rest };
    });
  },

  getJobForClip(clipId: string): AnalysisJob | undefined {
    const jobs = get().jobs;
    // Return the most recent job for this clip
    return Object.values(jobs)
      .filter((j) => j.clipId === clipId)
      .sort((a, b) => b.startedAt - a.startedAt)[0];
  },
}));
