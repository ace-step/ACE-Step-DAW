import { describe, it, expect } from 'vitest';
import {
  ENGINE_DISPLAY_NAMES,
  ENGINE_DESCRIPTIONS,
  getDefaultEngine,
  getAvailableEngines,
} from '../stemSeparationEngines';

describe('stemSeparationEngines', () => {
  describe('ENGINE_DISPLAY_NAMES', () => {
    it('has display names for all engines', () => {
      expect(ENGINE_DISPLAY_NAMES['auto']).toBe('Auto');
      expect(ENGINE_DISPLAY_NAMES['bs-roformer']).toBe('BS-RoFormer');
      expect(ENGINE_DISPLAY_NAMES['demucs-v4']).toBe('Demucs v4');
      expect(ENGINE_DISPLAY_NAMES['htdemucs-6s']).toBe('HTDemucs 6-stem');
    });
  });

  describe('ENGINE_DESCRIPTIONS', () => {
    it('has descriptions for all engines', () => {
      expect(ENGINE_DESCRIPTIONS['auto']).toContain('Automatically');
      expect(ENGINE_DESCRIPTIONS['bs-roformer']).toContain('quality');
      expect(ENGINE_DESCRIPTIONS['demucs-v4']).toContain('hybrid');
      expect(ENGINE_DESCRIPTIONS['htdemucs-6s']).toContain('6 stems');
    });
  });

  describe('getDefaultEngine', () => {
    it('always returns auto regardless of stem count', () => {
      expect(getDefaultEngine(2)).toBe('auto');
      expect(getDefaultEngine(4)).toBe('auto');
      expect(getDefaultEngine(6)).toBe('auto');
    });
  });

  describe('getAvailableEngines', () => {
    it('returns auto and bs-roformer for 2-stem', () => {
      const engines = getAvailableEngines(2);
      expect(engines).toEqual(['auto', 'bs-roformer']);
    });

    it('returns auto, bs-roformer, and demucs-v4 for 4-stem', () => {
      const engines = getAvailableEngines(4);
      expect(engines).toEqual(['auto', 'bs-roformer', 'demucs-v4']);
    });

    it('returns auto and htdemucs-6s for 6-stem', () => {
      const engines = getAvailableEngines(6);
      expect(engines).toEqual(['auto', 'htdemucs-6s']);
    });

    it('always includes auto as first option', () => {
      for (const count of [2, 4, 6] as const) {
        const engines = getAvailableEngines(count);
        expect(engines[0]).toBe('auto');
      }
    });

    it('4-stem has more engine options than 2-stem', () => {
      expect(getAvailableEngines(4).length).toBeGreaterThan(getAvailableEngines(2).length);
    });
  });
});
