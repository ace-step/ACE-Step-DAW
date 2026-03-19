import { beforeEach, describe, expect, it } from 'vitest';
import {
  useGenerationStore,
  type GenerationJob,
  getGenerationValidationError,
} from '../../src/store/generationStore';

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
    localStorage.clear();
    useGenerationStore.setState(useGenerationStore.getInitialState(), true);
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
      expect(remaining.map((job) => job.id).sort()).toEqual(['j3', 'j4']);
    });
  });

  describe('panel form state', () => {
    it('stores generation form controls for agent access', () => {
      const store = useGenerationStore.getState();

      store.setGenerationPrompt('brooding techno groove');
      store.toggleGenerationStyleTag('Electronic');
      store.setGenerationBpm(126);
      store.setGenerationKeyScale('E minor');
      store.setGenerationLengthSeconds(48);
      store.setGenerationTemperature(0.45);
      store.setGenerationVariationCount(4);
      store.setGenerationTargetTrack('track-42');

      expect(useGenerationStore.getState().generationForm).toMatchObject({
        prompt: 'brooding techno groove',
        styleTags: ['Electronic'],
        bpm: 126,
        keyScale: 'E minor',
        lengthSeconds: 48,
        temperature: 0.45,
        variationCount: 4,
        selectedTrackId: 'track-42',
      });
    });

    it('returns actionable validation feedback for invalid requests', () => {
      expect(getGenerationValidationError({
        prompt: '',
        selectedTrackId: '',
        bpm: 120,
        lengthSeconds: 30,
        temperature: 0.7,
        variationCount: 2,
      })).toBe('Add a prompt that describes the material you want to generate.');

      useGenerationStore.getState().setGenerationPrompt('focused piano ostinato');
      useGenerationStore.getState().setGenerationTargetTrack('track-1');
      expect(useGenerationStore.getState().canSubmitGeneration()).toBe(true);
    });
  });

  describe('prompt history', () => {
    it('adds a prompt to history', () => {
      useGenerationStore.getState().addPromptToHistory('lo-fi hip hop beat', { trackName: 'drums' });
      const history = useGenerationStore.getState().promptHistory;
      expect(history).toHaveLength(1);
      expect(history[0].prompt).toBe('lo-fi hip hop beat');
      expect(history[0].trackName).toBe('drums');
    });

    it('moves duplicate prompts to front instead of adding twice', () => {
      useGenerationStore.getState().addPromptToHistory('jazz piano');
      useGenerationStore.getState().addPromptToHistory('rock guitar');
      useGenerationStore.getState().addPromptToHistory('jazz piano');

      const history = useGenerationStore.getState().promptHistory;
      expect(history).toHaveLength(2);
      expect(history[0].prompt).toBe('jazz piano');
      expect(history[1].prompt).toBe('rock guitar');
    });

    it('limits history to 50 entries', () => {
      for (let index = 0; index < 60; index += 1) {
        useGenerationStore.getState().addPromptToHistory(`prompt ${index}`);
      }
      expect(useGenerationStore.getState().promptHistory).toHaveLength(50);
    });

    it('clears prompt history', () => {
      useGenerationStore.getState().addPromptToHistory('test');
      useGenerationStore.getState().clearPromptHistory();
      expect(useGenerationStore.getState().promptHistory).toHaveLength(0);
    });
  });
});
