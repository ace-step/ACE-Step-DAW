import { describe, it, expect } from 'vitest';
import { LOOP_DEFINITIONS, type LoopCategory } from '../LoopLibrary';

describe('LoopLibrary', () => {
  describe('LOOP_DEFINITIONS', () => {
    it('should have at least one loop per category including FX and Vocals', () => {
      const expectedCategories: LoopCategory[] = [
        'Drums',
        'Bass',
        'Keys',
        'Synth',
        'FX',
        'Vocals',
      ];
      for (const cat of expectedCategories) {
        const loopsInCategory = LOOP_DEFINITIONS.filter(
          (d) => d.category === cat
        );
        expect(
          loopsInCategory.length,
          `Expected at least one loop in category "${cat}"`
        ).toBeGreaterThanOrEqual(1);
      }
    });

    it('should have unique IDs across all loops', () => {
      const ids = LOOP_DEFINITIONS.map((d) => d.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('should have unique names across all loops', () => {
      const names = LOOP_DEFINITIONS.map((d) => d.name);
      expect(new Set(names).size).toBe(names.length);
    });

    it('each loop should have a positive bpm and bars count', () => {
      for (const def of LOOP_DEFINITIONS) {
        expect(def.bpm).toBeGreaterThan(0);
        expect(def.bars).toBeGreaterThan(0);
      }
    });

    it('each loop should have a generate function', () => {
      for (const def of LOOP_DEFINITIONS) {
        expect(typeof def.generate).toBe('function');
      }
    });

    it('FX loops should include at least a riser and impact', () => {
      const fxLoops = LOOP_DEFINITIONS.filter((d) => d.category === 'FX');
      const names = fxLoops.map((d) => d.name.toLowerCase());
      expect(names.some((n) => n.includes('riser'))).toBe(true);
      expect(names.some((n) => n.includes('impact'))).toBe(true);
    });

    it('Vocals loops should include at least one vocal sample', () => {
      const vocalLoops = LOOP_DEFINITIONS.filter(
        (d) => d.category === 'Vocals'
      );
      expect(vocalLoops.length).toBeGreaterThanOrEqual(1);
    });
  });
});
