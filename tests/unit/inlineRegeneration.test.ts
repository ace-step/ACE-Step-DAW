import { beforeEach, describe, expect, it } from 'vitest';
import { useUIStore } from '../../src/store/uiStore';
import { useProjectStore } from '../../src/store/projectStore';
import { buildAssistantContext } from '../../src/utils/aiAssistantContext';
import { getArrangementSuggestions } from '../../src/services/aiAssistantService';
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

  describe('arrangement suggestions', () => {
    it('returns empty array when no project exists', () => {
      const context = buildAssistantContext(null, {});
      expect(getArrangementSuggestions(context)).toEqual([]);
    });

    it('suggests fills for empty regions when tracks exist', () => {
      useProjectStore.getState().createProject({ name: 'Test', bpm: 120 });
      useProjectStore.getState().addTrack('drums');
      useProjectStore.getState().addTrack('bass');

      const project = useProjectStore.getState().project;
      const context = buildAssistantContext(project, {});
      const suggestions = getArrangementSuggestions(context, project);

      expect(suggestions.length).toBeGreaterThan(0);
      // All suggestions should have required fields
      for (const s of suggestions) {
        expect(s.id.length).toBeGreaterThan(0);
        expect(s.text.length).toBeGreaterThan(0);
        expect(typeof s.time).toBe('number');
        expect(s.type).toMatch(/^(fill|arrangement|variation|next)$/);
      }
    });

    it('suggests "what comes next" at the end of the arrangement', () => {
      useProjectStore.getState().createProject({ name: 'Test', bpm: 120 });
      const track = useProjectStore.getState().addTrack('drums');
      useProjectStore.getState().addClip(track.id, {
        startTime: 0,
        duration: 30,
        prompt: 'energetic drums',
      });

      const project = useProjectStore.getState().project;
      const context = buildAssistantContext(project, {});
      const suggestions = getArrangementSuggestions(context, project);

      const nextSuggestion = suggestions.find((s) => s.type === 'next');
      expect(nextSuggestion).not.toBeUndefined();
      expect(nextSuggestion!.time).toBeGreaterThanOrEqual(30);
    });
  });
});
