import { describe, it, expect, beforeEach } from 'vitest';
import { useChordSuggestionStore } from '../chordSuggestionStore';

describe('chordSuggestionStore', () => {
  beforeEach(() => {
    useChordSuggestionStore.setState({
      progression: [],
      suggestions: [],
      status: 'idle',
      error: null,
      modelVariant: 'transformer-s',
      styleCondition: { genres: {}, decades: {} },
      topK: 8,
      panelOpen: false,
    });
  });

  describe('progression management', () => {
    it('adds a chord to progression', () => {
      useChordSuggestionStore.getState().addChord(0);
      expect(useChordSuggestionStore.getState().progression).toEqual([0]);
    });

    it('appends multiple chords in order', () => {
      const store = useChordSuggestionStore.getState();
      store.addChord(0);
      store.addChord(20);
      store.addChord(40);
      expect(useChordSuggestionStore.getState().progression).toEqual([0, 20, 40]);
    });

    it('removes the last chord', () => {
      const store = useChordSuggestionStore.getState();
      store.addChord(0);
      store.addChord(20);
      store.removeLastChord();
      expect(useChordSuggestionStore.getState().progression).toEqual([0]);
    });

    it('clears suggestions when progression becomes empty', () => {
      const store = useChordSuggestionStore.getState();
      store.addChord(0);
      store.setSuggestions([{ tokenIndex: 1, probability: 0.5 }]);
      store.removeLastChord();
      expect(useChordSuggestionStore.getState().suggestions).toEqual([]);
    });

    it('clears entire progression', () => {
      const store = useChordSuggestionStore.getState();
      store.addChord(0);
      store.addChord(20);
      store.clearProgression();
      const state = useChordSuggestionStore.getState();
      expect(state.progression).toEqual([]);
      expect(state.suggestions).toEqual([]);
    });

    it('sets progression from array', () => {
      useChordSuggestionStore.getState().setProgression([0, 1, 2]);
      expect(useChordSuggestionStore.getState().progression).toEqual([0, 1, 2]);
    });
  });

  describe('suggestions', () => {
    it('converts raw predictions to ChordSuggestion objects', () => {
      useChordSuggestionStore.getState().setSuggestions([
        { tokenIndex: 0, probability: 0.8 },  // C major
        { tokenIndex: 1, probability: 0.15 },  // Cm
      ]);
      const { suggestions, status } = useChordSuggestionStore.getState();
      expect(suggestions).toHaveLength(2);
      expect(suggestions[0].token.label).toBe('C');
      expect(suggestions[0].probability).toBe(0.8);
      expect(suggestions[1].token.label).toBe('Cm');
      expect(status).toBe('ready');
    });

    it('filters out invalid token indices', () => {
      useChordSuggestionStore.getState().setSuggestions([
        { tokenIndex: 0, probability: 0.5 },
        { tokenIndex: 99999, probability: 0.3 },
      ]);
      expect(useChordSuggestionStore.getState().suggestions).toHaveLength(1);
    });
  });

  describe('status management', () => {
    it('sets status', () => {
      useChordSuggestionStore.getState().setStatus('loading-model');
      expect(useChordSuggestionStore.getState().status).toBe('loading-model');
    });

    it('sets error with status', () => {
      useChordSuggestionStore.getState().setError('Model failed to load');
      const state = useChordSuggestionStore.getState();
      expect(state.status).toBe('error');
      expect(state.error).toBe('Model failed to load');
    });
  });

  describe('style conditioning', () => {
    it('sets genre weight', () => {
      useChordSuggestionStore.getState().setGenreWeight('Jazz', 0.8);
      expect(useChordSuggestionStore.getState().styleCondition.genres).toEqual({ Jazz: 0.8 });
    });

    it('sets decade weight', () => {
      useChordSuggestionStore.getState().setDecadeWeight('1980', 1.0);
      expect(useChordSuggestionStore.getState().styleCondition.decades).toEqual({ '1980': 1.0 });
    });

    it('clears style condition', () => {
      const store = useChordSuggestionStore.getState();
      store.setGenreWeight('Rock', 0.5);
      store.setDecadeWeight('2000', 0.7);
      store.clearStyleCondition();
      const state = useChordSuggestionStore.getState();
      expect(state.styleCondition.genres).toEqual({});
      expect(state.styleCondition.decades).toEqual({});
    });
  });

  describe('model variant', () => {
    it('changes model variant', () => {
      useChordSuggestionStore.getState().setModelVariant('conditional-s');
      expect(useChordSuggestionStore.getState().modelVariant).toBe('conditional-s');
    });
  });

  describe('topK', () => {
    it('sets topK within bounds', () => {
      useChordSuggestionStore.getState().setTopK(12);
      expect(useChordSuggestionStore.getState().topK).toBe(12);
    });

    it('clamps topK to minimum 1', () => {
      useChordSuggestionStore.getState().setTopK(0);
      expect(useChordSuggestionStore.getState().topK).toBe(1);
    });

    it('clamps topK to maximum 20', () => {
      useChordSuggestionStore.getState().setTopK(50);
      expect(useChordSuggestionStore.getState().topK).toBe(20);
    });
  });

  describe('panel visibility', () => {
    it('toggles panel', () => {
      useChordSuggestionStore.getState().togglePanel();
      expect(useChordSuggestionStore.getState().panelOpen).toBe(true);
      useChordSuggestionStore.getState().togglePanel();
      expect(useChordSuggestionStore.getState().panelOpen).toBe(false);
    });

    it('sets panel open explicitly', () => {
      useChordSuggestionStore.getState().setPanelOpen(true);
      expect(useChordSuggestionStore.getState().panelOpen).toBe(true);
    });
  });
});
