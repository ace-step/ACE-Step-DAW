import { beforeEach, describe, expect, it } from 'vitest';
import { useUIStore } from '../../src/store/uiStore';
import { useGenerationStore } from '../../src/store/generationStore';
import { useProjectStore } from '../../src/store/projectStore';

describe('Generation Side Panel state', () => {
  beforeEach(() => {
    localStorage.clear();
    useUIStore.setState(useUIStore.getInitialState(), true);
    useGenerationStore.setState(useGenerationStore.getInitialState(), true);
    useProjectStore.setState(useProjectStore.getInitialState(), true);
  });

  it('generation panel is closed by default', () => {
    expect(useUIStore.getState().showGenerationPanel).toBe(false);
  });

  it('toggles generation panel open and closed', () => {
    useUIStore.getState().toggleGenerationPanel();
    expect(useUIStore.getState().showGenerationPanel).toBe(true);

    useUIStore.getState().toggleGenerationPanel();
    expect(useUIStore.getState().showGenerationPanel).toBe(false);
  });

  it('sets generation panel visibility directly', () => {
    useUIStore.getState().setShowGenerationPanel(true);
    expect(useUIStore.getState().showGenerationPanel).toBe(true);

    useUIStore.getState().setShowGenerationPanel(false);
    expect(useUIStore.getState().showGenerationPanel).toBe(false);
  });

  describe('variation session with prompt history', () => {
    it('prompt history reuse works across sessions', () => {
      const gen = useGenerationStore.getState();

      gen.startVariationSession({
        prompt: 'dreamy ambient pad',
        trackId: 't1',
        variationCount: 2,
        bpm: 80,
        keyScale: 'D minor',
        duration: 30,
        guidanceScale: 7.0,
      });

      gen.clearVariationSession();

      gen.startVariationSession({
        prompt: 'upbeat pop melody',
        trackId: 't1',
        variationCount: 3,
        bpm: 120,
        keyScale: 'C major',
        duration: 30,
        guidanceScale: 7.0,
      });

      const history = useGenerationStore.getState().promptHistory;
      expect(history).toHaveLength(2);
      expect(history[0].prompt).toBe('upbeat pop melody');
      expect(history[1].prompt).toBe('dreamy ambient pad');
    });

    it('variation A/B switching updates active index', () => {
      const gen = useGenerationStore.getState();
      gen.startVariationSession({
        prompt: 'test',
        trackId: 't1',
        variationCount: 4,
        bpm: 120,
        keyScale: 'C major',
        duration: 30,
        guidanceScale: 7.0,
      });

      // Simulate variations completing
      gen.updateVariation(0, { status: 'done', clipId: 'c0' });
      gen.updateVariation(1, { status: 'done', clipId: 'c1' });
      gen.updateVariation(2, { status: 'done', clipId: 'c2' });
      gen.updateVariation(3, { status: 'done', clipId: 'c3' });

      // Switch between variations (keyboard 1-4 maps to 0-3)
      gen.setActiveVariation(0);
      expect(useGenerationStore.getState().variationSession!.activeVariationIndex).toBe(0);

      gen.setActiveVariation(2);
      expect(useGenerationStore.getState().variationSession!.activeVariationIndex).toBe(2);
    });

    it('variation ETA is trackable via startedAt timestamp', () => {
      const gen = useGenerationStore.getState();
      gen.startVariationSession({
        prompt: 'test',
        trackId: 't1',
        variationCount: 2,
        bpm: 120,
        keyScale: 'C major',
        duration: 30,
        guidanceScale: 7.0,
      });

      const now = Date.now();
      gen.updateVariation(0, { status: 'generating', startedAt: now });

      const v = useGenerationStore.getState().variationSession!.variations[0];
      expect(v.startedAt).toBe(now);
      expect(v.status).toBe('generating');
    });

    it('stores session params for reference', () => {
      const params = {
        prompt: 'jazz saxophone',
        trackId: 't1',
        variationCount: 3,
        bpm: 95,
        keyScale: 'Bb major',
        duration: 45,
        guidanceScale: 5.0,
        lyrics: '[verse]\nSome lyrics',
      };

      useGenerationStore.getState().startVariationSession(params);

      const session = useGenerationStore.getState().variationSession!;
      expect(session.params.bpm).toBe(95);
      expect(session.params.keyScale).toBe('Bb major');
      expect(session.params.guidanceScale).toBe(5.0);
      expect(session.params.lyrics).toBe('[verse]\nSome lyrics');
    });
  });
});
