import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getPreviewPhrase, canPreview, playPresetPreview } from '../../src/engine/presetPreview';
import type { InstrumentPreset } from '../../src/data/instrumentPresets';

describe('presetPreview', () => {
  describe('getPreviewPhrase', () => {
    it('returns phrase for known categories', () => {
      const bass = getPreviewPhrase('Bass');
      expect(bass.length).toBeGreaterThanOrEqual(1);
      for (const note of bass) {
        expect(note.pitch).toBeGreaterThanOrEqual(21);
        expect(note.pitch).toBeLessThanOrEqual(108);
        expect(note.duration).toBeGreaterThan(0);
        expect(note.velocity).toBeGreaterThan(0);
        expect(note.delay).toBeGreaterThanOrEqual(0);
      }
    });

    it('returns default phrase for unknown categories', () => {
      const phrase = getPreviewPhrase('SomeUnknownCategory');
      expect(phrase.length).toBeGreaterThanOrEqual(1);
    });

    it('pad phrases have longer durations', () => {
      const pad = getPreviewPhrase('Pad');
      for (const note of pad) {
        expect(note.duration).toBeGreaterThanOrEqual(0.5);
      }
    });

    it('pluck phrases have short durations', () => {
      const pluck = getPreviewPhrase('Pluck');
      for (const note of pluck) {
        expect(note.duration).toBeLessThanOrEqual(0.5);
      }
    });
  });

  describe('canPreview', () => {
    it('returns true for subtractive presets', () => {
      const preset = {
        id: 'test',
        name: 'Test',
        category: 'Bass' as const,
        instrumentKind: 'subtractive' as const,
        isFactory: true,
        instrument: {
          kind: 'subtractive' as const,
          settings: {} as never,
        },
      } as InstrumentPreset;
      expect(canPreview(preset)).toBe(true);
    });

    it('returns false for FM presets', () => {
      const preset = {
        id: 'test-fm',
        name: 'Test FM',
        category: 'Bell' as const,
        instrumentKind: 'fm' as const,
        isFactory: true,
        instrument: {
          kind: 'fm' as const,
          settings: {} as never,
        },
      } as InstrumentPreset;
      expect(canPreview(preset)).toBe(false);
    });
  });

  describe('playPresetPreview', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('calls previewFn for each note in the phrase', async () => {
      const previewFn = vi.fn().mockResolvedValue(undefined);
      const preset = {
        id: 'test-bass',
        name: 'Test Bass',
        category: 'Bass' as const,
        instrumentKind: 'subtractive' as const,
        isFactory: true,
        instrument: {
          kind: 'subtractive' as const,
          settings: { oscillator: {} } as never,
        },
      } as InstrumentPreset;

      await playPresetPreview(preset, previewFn);

      // Advance timers enough for all notes
      await vi.advanceTimersByTimeAsync(2000);

      const phrase = getPreviewPhrase('Bass');
      expect(previewFn).toHaveBeenCalledTimes(phrase.length);
    });

    it('cancel function stops future notes', async () => {
      const previewFn = vi.fn().mockResolvedValue(undefined);
      const preset = {
        id: 'test-lead',
        name: 'Test Lead',
        category: 'Lead' as const,
        instrumentKind: 'subtractive' as const,
        isFactory: true,
        instrument: {
          kind: 'subtractive' as const,
          settings: { oscillator: {} } as never,
        },
      } as InstrumentPreset;

      const cancel = await playPresetPreview(preset, previewFn);

      // Let first note play
      await vi.advanceTimersByTimeAsync(50);
      const callsAfterFirst = previewFn.mock.calls.length;
      expect(callsAfterFirst).toBeGreaterThanOrEqual(1);

      // Cancel before remaining notes
      cancel();
      await vi.advanceTimersByTimeAsync(3000);

      // No additional calls after cancel
      expect(previewFn.mock.calls.length).toBe(callsAfterFirst);
    });
  });
});
