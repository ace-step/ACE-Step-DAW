import { beforeEach, describe, expect, it } from 'vitest';
import { useGenerationStore, type GenerationJob } from '../../src/store/generationStore';

function makeJob(overrides: Partial<GenerationJob> = {}): GenerationJob {
  return {
    id: `job-${Math.random().toString(36).slice(2)}`,
    clipId: 'clip-1',
    trackName: 'Track 1',
    status: 'queued',
    progress: 'Queued',
    ...overrides,
  };
}

describe('generationStore', () => {
  beforeEach(() => {
    const initial = useGenerationStore.getInitialState?.() ?? { jobs: [], isGenerating: false };
    useGenerationStore.setState(initial, true);
  });

  describe('job management', () => {
    it('adds a job to the queue', () => {
      const job = makeJob({ id: 'j1' });
      useGenerationStore.getState().addJob(job);
      expect(useGenerationStore.getState().jobs).toHaveLength(1);
      expect(useGenerationStore.getState().jobs[0].id).toBe('j1');
    });

    it('updates an existing job', () => {
      const job = makeJob({ id: 'j1' });
      useGenerationStore.getState().addJob(job);
      useGenerationStore.getState().updateJob('j1', { status: 'generating', progress: '50%' });

      const updated = useGenerationStore.getState().jobs[0];
      expect(updated.status).toBe('generating');
      expect(updated.progress).toBe('50%');
    });

    it('removes a job by id', () => {
      useGenerationStore.getState().addJob(makeJob({ id: 'j1' }));
      useGenerationStore.getState().addJob(makeJob({ id: 'j2' }));
      useGenerationStore.getState().removeJob('j1');

      expect(useGenerationStore.getState().jobs).toHaveLength(1);
      expect(useGenerationStore.getState().jobs[0].id).toBe('j2');
    });

    it('clears only completed and errored jobs', () => {
      useGenerationStore.getState().addJob(makeJob({ id: 'j1', status: 'done' }));
      useGenerationStore.getState().addJob(makeJob({ id: 'j2', status: 'error' }));
      useGenerationStore.getState().addJob(makeJob({ id: 'j3', status: 'generating' }));
      useGenerationStore.getState().addJob(makeJob({ id: 'j4', status: 'queued' }));

      useGenerationStore.getState().clearCompletedJobs();

      const remaining = useGenerationStore.getState().jobs;
      expect(remaining).toHaveLength(2);
      expect(remaining.map((j) => j.id).sort()).toEqual(['j3', 'j4']);
    });
  });

  describe('isGenerating flag', () => {
    it('tracks generation state', () => {
      expect(useGenerationStore.getState().isGenerating).toBe(false);
      useGenerationStore.getState().setIsGenerating(true);
      expect(useGenerationStore.getState().isGenerating).toBe(true);
      useGenerationStore.getState().setIsGenerating(false);
      expect(useGenerationStore.getState().isGenerating).toBe(false);
    });
  });
});
