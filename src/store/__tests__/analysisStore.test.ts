import { describe, it, expect, beforeEach } from 'vitest';
import { useAnalysisStore } from '../analysisStore';
import type { LocalAnalysisResult } from '../../types/analysis';

beforeEach(() => {
  // Reset store state between tests
  useAnalysisStore.setState({ jobs: {} });
});

describe('analysisStore', () => {
  describe('createJob', () => {
    it('creates a job with initial state', () => {
      const jobId = useAnalysisStore.getState().createJob('clip-1');
      const job = useAnalysisStore.getState().jobs[jobId];

      expect(job).toBeDefined();
      expect(job.clipId).toBe('clip-1');
      expect(job.status).toBe('idle');
      expect(job.progress).toBe(0);
      expect(job.result).toBeNull();
      expect(job.error).toBeNull();
      expect(job.startedAt).toBeGreaterThan(0);
      expect(job.completedAt).toBeNull();
    });

    it('creates unique job IDs', () => {
      const id1 = useAnalysisStore.getState().createJob('clip-1');
      const id2 = useAnalysisStore.getState().createJob('clip-1');
      expect(id1).not.toBe(id2);
    });
  });

  describe('updateJobProgress', () => {
    it('updates status, progress, and message', () => {
      const jobId = useAnalysisStore.getState().createJob('clip-1');

      useAnalysisStore.getState().updateJobProgress(jobId, {
        type: 'progress',
        status: 'computing-features',
        percent: 30,
        message: 'Computing mel spectrogram...',
      });

      const job = useAnalysisStore.getState().jobs[jobId];
      expect(job.status).toBe('computing-features');
      expect(job.progress).toBe(30);
      expect(job.message).toBe('Computing mel spectrogram...');
    });

    it('ignores updates for unknown jobs', () => {
      const before = useAnalysisStore.getState().jobs;
      useAnalysisStore.getState().updateJobProgress('nonexistent', {
        type: 'progress',
        status: 'running-bpm',
        percent: 50,
        message: 'test',
      });
      expect(useAnalysisStore.getState().jobs).toBe(before);
    });
  });

  describe('completeJob', () => {
    it('sets done status and stores result', () => {
      const jobId = useAnalysisStore.getState().createJob('clip-1');
      const result: LocalAnalysisResult = {
        bpm: 128,
        beats: [{ time: 0.5, isDownbeat: true, confidence: 0.95 }],
        chords: [{ startTime: 0, endTime: 2, label: 'C:maj', confidence: 0.9 }],
        keyScale: 'C major',
        timeSignature: '4/4',
      };

      useAnalysisStore.getState().completeJob(jobId, result);

      const job = useAnalysisStore.getState().jobs[jobId];
      expect(job.status).toBe('done');
      expect(job.progress).toBe(100);
      expect(job.result).toEqual(result);
      expect(job.completedAt).toBeGreaterThan(0);
    });
  });

  describe('failJob', () => {
    it('sets error status and message', () => {
      const jobId = useAnalysisStore.getState().createJob('clip-1');

      useAnalysisStore.getState().failJob(jobId, 'Model failed to load');

      const job = useAnalysisStore.getState().jobs[jobId];
      expect(job.status).toBe('error');
      expect(job.error).toBe('Model failed to load');
      expect(job.completedAt).toBeGreaterThan(0);
    });
  });

  describe('clearJob', () => {
    it('removes a job from tracking', () => {
      const jobId = useAnalysisStore.getState().createJob('clip-1');
      expect(useAnalysisStore.getState().jobs[jobId]).toBeDefined();

      useAnalysisStore.getState().clearJob(jobId);
      expect(useAnalysisStore.getState().jobs[jobId]).toBeUndefined();
    });
  });

  describe('getJobForClip', () => {
    it('returns the most recent job for a clip', () => {
      const id1 = useAnalysisStore.getState().createJob('clip-1');
      const id2 = useAnalysisStore.getState().createJob('clip-1');
      useAnalysisStore.getState().createJob('clip-2');

      const job = useAnalysisStore.getState().getJobForClip('clip-1');
      expect(job?.id).toBe(id2); // most recent
    });

    it('returns undefined for unknown clip', () => {
      const job = useAnalysisStore.getState().getJobForClip('nonexistent');
      expect(job).toBeUndefined();
    });
  });
});
