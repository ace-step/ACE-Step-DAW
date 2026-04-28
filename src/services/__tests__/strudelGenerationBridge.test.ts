/**
 * Tests for the Strudel → AI Generation bridge.
 *
 * Covers:
 * - Pattern analysis → prompt generation
 * - Pattern info extraction for generation params
 * - Bridge function orchestration
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildPromptFromPatternInfo,
  buildGenerationParamsFromPattern,
} from '../strudelGenerationBridge';
import type { StrudelPatternInfo } from '../../engine/strudelEngine';

describe('strudelGenerationBridge', () => {
  describe('buildPromptFromPatternInfo', () => {
    it('generates prompt with instruments for percussion patterns', () => {
      const info: StrudelPatternInfo = {
        noteCount: 8,
        pitchRange: [0, 0],
        instruments: ['bd', 'sd', 'hh', 'oh'],
        cycleLengthBars: 1,
        rhythmicDensity: 2,
        hasMelodicContent: false,
      };
      const prompt = buildPromptFromPatternInfo(info);
      expect(prompt).toContain('bd');
      expect(prompt).toContain('sd');
      expect(prompt).toContain('percussion');
    });

    it('generates prompt mentioning melodic content when present', () => {
      const info: StrudelPatternInfo = {
        noteCount: 16,
        pitchRange: [48, 72],
        instruments: ['piano'],
        cycleLengthBars: 2,
        rhythmicDensity: 4,
        hasMelodicContent: true,
      };
      const prompt = buildPromptFromPatternInfo(info);
      expect(prompt).toContain('melodic');
      expect(prompt).toContain('piano');
    });

    it('handles empty pattern info gracefully', () => {
      const info: StrudelPatternInfo = {
        noteCount: 0,
        pitchRange: [0, 0],
        instruments: [],
        cycleLengthBars: 1,
        rhythmicDensity: 0,
        hasMelodicContent: false,
      };
      const prompt = buildPromptFromPatternInfo(info);
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
    });

    it('includes user prompt when provided', () => {
      const info: StrudelPatternInfo = {
        noteCount: 4,
        pitchRange: [0, 0],
        instruments: ['bd'],
        cycleLengthBars: 1,
        rhythmicDensity: 1,
        hasMelodicContent: false,
      };
      const prompt = buildPromptFromPatternInfo(info, 'dark techno kick');
      expect(prompt).toContain('dark techno kick');
    });
  });

  describe('buildGenerationParamsFromPattern', () => {
    it('calculates duration from bars and BPM', () => {
      const params = buildGenerationParamsFromPattern({
        bars: 4,
        bpm: 120,
        beatsPerBar: 4,
      });
      expect(params.lengthSeconds).toBe(8); // 4 bars * 4 beats * 60/120 = 8s
    });

    it('calculates duration with different time signatures', () => {
      const params = buildGenerationParamsFromPattern({
        bars: 4,
        bpm: 120,
        beatsPerBar: 3,
      });
      expect(params.lengthSeconds).toBe(6); // 4 bars * 3 beats * 60/120 = 6s
    });

    it('uses provided BPM', () => {
      const params = buildGenerationParamsFromPattern({
        bars: 4,
        bpm: 140,
        beatsPerBar: 4,
      });
      expect(params.bpm).toBe(140);
    });

    it('caps duration at reasonable maximum', () => {
      const params = buildGenerationParamsFromPattern({
        bars: 64,
        bpm: 60,
        beatsPerBar: 4,
      });
      // 64 bars * 4 beats * 60/60 = 256s → should cap at 240s (4 minutes)
      expect(params.lengthSeconds).toBeLessThanOrEqual(240);
    });
  });
});
