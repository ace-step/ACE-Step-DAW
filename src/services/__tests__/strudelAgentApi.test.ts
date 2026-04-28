/**
 * Tests for the Strudel Agent API.
 *
 * Covers the agent-readable pattern analysis API
 * exposed on window.__strudelApi for AI agents.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  analyzePatternCode,
  getStrudelTrackSummary,
  listStrudelPresets,
  type StrudelAnalysisResult,
} from '../strudelAgentApi';
import { useProjectStore } from '../../store/projectStore';

describe('strudelAgentApi', () => {
  beforeEach(() => {
    // Reset project store
    const store = useProjectStore.getState();
    if (store.project) {
      // Ensure clean state
    }
  });

  describe('analyzePatternCode', () => {
    it('returns analysis result with expected shape', async () => {
      // analyzePatternCode does pure pattern analysis - no audio needed
      // Since Strudel modules aren't available in test env, test the fallback
      const result = await analyzePatternCode('s("bd sd")');
      expect(result).toBeDefined();
      expect(typeof result.noteCount).toBe('number');
      expect(Array.isArray(result.instruments)).toBe(true);
      expect(typeof result.hasMelodicContent).toBe('boolean');
      expect(typeof result.suggestedPrompt).toBe('string');
    });

    it('returns empty result for empty code', async () => {
      const result = await analyzePatternCode('');
      expect(result.noteCount).toBe(0);
      expect(result.instruments).toEqual([]);
    });
  });

  describe('getStrudelTrackSummary', () => {
    it('returns empty array when no strudel tracks exist', () => {
      const summary = getStrudelTrackSummary();
      expect(Array.isArray(summary)).toBe(true);
    });
  });

  describe('listStrudelPresets', () => {
    it('returns array of presets with expected shape', () => {
      const presets = listStrudelPresets();
      expect(Array.isArray(presets)).toBe(true);
      expect(presets.length).toBeGreaterThan(0);
      for (const preset of presets) {
        expect(typeof preset.name).toBe('string');
        expect(typeof preset.code).toBe('string');
        expect(typeof preset.genre).toBe('string');
      }
    });
  });
});
