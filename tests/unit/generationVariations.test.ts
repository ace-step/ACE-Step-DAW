import { describe, it, expect, beforeEach } from 'vitest';
import { useGenerationStore } from '../../src/store/generationStore';
import { useProjectStore } from '../../src/store/projectStore';

describe('Generation Variation Session', () => {
  beforeEach(() => {
    localStorage.clear();
    useGenerationStore.setState(useGenerationStore.getInitialState(), true);
  });

  describe('startVariationSession', () => {
    it('creates a session with the specified variation count', () => {
      const store = useGenerationStore.getState();
      store.startVariationSession({
        prompt: 'upbeat pop song',
        trackId: 'track-1',
        variationCount: 3,
        bpm: 120,
        keyScale: 'C major',
        duration: 30,
        guidanceScale: 7.0,
      });

      const session = useGenerationStore.getState().variationSession;
      expect(session).not.toBeNull();
      expect(session!.prompt).toBe('upbeat pop song');
      expect(session!.trackId).toBe('track-1');
      expect(session!.variations).toHaveLength(3);
      expect(session!.activeVariationIndex).toBe(0);
      expect(session!.status).toBe('generating');
    });

    it('initializes each variation with pending status', () => {
      useGenerationStore.getState().startVariationSession({
        prompt: 'test prompt',
        trackId: 'track-1',
        variationCount: 4,
        bpm: 120,
        keyScale: 'C major',
        duration: 30,
        guidanceScale: 7.0,
      });

      const session = useGenerationStore.getState().variationSession!;
      session.variations.forEach((v, i) => {
        expect(v.index).toBe(i);
        expect(v.status).toBe('pending');
        expect(v.clipId).toBeNull();
        expect(v.progress).toBe('');
      });
    });

    it('clamps variation count between 1 and 4', () => {
      useGenerationStore.getState().startVariationSession({
        prompt: 'test',
        trackId: 'track-1',
        variationCount: 1,
        bpm: 120,
        keyScale: 'C major',
        duration: 30,
        guidanceScale: 7.0,
      });
      expect(useGenerationStore.getState().variationSession!.variations).toHaveLength(1);

      useGenerationStore.getState().startVariationSession({
        prompt: 'test',
        trackId: 'track-1',
        variationCount: 8,
        bpm: 120,
        keyScale: 'C major',
        duration: 30,
        guidanceScale: 7.0,
      });
      expect(useGenerationStore.getState().variationSession!.variations).toHaveLength(4);
    });

    it('adds prompt to history', () => {
      useGenerationStore.getState().startVariationSession({
        prompt: 'upbeat pop',
        trackId: 'track-1',
        variationCount: 2,
        bpm: 120,
        keyScale: 'C major',
        duration: 30,
        guidanceScale: 7.0,
      });
      const history = useGenerationStore.getState().promptHistory;
      expect(history).toHaveLength(1);
      expect(history[0].prompt).toBe('upbeat pop');
    });
  });

  describe('updateVariation', () => {
    beforeEach(() => {
      useGenerationStore.getState().startVariationSession({
        prompt: 'test',
        trackId: 'track-1',
        variationCount: 3,
        bpm: 120,
        keyScale: 'C major',
        duration: 30,
        guidanceScale: 7.0,
      });
    });

    it('updates a specific variation by index', () => {
      useGenerationStore.getState().updateVariation(1, {
        status: 'generating',
        progress: 'Step 10/50',
      });

      const session = useGenerationStore.getState().variationSession!;
      expect(session.variations[1].status).toBe('generating');
      expect(session.variations[1].progress).toBe('Step 10/50');
      // Others unchanged
      expect(session.variations[0].status).toBe('pending');
      expect(session.variations[2].status).toBe('pending');
    });

    it('can set clipId when done', () => {
      useGenerationStore.getState().updateVariation(0, {
        status: 'done',
        clipId: 'clip-abc',
      });

      const v = useGenerationStore.getState().variationSession!.variations[0];
      expect(v.status).toBe('done');
      expect(v.clipId).toBe('clip-abc');
    });

    it('updates session status to done when all variations are done or error', () => {
      const store = useGenerationStore.getState();
      store.updateVariation(0, { status: 'done', clipId: 'c1' });
      store.updateVariation(1, { status: 'done', clipId: 'c2' });
      store.updateVariation(2, { status: 'error', error: 'failed' });

      expect(useGenerationStore.getState().variationSession!.status).toBe('done');
    });

    it('preserves per-variation metadata needed for retrying or accepting a result', () => {
      useGenerationStore.getState().updateVariation(1, {
        status: 'done',
        clipId: 'clip-variation-2',
        jobId: 'job-2',
        taskId: 'task-2',
        resultAudioPath: '/v1/audio?path=variation-2.wav',
        seed: '456',
      });

      expect(useGenerationStore.getState().variationSession!.variations[1]).toMatchObject({
        status: 'done',
        clipId: 'clip-variation-2',
        jobId: 'job-2',
        taskId: 'task-2',
        resultAudioPath: '/v1/audio?path=variation-2.wav',
        seed: '456',
      });
    });
  });

  describe('setActiveVariation', () => {
    beforeEach(() => {
      useGenerationStore.getState().startVariationSession({
        prompt: 'test',
        trackId: 'track-1',
        variationCount: 4,
        bpm: 120,
        keyScale: 'C major',
        duration: 30,
        guidanceScale: 7.0,
      });
    });

    it('sets the active variation index', () => {
      useGenerationStore.getState().setActiveVariation(2);
      expect(useGenerationStore.getState().variationSession!.activeVariationIndex).toBe(2);
    });

    it('clamps to valid range', () => {
      useGenerationStore.getState().setActiveVariation(10);
      expect(useGenerationStore.getState().variationSession!.activeVariationIndex).toBe(3);

      useGenerationStore.getState().setActiveVariation(-1);
      expect(useGenerationStore.getState().variationSession!.activeVariationIndex).toBe(0);
    });
  });

  describe('clearVariationSession', () => {
    it('clears the session', () => {
      useGenerationStore.getState().startVariationSession({
        prompt: 'test',
        trackId: 'track-1',
        variationCount: 2,
        bpm: 120,
        keyScale: 'C major',
        duration: 30,
        guidanceScale: 7.0,
      });

      useGenerationStore.getState().clearVariationSession();
      expect(useGenerationStore.getState().variationSession).toBeNull();
    });
  });

  describe('setActiveVariation with clip muting', () => {
    beforeEach(() => {
      // Set up project store with a track containing variation clips
      useProjectStore.setState(useProjectStore.getInitialState(), true);
      const projStore = useProjectStore.getState();
      projStore.createProject('Test Project');
      projStore.addTrack('stems');
      const track = useProjectStore.getState().project!.tracks[0];

      // Start a variation session targeting this track
      useGenerationStore.getState().startVariationSession({
        prompt: 'test',
        trackId: track.id,
        variationCount: 3,
        bpm: 120,
        keyScale: 'C major',
        duration: 30,
        guidanceScale: 7.0,
      });

      // Add 3 clips to the track to simulate completed variations
      const clip0 = projStore.addClip(track.id, {
        startTime: 0, duration: 10, prompt: 'var0', lyrics: '',
      });
      const clip1 = projStore.addClip(track.id, {
        startTime: 0, duration: 10, prompt: 'var1', lyrics: '',
      });
      const clip2 = projStore.addClip(track.id, {
        startTime: 0, duration: 10, prompt: 'var2', lyrics: '',
      });

      // Mark variations as done with clip IDs
      useGenerationStore.getState().updateVariation(0, { status: 'done', clipId: clip0.id });
      useGenerationStore.getState().updateVariation(1, { status: 'done', clipId: clip1.id });
      useGenerationStore.getState().updateVariation(2, { status: 'done', clipId: clip2.id });
    });

    it('mutes non-active variation clips and unmutes the active one', () => {
      // Switch to variation 1
      useGenerationStore.getState().setActiveVariation(1);

      const track = useProjectStore.getState().project!.tracks[0];
      const session = useGenerationStore.getState().variationSession!;

      // clip0 (variation 0) should be muted
      const clip0 = track.clips.find(c => c.id === session.variations[0].clipId)!;
      expect(clip0.muted).toBe(true);

      // clip1 (variation 1, active) should NOT be muted
      const clip1 = track.clips.find(c => c.id === session.variations[1].clipId)!;
      expect(clip1.muted).toBeFalsy();

      // clip2 (variation 2) should be muted
      const clip2 = track.clips.find(c => c.id === session.variations[2].clipId)!;
      expect(clip2.muted).toBe(true);
    });

    it('switches muting when changing active variation', () => {
      const projStoreRef = useProjectStore;

      // Start at variation 0, switch to 2
      useGenerationStore.getState().setActiveVariation(2);

      const track = useProjectStore.getState().project!.tracks[0];
      const session = useGenerationStore.getState().variationSession!;

      // Only clip2 should be unmuted
      const clip0 = track.clips.find(c => c.id === session.variations[0].clipId)!;
      const clip1 = track.clips.find(c => c.id === session.variations[1].clipId)!;
      const clip2 = track.clips.find(c => c.id === session.variations[2].clipId)!;

      expect(clip0.muted).toBe(true);
      expect(clip1.muted).toBe(true);
      expect(clip2.muted).toBeFalsy();
    });

    it('does not break when variation has no clipId yet', () => {
      // Reset and create session with pending variations
      useGenerationStore.setState(useGenerationStore.getInitialState(), true);
      useGenerationStore.getState().startVariationSession({
        prompt: 'test',
        trackId: 'track-x',
        variationCount: 2,
        bpm: 120,
        keyScale: 'C major',
        duration: 30,
        guidanceScale: 7.0,
      });

      // Should not throw
      expect(() => useGenerationStore.getState().setActiveVariation(1)).not.toThrow();
      expect(useGenerationStore.getState().variationSession!.activeVariationIndex).toBe(1);
    });
  });

  describe('cancelVariationSession', () => {
    it('marks pending/generating variations as cancelled and session as cancelled', () => {
      useGenerationStore.getState().startVariationSession({
        prompt: 'test',
        trackId: 'track-1',
        variationCount: 3,
        bpm: 120,
        keyScale: 'C major',
        duration: 30,
        guidanceScale: 7.0,
      });
      // Mark first as done
      useGenerationStore.getState().updateVariation(0, { status: 'done', clipId: 'c1' });
      // Cancel the session
      useGenerationStore.getState().cancelVariationSession();

      const session = useGenerationStore.getState().variationSession!;
      expect(session.status).toBe('cancelled');
      expect(session.variations[0].status).toBe('done'); // already done, stays done
      expect(session.variations[1].status).toBe('cancelled');
      expect(session.variations[2].status).toBe('cancelled');
    });
  });

  describe('setActiveVariation (regression #1586)', () => {
    it('skips deleted clips without throwing', () => {
      useProjectStore.setState(useProjectStore.getInitialState(), true);
      useProjectStore.getState().createProject({ name: 'Variation Test' });

      useGenerationStore.getState().startVariationSession({
        prompt: 'test', trackId: 'track-1', variationCount: 2,
        bpm: 120, keyScale: 'C major', duration: 30, guidanceScale: 7.0,
      });

      // Assign clipIds that don't exist in project
      useGenerationStore.getState().updateVariation(0, { clipId: 'nonexistent-clip-0', status: 'done' });
      useGenerationStore.getState().updateVariation(1, { clipId: 'nonexistent-clip-1', status: 'done' });

      // Should not throw even when clips don't exist
      expect(() => useGenerationStore.getState().setActiveVariation(1)).not.toThrow();
      expect(useGenerationStore.getState().variationSession?.activeVariationIndex).toBe(1);
    });
  });
});
