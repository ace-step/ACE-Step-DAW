import { beforeEach, describe, expect, it } from 'vitest';
import {
  useGenerationStore,
  type GenerationJob,
  getGenerationValidationError,
  deriveGenerationJobProgress,
} from '../../src/store/generationStore';
import { useProjectStore } from '../../src/store/projectStore';

function makeJob(overrides: Partial<GenerationJob> = {}): GenerationJob {
  return {
    id: `job-${Math.random().toString(36).slice(2)}`,
    clipId: 'clip-1',
    trackName: 'Track 1',
    status: 'queued',
    progress: 'Queued',
    stage: 'Queued',
    progressPercent: null,
    etaSeconds: null,
    etaConfidence: 'none',
    ...overrides,
  };
}

describe('generationStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useGenerationStore.setState(useGenerationStore.getInitialState(), true);
    useProjectStore.setState(useProjectStore.getInitialState(), true);
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

    it('derives monotonic progress and ETA only when runtime data is strong enough', () => {
      const initial = makeJob({ id: 'j1', status: 'generating', progress: 'Generating... 12%', startedAt: 0 });

      const first = deriveGenerationJobProgress(initial, {
        status: 'generating',
        progress: 'Diffusion warmup 12%',
        progressPercent: 12,
        now: 2_000,
      });
      expect(first.progressPercent).toBe(12);
      expect(first.stage).toBe('Diffusion warmup');
      expect(first.etaConfidence).toBe('none');
      expect(first.etaSeconds).toBeNull();

      const second = deriveGenerationJobProgress({ ...initial, ...first }, {
        status: 'generating',
        progress: 'Diffusion pass 40%',
        progressPercent: 40,
        now: 16_000,
      });
      expect(second.progressPercent).toBe(40);
      expect(second.etaConfidence).toBe('high');
      expect(second.etaSeconds).toBe(24);

      const third = deriveGenerationJobProgress({ ...initial, ...first, ...second }, {
        status: 'generating',
        progress: 'Diffusion pass 30%',
        progressPercent: 30,
        now: 20_000,
      });
      expect(third.progressPercent).toBe(40);
    });

    it('builds actionable timeout guidance for failed jobs', () => {
      const updates = deriveGenerationJobProgress(undefined, {
        status: 'error',
        progress: 'Generation timed out',
        error: 'Generation timed out',
        now: 12_000,
      });

      expect(updates.actionableMessage).toContain('timed out');
      expect(updates.actionableMessage).toContain('Retry');
      expect(updates.etaConfidence).toBe('none');
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

  describe('prompt autocomplete', () => {
    it('returns ranked suggestions for the token at the caret', () => {
      const suggestions = useGenerationStore.getState().getPromptAutocompleteSuggestions('warm ana pad', 8);

      expect(suggestions[0]).toMatchObject({
        value: 'analog',
        category: 'technique',
      });
      expect(suggestions.some((suggestion) => suggestion.value === 'analog synth')).toBe(true);
    });

    it('replaces only the active token when applying a suggestion', () => {
      useGenerationStore.getState().setGenerationPrompt('warm ana pad');

      const result = useGenerationStore.getState().applyPromptAutocompleteSuggestion('analog', 8);

      expect(result).toEqual({
        prompt: 'warm analog pad',
        caretIndex: 11,
      });
      expect(useGenerationStore.getState().generationForm.prompt).toBe('warm analog pad');
    });
  });

  describe('generation history', () => {
    it('upserts reusable generation records and filters them by model, time range, and search query', () => {
      const now = Date.now();
      useGenerationStore.getState().upsertGenerationHistoryRecord({
        clipId: 'clip-1',
        trackId: 'track-1',
        trackName: 'Drums',
        prompt: 'tight breakbeat with dusty hats',
        model: 'ace-v1',
        duration: 16,
        status: 'done',
        createdAt: now,
        updatedAt: now,
        completedAt: now,
        audioKey: 'audio-1',
      });
      useGenerationStore.getState().upsertGenerationHistoryRecord({
        clipId: 'clip-2',
        trackId: 'track-2',
        trackName: 'Bass',
        prompt: 'sub bass with glide',
        model: 'ace-v2',
        duration: 8,
        status: 'error',
        createdAt: now - (9 * 24 * 60 * 60 * 1000),
        updatedAt: now - (9 * 24 * 60 * 60 * 1000),
        error: 'Backend timeout',
      });
      useGenerationStore.getState().upsertGenerationHistoryRecord({
        clipId: 'clip-1',
        trackId: 'track-1',
        trackName: 'Drums',
        prompt: 'tight breakbeat with dusty hats',
        model: 'ace-v1.1',
        duration: 20,
        status: 'done',
        createdAt: now,
        updatedAt: now + 1_000,
        completedAt: now + 1_000,
        audioKey: 'audio-1b',
      });

      const history = useGenerationStore.getState().generationHistory;
      expect(history).toHaveLength(2);
      expect(history[0]).toMatchObject({
        clipId: 'clip-1',
        model: 'ace-v1.1',
        duration: 20,
        audioKey: 'audio-1b',
      });

      expect(useGenerationStore.getState().getGenerationHistoryRecords({
        model: 'ace-v1.1',
      })).toHaveLength(1);
      expect(useGenerationStore.getState().getGenerationHistoryRecords({
        search: 'breakbeat dusty',
      })[0]?.clipId).toBe('clip-1');
      expect(useGenerationStore.getState().getGenerationHistoryRecords({
        timeRange: '7d',
      })).toHaveLength(1);
    });

    it('places a completed history record back onto the timeline as a ready audio clip', () => {
      useProjectStore.getState().createProject({ name: 'History Reuse' });
      const track = useProjectStore.getState().addTrack('custom', 'stems');
      useGenerationStore.getState().upsertGenerationHistoryRecord({
        clipId: 'source-clip',
        trackId: track.id,
        trackName: 'Lead',
        prompt: 'wide cinematic lead',
        model: 'ace-v1',
        duration: 12,
        status: 'done',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        completedAt: Date.now(),
        audioKey: 'audio-ready',
      });

      const historyId = useGenerationStore.getState().generationHistory[0].id;
      const newClipId = useGenerationStore.getState().placeGenerationHistoryOnTrack(historyId, track.id, 24);
      const clip = newClipId ? useProjectStore.getState().getClipById(newClipId) : null;

      expect(clip).toMatchObject({
        startTime: 24,
        duration: 12,
        prompt: 'wide cinematic lead',
        generationStatus: 'ready',
        isolatedAudioKey: 'audio-ready',
        audioDuration: 12,
      });
    });
  });
});
