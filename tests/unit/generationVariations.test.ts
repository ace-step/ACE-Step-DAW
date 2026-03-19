import { describe, it, expect, beforeEach } from 'vitest';
import { useGenerationStore } from '../../src/store/generationStore';

describe('Generation Variation Session', () => {
  beforeEach(() => {
    useGenerationStore.setState({
      jobs: [],
      isGenerating: false,
      promptHistory: [],
      variationSession: null,
    });
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

    it('clamps variation count between 2 and 4', () => {
      useGenerationStore.getState().startVariationSession({
        prompt: 'test',
        trackId: 'track-1',
        variationCount: 1,
        bpm: 120,
        keyScale: 'C major',
        duration: 30,
        guidanceScale: 7.0,
      });
      expect(useGenerationStore.getState().variationSession!.variations).toHaveLength(2);

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
});
