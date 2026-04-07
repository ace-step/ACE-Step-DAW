import { describe, expect, it } from 'vitest';
import type { StemCount, StemSeparationEngine } from '../../types/api';
import { getDefaultEngine, getAvailableEngines, ENGINE_DISPLAY_NAMES, ENGINE_DESCRIPTIONS } from '../stemSeparationEngines';

describe('stem separation engine selection (#737)', () => {
  describe('getDefaultEngine', () => {
    it('returns auto for all stem counts by default', () => {
      expect(getDefaultEngine(2)).toBe('auto');
      expect(getDefaultEngine(4)).toBe('auto');
      expect(getDefaultEngine(6)).toBe('auto');
    });
  });

  describe('getAvailableEngines', () => {
    it('returns all engines for 2-stem (only BS-RoFormer supports 2-stem)', () => {
      const engines = getAvailableEngines(2);
      expect(engines).toContain('auto');
      expect(engines).toContain('bs-roformer');
      expect(engines.length).toBeGreaterThanOrEqual(2);
    });

    it('returns all engines for 4-stem', () => {
      const engines = getAvailableEngines(4);
      expect(engines).toContain('auto');
      expect(engines).toContain('bs-roformer');
      expect(engines).toContain('demucs-v4');
      expect(engines.length).toBeGreaterThanOrEqual(3);
    });

    it('returns 6-stem compatible engines', () => {
      const engines = getAvailableEngines(6);
      expect(engines).toContain('auto');
      expect(engines).toContain('htdemucs-6s');
      expect(engines.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('ENGINE_DISPLAY_NAMES', () => {
    it('has display names for all engines', () => {
      expect(ENGINE_DISPLAY_NAMES['auto']).toBe('Auto');
      expect(ENGINE_DISPLAY_NAMES['bs-roformer']).toBeDefined();
      expect(ENGINE_DISPLAY_NAMES['demucs-v4']).toBeDefined();
      expect(ENGINE_DISPLAY_NAMES['htdemucs-6s']).toBeDefined();
    });

    it('auto includes description of smart routing', () => {
      // Auto should describe its routing behavior
      expect(ENGINE_DESCRIPTIONS['auto']).toContain('best engine');
    });
  });

  describe('engine descriptions include quality/speed tradeoffs', () => {
    it('BS-RoFormer description mentions quality', () => {
      expect(ENGINE_DESCRIPTIONS['bs-roformer']).toContain('quality');
    });

    it('Demucs v4 description mentions speed', () => {
      expect(ENGINE_DESCRIPTIONS['demucs-v4']).toContain('speed');
    });
  });
});
