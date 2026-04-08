import { describe, it, expect } from 'vitest';
import { FACTORY_GROOVES, GROOVE_CATEGORIES, getGrooveCategory } from '../factoryGrooves';

describe('factoryGrooves', () => {
  it('exports at least 10 factory grooves', () => {
    expect(FACTORY_GROOVES.length).toBeGreaterThanOrEqual(10);
  });

  it('every groove has a unique id', () => {
    const ids = FACTORY_GROOVES.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every groove has a non-empty name', () => {
    for (const g of FACTORY_GROOVES) {
      expect(g.name.length).toBeGreaterThan(0);
    }
  });

  it('timing offsets length matches gridBeats/lengthBeats', () => {
    for (const g of FACTORY_GROOVES) {
      const expectedSlots = Math.round(g.lengthBeats / g.gridBeats);
      expect(g.timingOffsets).toHaveLength(expectedSlots);
      expect(g.velocityPattern).toHaveLength(expectedSlots);
    }
  });

  it('velocity patterns are positive numbers', () => {
    for (const g of FACTORY_GROOVES) {
      for (const v of g.velocityPattern) {
        expect(v).toBeGreaterThan(0);
      }
    }
  });

  it('timing offsets are within reasonable range (-0.2 to 0.2 beats)', () => {
    for (const g of FACTORY_GROOVES) {
      for (const offset of g.timingOffsets) {
        expect(Math.abs(offset)).toBeLessThanOrEqual(0.2);
      }
    }
  });

  it('every groove has a category mapping', () => {
    for (const g of FACTORY_GROOVES) {
      const category = getGrooveCategory(g.name);
      expect(category).not.toBe('Custom');
    }
  });

  it('getGrooveCategory returns Custom for unknown names', () => {
    expect(getGrooveCategory('Unknown Groove')).toBe('Custom');
  });

  it('GROOVE_CATEGORIES has entries for all factory grooves', () => {
    for (const g of FACTORY_GROOVES) {
      expect(GROOVE_CATEGORIES[g.name]).toBeDefined();
    }
  });

  it('createdAt is 0 for factory grooves', () => {
    for (const g of FACTORY_GROOVES) {
      expect(g.createdAt).toBe(0);
    }
  });
});
