import { describe, it, expect, beforeEach } from 'vitest';
import {
  useGenerationStore,
  deriveGenerationJobProgress,
  getGenerationValidationError,
  createDefaultGenerationFormState,
  type GenerationJob,
  type GenerationJobProgressInput,
} from '../generationStore';
import { DEFAULT_BPM, DEFAULT_DURATION, DEFAULT_KEY_SCALE, MIN_BPM, MAX_BPM, MIN_DURATION, MAX_DURATION } from '../../constants/defaults';

function resetStore() {
  useGenerationStore.setState({
    jobs: [],
    isGenerating: false,
    promptHistory: [],
    generationHistory: [],
    previewingHistoryId: null,
    variationSession: null,
    generationForm: createDefaultGenerationFormState(),
    lastSubmittedRequest: null,
    stemsFormDraft: null,
  });
}

function makeJob(overrides?: Partial<GenerationJob>): GenerationJob {
  return {
    id: 'job-1',
    clipId: 'clip-1',
    trackName: 'Track 1',
    status: 'queued',
    progress: '',
    ...overrides,
  };
}

describe('generationStore', () => {
  beforeEach(resetStore);

  // ── Pure functions ──────────────────────────────────────────

  describe('deriveGenerationJobProgress', () => {
    it('infers stage label from status', () => {
      const result = deriveGenerationJobProgress(undefined, {
        status: 'generating',
        progress: '',
        now: 1000,
      });
      expect(result.stage).toBe('Generating audio');
    });

    it('parses percent from progress string', () => {
      const result = deriveGenerationJobProgress(undefined, {
        status: 'generating',
        progress: 'Processing 45%',
        now: 1000,
      });
      expect(result.progressPercent).toBe(45);
    });

    it('uses explicit progressPercent over parsed value', () => {
      const result = deriveGenerationJobProgress(undefined, {
        status: 'generating',
        progress: 'Processing 20%',
        progressPercent: 60,
        now: 1000,
      });
      expect(result.progressPercent).toBe(60);
    });

    it('ensures monotonic percent (never decreases)', () => {
      const previous: GenerationJob = makeJob({
        status: 'generating',
        progressPercent: 50,
        startedAt: 0,
      });
      const result = deriveGenerationJobProgress(previous, {
        status: 'generating',
        progress: '',
        progressPercent: 30,
        now: 5000,
      });
      expect(result.progressPercent).toBe(50);
    });

    it('sets progressPercent to 100 when done', () => {
      const result = deriveGenerationJobProgress(undefined, {
        status: 'done',
        progress: 'Complete',
        now: 1000,
      });
      expect(result.progressPercent).toBe(100);
    });

    it('sets etaSeconds to 0 when done', () => {
      const result = deriveGenerationJobProgress(undefined, {
        status: 'done',
        progress: 'Complete',
        now: 1000,
      });
      expect(result.etaSeconds).toBe(0);
      expect(result.etaConfidence).toBe('high');
    });

    it('clears ETA on error', () => {
      const result = deriveGenerationJobProgress(undefined, {
        status: 'error',
        progress: 'Failed',
        error: 'Server error',
        now: 1000,
      });
      expect(result.etaSeconds).toBeNull();
      expect(result.etaConfidence).toBe('none');
    });

    it('computes ETA with high confidence when progress is sufficient', () => {
      const startedAt = 0;
      const result = deriveGenerationJobProgress(
        makeJob({ status: 'generating', progressPercent: 50, startedAt }),
        {
          status: 'generating',
          progress: '',
          progressPercent: 50,
          now: 20_000, // 20s elapsed, 50% done
        },
      );
      expect(result.etaConfidence).toBe('high');
      expect(result.etaSeconds).toBeGreaterThan(0);
    });

    it('preserves startedAt from previous job', () => {
      const result = deriveGenerationJobProgress(
        makeJob({ startedAt: 500 }),
        { status: 'generating', progress: '', now: 5000 },
      );
      expect(result.startedAt).toBe(500);
    });

    it('sets completedAt when status is done', () => {
      const result = deriveGenerationJobProgress(undefined, {
        status: 'done',
        progress: 'Complete',
        now: 5000,
      });
      expect(result.completedAt).toBe(5000);
    });
  });

  describe('getGenerationValidationError', () => {
    it('returns error for empty prompt', () => {
      const error = getGenerationValidationError({
        prompt: '  ',
        selectedTrackId: 't1',
        bpm: 120,
        lengthSeconds: 30,
        temperature: 0.7,
        variationCount: 2,
      });
      expect(error).toContain('prompt');
    });

    it('returns error for missing track', () => {
      const error = getGenerationValidationError({
        prompt: 'upbeat pop song',
        selectedTrackId: '',
        bpm: 120,
        lengthSeconds: 30,
        temperature: 0.7,
        variationCount: 2,
      });
      expect(error).toContain('track');
    });

    it('returns error for BPM out of range', () => {
      expect(getGenerationValidationError({
        prompt: 'song', selectedTrackId: 't1',
        bpm: 5, lengthSeconds: 30, temperature: 0.7, variationCount: 2,
      })).toContain('BPM');
    });

    it('returns error for invalid duration', () => {
      expect(getGenerationValidationError({
        prompt: 'song', selectedTrackId: 't1',
        bpm: 120, lengthSeconds: 5, temperature: 0.7, variationCount: 2,
      })).toContain('length');
    });

    it('returns error for temperature out of range', () => {
      expect(getGenerationValidationError({
        prompt: 'song', selectedTrackId: 't1',
        bpm: 120, lengthSeconds: 30, temperature: 2.0, variationCount: 2,
      })).toContain('temperature');
    });

    it('returns error for invalid variation count', () => {
      expect(getGenerationValidationError({
        prompt: 'song', selectedTrackId: 't1',
        bpm: 120, lengthSeconds: 30, temperature: 0.7, variationCount: 10,
      })).toContain('variation');
    });

    it('returns null for valid input', () => {
      const error = getGenerationValidationError({
        prompt: 'upbeat pop song',
        selectedTrackId: 't1',
        bpm: 120,
        lengthSeconds: 30,
        temperature: 0.7,
        variationCount: 2,
      });
      expect(error).toBeNull();
    });
  });

  describe('createDefaultGenerationFormState', () => {
    it('returns expected defaults', () => {
      const state = createDefaultGenerationFormState();
      expect(state.prompt).toBe('');
      expect(state.negativePrompt).toBe('');
      expect(state.bpm).toBe(DEFAULT_BPM);
      expect(state.keyScale).toBe(DEFAULT_KEY_SCALE);
      expect(state.lengthSeconds).toBe(DEFAULT_DURATION);
      expect(state.variationCount).toBe(2);
      expect(state.styleTags).toEqual([]);
      expect(state.useRandomSeed).toBe(true);
    });
  });

  // ── Job management ──────────────────────────────────────────

  describe('addJob', () => {
    it('adds a job with derived fields', () => {
      useGenerationStore.getState().addJob(makeJob());
      const jobs = useGenerationStore.getState().jobs;
      expect(jobs).toHaveLength(1);
      expect(jobs[0].stage).toBe('Queued');
      expect(jobs[0].startedAt).toBeGreaterThan(0);
    });

    it('adds multiple jobs', () => {
      useGenerationStore.getState().addJob(makeJob({ id: 'j1' }));
      useGenerationStore.getState().addJob(makeJob({ id: 'j2' }));
      expect(useGenerationStore.getState().jobs).toHaveLength(2);
    });
  });

  describe('updateJob', () => {
    it('updates job status and progress', () => {
      useGenerationStore.getState().addJob(makeJob());
      useGenerationStore.getState().updateJob('job-1', {
        status: 'generating',
        progress: 'Generating 25%',
        progressPercent: 25,
      });
      const job = useGenerationStore.getState().jobs[0];
      expect(job.status).toBe('generating');
      expect(job.progressPercent).toBe(25);
    });

    it('prevents progress from going backward', () => {
      useGenerationStore.getState().addJob(makeJob({
        status: 'generating',
        progressPercent: 60,
      }));
      useGenerationStore.getState().updateJob('job-1', {
        status: 'generating',
        progress: '',
        progressPercent: 40,
      });
      const job = useGenerationStore.getState().jobs[0];
      expect(job.progressPercent).toBeGreaterThanOrEqual(60);
    });
  });

  describe('removeJob', () => {
    it('removes a job by id', () => {
      useGenerationStore.getState().addJob(makeJob({ id: 'j1' }));
      useGenerationStore.getState().addJob(makeJob({ id: 'j2' }));
      useGenerationStore.getState().removeJob('j1');
      const ids = useGenerationStore.getState().jobs.map((j) => j.id);
      expect(ids).toEqual(['j2']);
    });
  });

  describe('clearCompletedJobs', () => {
    it('removes done and error jobs', () => {
      useGenerationStore.getState().addJob(makeJob({ id: 'j1', status: 'done' }));
      useGenerationStore.getState().addJob(makeJob({ id: 'j2', status: 'error' }));
      useGenerationStore.getState().addJob(makeJob({ id: 'j3', status: 'generating' }));
      useGenerationStore.getState().clearCompletedJobs();
      const ids = useGenerationStore.getState().jobs.map((j) => j.id);
      expect(ids).toEqual(['j3']);
    });
  });

  // ── Generation lock ─────────────────────────────────────────

  describe('tryAcquireGenerationLock', () => {
    it('acquires on first call', () => {
      expect(useGenerationStore.getState().tryAcquireGenerationLock()).toBe(true);
      expect(useGenerationStore.getState().isGenerating).toBe(true);
    });

    it('rejects on second call', () => {
      useGenerationStore.getState().tryAcquireGenerationLock();
      expect(useGenerationStore.getState().tryAcquireGenerationLock()).toBe(false);
    });

    it('can be re-acquired after release', () => {
      useGenerationStore.getState().tryAcquireGenerationLock();
      useGenerationStore.getState().setIsGenerating(false);
      expect(useGenerationStore.getState().tryAcquireGenerationLock()).toBe(true);
    });
  });

  // ── Prompt history ──────────────────────────────────────────

  describe('prompt history', () => {
    it('adds a prompt to history', () => {
      useGenerationStore.getState().addPromptToHistory('funky bass groove');
      const history = useGenerationStore.getState().promptHistory;
      expect(history).toHaveLength(1);
      expect(history[0].prompt).toBe('funky bass groove');
    });

    it('moves duplicate prompt to top', () => {
      const store = useGenerationStore.getState();
      store.addPromptToHistory('first');
      store.addPromptToHistory('second');
      store.addPromptToHistory('first'); // duplicate
      const history = useGenerationStore.getState().promptHistory;
      expect(history[0].prompt).toBe('first');
      expect(history[1].prompt).toBe('second');
      expect(history).toHaveLength(2);
    });

    it('limits history to 50 entries', () => {
      for (let i = 0; i < 55; i++) {
        useGenerationStore.getState().addPromptToHistory(`prompt-${i}`);
      }
      expect(useGenerationStore.getState().promptHistory).toHaveLength(50);
    });

    it('clearPromptHistory empties the list', () => {
      useGenerationStore.getState().addPromptToHistory('test');
      useGenerationStore.getState().clearPromptHistory();
      expect(useGenerationStore.getState().promptHistory).toEqual([]);
    });
  });

  // ── Generation form ─────────────────────────────────────────

  describe('generation form setters', () => {
    it('setGenerationPrompt updates prompt', () => {
      useGenerationStore.getState().setGenerationPrompt('rock ballad');
      expect(useGenerationStore.getState().generationForm.prompt).toBe('rock ballad');
    });

    it('setGenerationNegativePrompt updates and clears error', () => {
      useGenerationStore.getState().setGenerationRequestError('some error');
      useGenerationStore.getState().setGenerationNegativePrompt('no drums');
      const form = useGenerationStore.getState().generationForm;
      expect(form.negativePrompt).toBe('no drums');
      expect(form.requestError).toBeNull();
    });

    it('setGenerationBpm clamps value', () => {
      useGenerationStore.getState().setGenerationBpm(5);
      expect(useGenerationStore.getState().generationForm.bpm).toBe(MIN_BPM);
      useGenerationStore.getState().setGenerationBpm(999);
      expect(useGenerationStore.getState().generationForm.bpm).toBe(MAX_BPM);
    });

    it('setGenerationLengthSeconds clamps value', () => {
      useGenerationStore.getState().setGenerationLengthSeconds(1);
      expect(useGenerationStore.getState().generationForm.lengthSeconds).toBe(MIN_DURATION);
      useGenerationStore.getState().setGenerationLengthSeconds(9999);
      expect(useGenerationStore.getState().generationForm.lengthSeconds).toBe(MAX_DURATION);
    });

    it('setGenerationTemperature clamps to 0-1', () => {
      useGenerationStore.getState().setGenerationTemperature(-0.5);
      expect(useGenerationStore.getState().generationForm.temperature).toBe(0);
      useGenerationStore.getState().setGenerationTemperature(1.5);
      expect(useGenerationStore.getState().generationForm.temperature).toBe(1);
    });

    it('setGenerationVariationCount clamps to 1-4', () => {
      useGenerationStore.getState().setGenerationVariationCount(0);
      expect(useGenerationStore.getState().generationForm.variationCount).toBe(1);
      useGenerationStore.getState().setGenerationVariationCount(10);
      expect(useGenerationStore.getState().generationForm.variationCount).toBe(4);
    });

    it('setGenerationInferenceSteps clamps to 1-200', () => {
      useGenerationStore.getState().setGenerationInferenceSteps(0);
      expect(useGenerationStore.getState().generationForm.inferenceSteps).toBe(1);
      useGenerationStore.getState().setGenerationInferenceSteps(500);
      expect(useGenerationStore.getState().generationForm.inferenceSteps).toBe(200);
    });

    it('setGenerationGuidanceScale clamps to 0-20', () => {
      useGenerationStore.getState().setGenerationGuidanceScale(-1);
      expect(useGenerationStore.getState().generationForm.guidanceScale).toBe(0);
      useGenerationStore.getState().setGenerationGuidanceScale(25);
      expect(useGenerationStore.getState().generationForm.guidanceScale).toBe(20);
    });

    it('setGenerationShift clamps to 0-10', () => {
      useGenerationStore.getState().setGenerationShift(-1);
      expect(useGenerationStore.getState().generationForm.shift).toBe(0);
      useGenerationStore.getState().setGenerationShift(15);
      expect(useGenerationStore.getState().generationForm.shift).toBe(10);
    });

    it('setGenerationKeyScale sets value', () => {
      useGenerationStore.getState().setGenerationKeyScale('D minor');
      expect(useGenerationStore.getState().generationForm.keyScale).toBe('D minor');
    });

    it('setGenerationTargetTrack sets track id', () => {
      useGenerationStore.getState().setGenerationTargetTrack('t-42');
      expect(useGenerationStore.getState().generationForm.selectedTrackId).toBe('t-42');
    });

    it('setGenerationLyrics sets lyrics', () => {
      useGenerationStore.getState().setGenerationLyrics('la la la');
      expect(useGenerationStore.getState().generationForm.lyrics).toBe('la la la');
    });

    it('setGenerationThinking sets thinking mode', () => {
      useGenerationStore.getState().setGenerationThinking(false);
      expect(useGenerationStore.getState().generationForm.thinking).toBe(false);
    });

    it('setGenerationSeed sets seed', () => {
      useGenerationStore.getState().setGenerationSeed('12345');
      expect(useGenerationStore.getState().generationForm.seed).toBe('12345');
    });

    it('setGenerationUseRandomSeed toggles', () => {
      useGenerationStore.getState().setGenerationUseRandomSeed(false);
      expect(useGenerationStore.getState().generationForm.useRandomSeed).toBe(false);
    });
  });

  describe('style tags', () => {
    it('setGenerationStyleTags normalizes and deduplicates', () => {
      useGenerationStore.getState().setGenerationStyleTags(['Rock', 'rock', 'Pop', '']);
      const tags = useGenerationStore.getState().generationForm.styleTags;
      expect(tags).toEqual(['Rock', 'Pop']);
    });

    it('limits to 6 tags', () => {
      useGenerationStore.getState().setGenerationStyleTags([
        'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h',
      ]);
      expect(useGenerationStore.getState().generationForm.styleTags).toHaveLength(6);
    });

    it('toggleGenerationStyleTag adds a new tag', () => {
      useGenerationStore.getState().toggleGenerationStyleTag('Jazz');
      expect(useGenerationStore.getState().generationForm.styleTags).toContain('Jazz');
    });

    it('toggleGenerationStyleTag removes an existing tag', () => {
      useGenerationStore.getState().setGenerationStyleTags(['Jazz', 'Pop']);
      useGenerationStore.getState().toggleGenerationStyleTag('Jazz');
      const tags = useGenerationStore.getState().generationForm.styleTags;
      expect(tags).not.toContain('Jazz');
      expect(tags).toContain('Pop');
    });

    it('toggleGenerationStyleTag ignores empty tag', () => {
      useGenerationStore.getState().toggleGenerationStyleTag('  ');
      expect(useGenerationStore.getState().generationForm.styleTags).toEqual([]);
    });
  });

  describe('hydrateGenerationForm', () => {
    it('updates multiple form fields at once', () => {
      useGenerationStore.getState().hydrateGenerationForm({
        prompt: 'hydrated prompt',
        bpm: 140,
        lengthSeconds: 60,
      });
      const form = useGenerationStore.getState().generationForm;
      expect(form.prompt).toBe('hydrated prompt');
      expect(form.bpm).toBe(140);
      expect(form.lengthSeconds).toBe(60);
    });

    it('clamps values during hydration', () => {
      useGenerationStore.getState().hydrateGenerationForm({ bpm: 5, lengthSeconds: 2 });
      const form = useGenerationStore.getState().generationForm;
      expect(form.bpm).toBe(MIN_BPM);
      expect(form.lengthSeconds).toBe(MIN_DURATION);
    });
  });

  describe('resetGenerationForm', () => {
    it('resets to defaults', () => {
      useGenerationStore.getState().setGenerationPrompt('test');
      useGenerationStore.getState().setGenerationBpm(200);
      useGenerationStore.getState().resetGenerationForm();
      const form = useGenerationStore.getState().generationForm;
      expect(form.prompt).toBe('');
      expect(form.bpm).toBe(DEFAULT_BPM);
    });
  });

  describe('applyGenerationPreset', () => {
    it('fills form from preset', () => {
      useGenerationStore.getState().applyGenerationPreset({
        id: 'rock-preset',
        name: 'Rock',
        category: 'Rock',
        caption: 'electric guitar driven rock song',
        suggestedBpm: 130,
        suggestedKey: 'E minor',
        lyricsTemplate: 'verse 1...',
      } as any);
      const form = useGenerationStore.getState().generationForm;
      expect(form.prompt).toBe('electric guitar driven rock song');
      expect(form.bpm).toBe(130);
      expect(form.keyScale).toBe('E minor');
      expect(form.presetId).toBe('rock-preset');
      expect(form.styleTags).toContain('Rock');
    });
  });

  // ── Validation ──────────────────────────────────────────────

  describe('getGenerationValidationError (store method)', () => {
    it('returns error when form is in default state', () => {
      const error = useGenerationStore.getState().getGenerationValidationError();
      expect(error).toBeTruthy();
    });

    it('returns null after filling required fields', () => {
      useGenerationStore.getState().setGenerationPrompt('test song');
      useGenerationStore.getState().setGenerationTargetTrack('t1');
      const error = useGenerationStore.getState().getGenerationValidationError();
      expect(error).toBeNull();
    });
  });

  describe('canSubmitGeneration', () => {
    it('returns false when generating', () => {
      useGenerationStore.getState().setGenerationPrompt('test');
      useGenerationStore.getState().setGenerationTargetTrack('t1');
      useGenerationStore.getState().setIsGenerating(true);
      expect(useGenerationStore.getState().canSubmitGeneration()).toBe(false);
    });

    it('returns false with validation errors', () => {
      expect(useGenerationStore.getState().canSubmitGeneration()).toBe(false);
    });

    it('returns true when valid and not generating', () => {
      useGenerationStore.getState().setGenerationPrompt('test');
      useGenerationStore.getState().setGenerationTargetTrack('t1');
      expect(useGenerationStore.getState().canSubmitGeneration()).toBe(true);
    });
  });

  // ── Variation session ───────────────────────────────────────

  describe('variation session', () => {
    it('startVariationSession creates session with pending variations', () => {
      useGenerationStore.getState().startVariationSession({
        prompt: 'funky bass',
        trackId: 't1',
        variationCount: 3,
        bpm: 120,
        keyScale: 'C major',
        duration: 30,
        guidanceScale: 7,
      });
      const session = useGenerationStore.getState().variationSession!;
      expect(session.prompt).toBe('funky bass');
      expect(session.variations).toHaveLength(3);
      expect(session.status).toBe('generating');
      for (const v of session.variations) {
        expect(v.status).toBe('pending');
      }
    });

    it('startVariationSession adds prompt to history', () => {
      useGenerationStore.getState().startVariationSession({
        prompt: 'bass line',
        trackId: 't1',
        variationCount: 2,
        bpm: 120,
        keyScale: 'C major',
        duration: 30,
        guidanceScale: 7,
      });
      const history = useGenerationStore.getState().promptHistory;
      expect(history.some((h) => h.prompt === 'bass line')).toBe(true);
    });

    it('updateVariation updates a specific variation', () => {
      useGenerationStore.getState().startVariationSession({
        prompt: 'test',
        trackId: 't1',
        variationCount: 2,
        bpm: 120,
        keyScale: 'C major',
        duration: 30,
        guidanceScale: 7,
      });
      useGenerationStore.getState().updateVariation(0, {
        status: 'generating',
        progress: 'Working...',
      });
      const v = useGenerationStore.getState().variationSession!.variations[0];
      expect(v.status).toBe('generating');
    });

    it('updateVariation prevents progress percent from decreasing', () => {
      useGenerationStore.getState().startVariationSession({
        prompt: 'test', trackId: 't1', variationCount: 1,
        bpm: 120, keyScale: 'C major', duration: 30, guidanceScale: 7,
      });
      useGenerationStore.getState().updateVariation(0, {
        status: 'generating',
        progressPercent: 50,
      });
      useGenerationStore.getState().updateVariation(0, {
        status: 'generating',
        progressPercent: 30,
      });
      const v = useGenerationStore.getState().variationSession!.variations[0];
      expect(v.progressPercent).toBe(50);
    });

    it('session becomes done when all variations are terminal', () => {
      useGenerationStore.getState().startVariationSession({
        prompt: 'test', trackId: 't1', variationCount: 2,
        bpm: 120, keyScale: 'C major', duration: 30, guidanceScale: 7,
      });
      useGenerationStore.getState().updateVariation(0, { status: 'done' });
      useGenerationStore.getState().updateVariation(1, { status: 'error' });
      expect(useGenerationStore.getState().variationSession!.status).toBe('done');
    });

    it('setActiveVariation clamps index', () => {
      useGenerationStore.getState().startVariationSession({
        prompt: 'test', trackId: 't1', variationCount: 3,
        bpm: 120, keyScale: 'C major', duration: 30, guidanceScale: 7,
      });
      useGenerationStore.getState().setActiveVariation(10);
      expect(useGenerationStore.getState().variationSession!.activeVariationIndex).toBe(2);
      useGenerationStore.getState().setActiveVariation(-5);
      expect(useGenerationStore.getState().variationSession!.activeVariationIndex).toBe(0);
    });

    it('setActiveVariation skips deleted clips without throwing', () => {
      useGenerationStore.getState().startVariationSession({
        prompt: 'test', trackId: 't1', variationCount: 2,
        bpm: 120, keyScale: 'C major', duration: 30, guidanceScale: 7,
      });
      // Assign clipIds to variations — these clips won't exist in projectStore
      useGenerationStore.getState().updateVariation(0, { clipId: 'deleted-clip-1', status: 'done' });
      useGenerationStore.getState().updateVariation(1, { clipId: 'deleted-clip-2', status: 'done' });

      // Should not throw even though the clips don't exist in the project
      expect(() => useGenerationStore.getState().setActiveVariation(1)).not.toThrow();
      expect(useGenerationStore.getState().variationSession!.activeVariationIndex).toBe(1);
    });

    it('cancelVariationSession marks active variations as cancelled', () => {
      useGenerationStore.getState().startVariationSession({
        prompt: 'test', trackId: 't1', variationCount: 3,
        bpm: 120, keyScale: 'C major', duration: 30, guidanceScale: 7,
      });
      useGenerationStore.getState().updateVariation(0, { status: 'done' });
      useGenerationStore.getState().cancelVariationSession();
      const session = useGenerationStore.getState().variationSession!;
      expect(session.status).toBe('cancelled');
      expect(session.variations[0].status).toBe('done'); // already done
      expect(session.variations[1].status).toBe('cancelled');
      expect(session.variations[2].status).toBe('cancelled');
    });

    it('clearVariationSession sets session to null', () => {
      useGenerationStore.getState().startVariationSession({
        prompt: 'test', trackId: 't1', variationCount: 1,
        bpm: 120, keyScale: 'C major', duration: 30, guidanceScale: 7,
      });
      useGenerationStore.getState().clearVariationSession();
      expect(useGenerationStore.getState().variationSession).toBeNull();
    });
  });

  // ── Generation history ──────────────────────────────────────

  describe('generation history', () => {
    it('upsertGenerationHistoryRecord creates a new record', () => {
      const id = useGenerationStore.getState().upsertGenerationHistoryRecord({
        clipId: 'c1',
        trackId: 't1',
        trackName: 'Track 1',
        prompt: 'test prompt',
        model: 'ace-step-1.5',
        duration: 30,
        status: 'generating',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      expect(typeof id).toBe('string');
      expect(useGenerationStore.getState().generationHistory).toHaveLength(1);
    });

    it('upsert updates existing record by clipId', () => {
      useGenerationStore.getState().upsertGenerationHistoryRecord({
        clipId: 'c1', trackId: 't1', trackName: 'Track 1',
        prompt: 'test', model: 'm1', duration: 30,
        status: 'generating', createdAt: 1000, updatedAt: 1000,
      });
      useGenerationStore.getState().upsertGenerationHistoryRecord({
        clipId: 'c1', trackId: 't1', trackName: 'Track 1',
        prompt: 'test', model: 'm1', duration: 30,
        status: 'done', createdAt: 2000, updatedAt: 2000,
      });
      const records = useGenerationStore.getState().generationHistory;
      expect(records).toHaveLength(1);
      expect(records[0].status).toBe('done');
      expect(records[0].createdAt).toBe(1000); // preserves original createdAt
    });

    it('getGenerationHistoryRecords filters by model', () => {
      useGenerationStore.getState().upsertGenerationHistoryRecord({
        clipId: 'c1', trackId: 't1', trackName: 'T1',
        prompt: 'a', model: 'ace', duration: 30,
        status: 'done', createdAt: 1000, updatedAt: 1000,
      });
      useGenerationStore.getState().upsertGenerationHistoryRecord({
        clipId: 'c2', trackId: 't1', trackName: 'T1',
        prompt: 'b', model: 'other', duration: 30,
        status: 'done', createdAt: 2000, updatedAt: 2000,
      });
      const aceRecords = useGenerationStore.getState().getGenerationHistoryRecords({ model: 'ace' });
      expect(aceRecords).toHaveLength(1);
      expect(aceRecords[0].prompt).toBe('a');
    });

    it('getGenerationHistoryRecords filters by search', () => {
      useGenerationStore.getState().upsertGenerationHistoryRecord({
        clipId: 'c1', trackId: 't1', trackName: 'T1',
        prompt: 'funky bass groove', model: 'm1', duration: 30,
        status: 'done', createdAt: 1000, updatedAt: 1000,
      });
      useGenerationStore.getState().upsertGenerationHistoryRecord({
        clipId: 'c2', trackId: 't1', trackName: 'T1',
        prompt: 'ambient pad', model: 'm1', duration: 30,
        status: 'done', createdAt: 2000, updatedAt: 2000,
      });
      const results = useGenerationStore.getState().getGenerationHistoryRecords({ search: 'bass' });
      expect(results).toHaveLength(1);
      expect(results[0].prompt).toContain('bass');
    });
  });

  // ── Stems form draft ────────────────────────────────────────

  describe('stems form draft', () => {
    it('setStemsFormDraft stores the draft', () => {
      const draft = {
        globalCaption: 'pop song',
        rows: [],
        sharedSeed: 42,
        audioDuration: 30,
        durationAuto: true,
        useRandomSeed: true,
      };
      useGenerationStore.getState().setStemsFormDraft(draft);
      expect(useGenerationStore.getState().stemsFormDraft).toEqual(draft);
    });

    it('clearStemsFormDraft sets to null', () => {
      useGenerationStore.getState().setStemsFormDraft({
        globalCaption: '', rows: [], sharedSeed: 0,
        audioDuration: 30, durationAuto: true, useRandomSeed: true,
      });
      useGenerationStore.getState().clearStemsFormDraft();
      expect(useGenerationStore.getState().stemsFormDraft).toBeNull();
    });
  });

  // ── Compare models ──────────────────────────────────────────

  describe('compare models', () => {
    it('setCompareModelsEnabled toggles the flag', () => {
      useGenerationStore.getState().setCompareModelsEnabled(true);
      expect(useGenerationStore.getState().generationForm.compareModelsEnabled).toBe(true);
    });

    it('setCompareModelOverrides sets overrides', () => {
      const overrides = [{ modelName: 'model-a' }, { modelName: 'model-b', inferenceSteps: 100 }];
      useGenerationStore.getState().setCompareModelOverrides(overrides);
      expect(useGenerationStore.getState().generationForm.compareModelOverrides).toEqual(overrides);
    });
  });
});
