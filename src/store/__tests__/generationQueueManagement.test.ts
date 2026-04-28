import { describe, it, expect, beforeEach, vi } from 'vitest';
import { deriveGenerationJobProgress, useGenerationStore, type GenerationJob } from '../generationStore';
import { clearAllControllers, registerJobAbortController } from '../../services/generationAbortRegistry';

function createTestJob(overrides: Partial<GenerationJob> = {}): GenerationJob {
  return {
    id: `job-${Math.random().toString(36).slice(2, 8)}`,
    clipId: 'clip-1',
    trackName: 'Test Track',
    status: 'generating',
    progress: 'Generating...',
    stage: 'Generating audio',
    progressPercent: 50,
    etaSeconds: null,
    etaConfidence: 'none',
    startedAt: Date.now(),
    lastUpdatedAt: Date.now(),
    ...overrides,
  };
}

describe('cancelJob', () => {
  beforeEach(() => {
    clearAllControllers();
    useGenerationStore.setState({ jobs: [], isGenerating: false });
  });

  it('sets job status to cancelled', () => {
    const job = createTestJob({ id: 'job-1', status: 'generating' });
    registerJobAbortController(job.id);
    useGenerationStore.getState().addJob(job);
    useGenerationStore.getState().cancelJob('job-1');

    const updated = useGenerationStore.getState().jobs.find((j) => j.id === 'job-1');
    expect(updated?.status).toBe('cancelled');
  });

  it('sets job status to cancelled for queued jobs', () => {
    const job = createTestJob({ id: 'job-q', status: 'queued' });
    registerJobAbortController(job.id);
    useGenerationStore.getState().addJob(job);
    useGenerationStore.getState().cancelJob('job-q');

    const updated = useGenerationStore.getState().jobs.find((j) => j.id === 'job-q');
    expect(updated?.status).toBe('cancelled');
  });

  it('does nothing for a non-existent job', () => {
    const job = createTestJob({ id: 'job-1' });
    useGenerationStore.getState().addJob(job);
    useGenerationStore.getState().cancelJob('non-existent');

    const jobs = useGenerationStore.getState().jobs;
    expect(jobs).toHaveLength(1);
    expect(jobs[0].status).toBe('generating');
  });

  it('does nothing for already completed jobs', () => {
    const job = createTestJob({ id: 'job-done', status: 'done' });
    useGenerationStore.getState().addJob(job);
    useGenerationStore.getState().cancelJob('job-done');

    const updated = useGenerationStore.getState().jobs.find((j) => j.id === 'job-done');
    expect(updated?.status).toBe('done');
  });

  it('does nothing for already errored jobs', () => {
    const job = createTestJob({ id: 'job-err', status: 'error' });
    useGenerationStore.getState().addJob(job);
    useGenerationStore.getState().cancelJob('job-err');

    const updated = useGenerationStore.getState().jobs.find((j) => j.id === 'job-err');
    expect(updated?.status).toBe('error');
  });

  it('leaves the generation lock for the owning pipeline to release', () => {
    useGenerationStore.setState({ isGenerating: true });
    const job = createTestJob({ id: 'job-1', status: 'generating' });
    registerJobAbortController(job.id);
    useGenerationStore.getState().addJob(job);
    useGenerationStore.getState().cancelJob('job-1');

    expect(useGenerationStore.getState().isGenerating).toBe(true);
  });

  it('does not release lock if other active jobs remain', () => {
    useGenerationStore.setState({ isGenerating: true });
    const job1 = createTestJob({ id: 'job-1', status: 'generating' });
    const job2 = createTestJob({ id: 'job-2', status: 'generating' });
    registerJobAbortController(job1.id);
    useGenerationStore.getState().addJob(job1);
    useGenerationStore.getState().addJob(job2);
    useGenerationStore.getState().cancelJob('job-1');

    expect(useGenerationStore.getState().isGenerating).toBe(true);
  });

  it('does not mark jobs as cancelled without an abort controller', () => {
    useGenerationStore.setState({ isGenerating: true });
    const job = createTestJob({ id: 'job-no-controller', status: 'generating' });
    useGenerationStore.getState().addJob(job);
    useGenerationStore.getState().cancelJob('job-no-controller');

    const updated = useGenerationStore.getState().jobs.find((j) => j.id === 'job-no-controller');
    expect(updated?.status).toBe('generating');
    expect(useGenerationStore.getState().isGenerating).toBe(true);
  });
});

describe('cancelAllJobs', () => {
  beforeEach(() => {
    clearAllControllers();
    useGenerationStore.setState({ jobs: [], isGenerating: false });
  });

  it('cancels all active and queued jobs', () => {
    useGenerationStore.setState({ isGenerating: true });
    const jobs = [
      createTestJob({ id: 'j1', status: 'generating' }),
      createTestJob({ id: 'j2', status: 'queued' }),
      createTestJob({ id: 'j3', status: 'done' }),
      createTestJob({ id: 'j4', status: 'error' }),
    ];
    registerJobAbortController('j1');
    registerJobAbortController('j2');
    for (const j of jobs) useGenerationStore.getState().addJob(j);
    useGenerationStore.getState().cancelAllJobs();

    const updated = useGenerationStore.getState().jobs;
    expect(updated.find((j) => j.id === 'j1')?.status).toBe('cancelled');
    expect(updated.find((j) => j.id === 'j2')?.status).toBe('cancelled');
    expect(updated.find((j) => j.id === 'j3')?.status).toBe('done');
    expect(updated.find((j) => j.id === 'j4')?.status).toBe('error');
  });

  it('leaves the generation lock for the owning pipeline to release', () => {
    useGenerationStore.setState({ isGenerating: true });
    const job = createTestJob({ id: 'j1', status: 'generating' });
    registerJobAbortController(job.id);
    useGenerationStore.getState().addJob(job);
    useGenerationStore.getState().cancelAllJobs();

    expect(useGenerationStore.getState().isGenerating).toBe(true);
  });
});

describe('clearCompletedJobs includes cancelled', () => {
  beforeEach(() => {
    useGenerationStore.setState({ jobs: [] });
  });

  it('clears cancelled jobs along with done and error jobs', () => {
    const jobs = [
      createTestJob({ id: 'j1', status: 'done' }),
      createTestJob({ id: 'j2', status: 'error' }),
      createTestJob({ id: 'j3', status: 'cancelled' as GenerationJob['status'] }),
      createTestJob({ id: 'j4', status: 'generating' }),
    ];
    for (const j of jobs) useGenerationStore.getState().addJob(j);
    useGenerationStore.getState().clearCompletedJobs();

    const remaining = useGenerationStore.getState().jobs;
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe('j4');
  });
});

describe('deriveGenerationJobProgress cancelled jobs', () => {
  it('infers a cancelled stage label', () => {
    const progress = deriveGenerationJobProgress(undefined, {
      status: 'cancelled',
      progress: '',
      progressPercent: 70,
      now: 1_000,
    });

    expect(progress.stage).toBe('Cancelled');
    expect(progress.progressPercent).toBeNull();
    expect(progress.etaSeconds).toBeNull();
    expect(progress.completedAt).toBe(1_000);
  });
});
