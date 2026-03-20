import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useGenerationStore,
  type GenerationJob,
} from '../../src/store/generationStore';
import { computeEta, formatEtaDisplay } from '../../src/utils/generationProgress';

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

describe('generation progress tracking', () => {
  beforeEach(() => {
    localStorage.clear();
    useGenerationStore.setState(useGenerationStore.getInitialState(), true);
  });

  describe('GenerationJob progress fields', () => {
    it('stores stage and progressPercent on a job', () => {
      const job = makeJob({ id: 'j1', startedAt: 1000 });
      useGenerationStore.getState().addJob(job);
      useGenerationStore.getState().updateJob('j1', {
        stage: 'DIT inference',
        progressPercent: 45,
      });

      const updated = useGenerationStore.getState().jobs[0];
      expect(updated.stage).toBe('DIT inference');
      expect(updated.progressPercent).toBe(45);
      expect(updated.startedAt).toBe(1000);
    });

    it('stores etaSeconds on a job via deriveGenerationJobProgress', () => {
      // etaSeconds is derived by deriveGenerationJobProgress during updateJob,
      // so we set up conditions that produce a computable ETA:
      // startedAt far enough in the past + enough progress + 'generating' status.
      const startedAt = Date.now() - 30_000; // 30 seconds ago
      const job = makeJob({ id: 'j1', startedAt });
      useGenerationStore.getState().addJob(job);
      useGenerationStore.getState().updateJob('j1', {
        status: 'generating',
        progress: 'Generating...',
        progressPercent: 50,
      });

      const updated = useGenerationStore.getState().jobs[0];
      // With 30s elapsed and 50% progress, ETA should be ~30s
      expect(updated.etaSeconds).toBeGreaterThanOrEqual(25);
      expect(updated.etaSeconds).toBeLessThanOrEqual(35);
    });

    it('does not allow progress to jump backward', () => {
      const job = makeJob({ id: 'j1', progressPercent: 60 });
      useGenerationStore.getState().addJob(job);

      // Attempt to update with a lower progress value
      useGenerationStore.getState().updateJob('j1', { progressPercent: 40 });

      // Progress should stay at 60 (no backward jump)
      expect(useGenerationStore.getState().jobs[0].progressPercent).toBe(60);
    });
  });

  describe('Variation progress fields', () => {
    it('stores stage and progressPercent on a variation', () => {
      useGenerationStore.getState().startVariationSession({
        prompt: 'test',
        trackId: 'track-1',
        variationCount: 1,
        bpm: 120,
        keyScale: 'C major',
        duration: 30,
        guidanceScale: 0.7,
      });

      useGenerationStore.getState().updateVariation(0, {
        status: 'generating',
        stage: 'LM caption rewrite',
        progressPercent: 20,
        startedAt: Date.now(),
      });

      const variation = useGenerationStore.getState().variationSession!.variations[0];
      expect(variation.stage).toBe('LM caption rewrite');
      expect(variation.progressPercent).toBe(20);
    });

    it('does not allow variation progress to jump backward', () => {
      useGenerationStore.getState().startVariationSession({
        prompt: 'test',
        trackId: 'track-1',
        variationCount: 1,
        bpm: 120,
        keyScale: 'C major',
        duration: 30,
        guidanceScale: 0.7,
      });

      useGenerationStore.getState().updateVariation(0, {
        status: 'generating',
        progressPercent: 70,
      });

      useGenerationStore.getState().updateVariation(0, {
        progressPercent: 50,
      });

      expect(
        useGenerationStore.getState().variationSession!.variations[0].progressPercent,
      ).toBe(70);
    });
  });

  describe('computeEta', () => {
    it('returns null when startedAt is not set', () => {
      expect(computeEta(undefined, undefined)).toBeNull();
    });

    it('returns null when elapsed time is too short for a reliable estimate', () => {
      const now = Date.now();
      // Only 1 second elapsed with 5% progress — too early
      expect(computeEta(now - 1000, 5)).toBeNull();
    });

    it('computes ETA from elapsed time and progress percent', () => {
      const now = Date.now();
      // 30 seconds elapsed, 50% done → ~30s remaining
      const eta = computeEta(now - 30_000, 50);
      expect(eta).toBeGreaterThanOrEqual(25);
      expect(eta).toBeLessThanOrEqual(35);
    });

    it('returns null when progress is 0 (cannot estimate)', () => {
      const now = Date.now();
      expect(computeEta(now - 10_000, 0)).toBeNull();
    });

    it('returns 0 when progress is 100', () => {
      const now = Date.now();
      expect(computeEta(now - 60_000, 100)).toBe(0);
    });
  });

  describe('formatEtaDisplay', () => {
    it('formats null ETA as empty string', () => {
      expect(formatEtaDisplay(null)).toBe('');
    });

    it('formats 0 seconds as "< 5s"', () => {
      expect(formatEtaDisplay(0)).toBe('< 5s');
    });

    it('formats small values as "< 5s"', () => {
      expect(formatEtaDisplay(3)).toBe('< 5s');
    });

    it('formats seconds as "~Ns"', () => {
      expect(formatEtaDisplay(42)).toBe('~42s');
    });

    it('formats minutes for large values', () => {
      expect(formatEtaDisplay(125)).toBe('~2m 5s');
    });
  });
});
