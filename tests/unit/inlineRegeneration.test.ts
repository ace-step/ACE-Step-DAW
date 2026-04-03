import { beforeEach, describe, expect, it } from 'vitest';
import { useUIStore } from '../../src/store/uiStore';
import { useProjectStore } from '../../src/store/projectStore';
import type { InlineSuggestion } from '../../src/types/suggestions';

describe('inline regeneration and suggestions', () => {
  beforeEach(() => {
    localStorage.clear();
    useUIStore.setState(useUIStore.getInitialState(), true);
    useProjectStore.setState(useProjectStore.getInitialState(), true);
  });

  describe('uiStore — region regeneration target', () => {
    it('sets and clears regionRegenerateTarget', () => {
      const target = {
        startTime: 10,
        endTime: 20,
        trackIds: ['t1', 't2'],
      };
      useUIStore.getState().setRegionRegenerateTarget(target);
      expect(useUIStore.getState().regionRegenerateTarget).toEqual(target);

      useUIStore.getState().setRegionRegenerateTarget(null);
      expect(useUIStore.getState().regionRegenerateTarget).toBeNull();
    });
  });

  describe('uiStore — inline suggestions', () => {
    it('starts with empty inline suggestions', () => {
      expect(useUIStore.getState().inlineSuggestions).toEqual([]);
    });

    it('sets and dismisses inline suggestions', () => {
      const suggestions: InlineSuggestion[] = [
        { id: 's1', text: 'Try adding a hi-hat here', time: 10, trackId: 't1', type: 'fill' },
        { id: 's2', text: 'Energy drop — add a breakdown', time: 30, trackId: 't2', type: 'arrangement' },
      ];
      useUIStore.getState().setInlineSuggestions(suggestions);
      expect(useUIStore.getState().inlineSuggestions).toHaveLength(2);

      useUIStore.getState().dismissInlineSuggestion('s1');
      expect(useUIStore.getState().inlineSuggestions).toHaveLength(1);
      expect(useUIStore.getState().inlineSuggestions[0].id).toBe('s2');
    });

    it('clears all inline suggestions', () => {
      useUIStore.getState().setInlineSuggestions([
        { id: 's1', text: 'suggestion', time: 5, type: 'fill' },
      ]);
      useUIStore.getState().clearInlineSuggestions();
      expect(useUIStore.getState().inlineSuggestions).toEqual([]);
    });

    it('manages suggestion frequency setting', () => {
      expect(useUIStore.getState().suggestionFrequency).toBe('subtle');

      useUIStore.getState().setSuggestionFrequency('off');
      expect(useUIStore.getState().suggestionFrequency).toBe('off');

      useUIStore.getState().setSuggestionFrequency('active');
      expect(useUIStore.getState().suggestionFrequency).toBe('active');
    });
  });

});
