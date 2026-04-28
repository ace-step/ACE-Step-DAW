/**
 * Tests for the Strudel template library for agents.
 */
import { describe, it, expect } from 'vitest';
import {
  STRUDEL_TEMPLATES,
  getTemplateByGenre,
  getTemplatesByComplexity,
  getTemplatesByBpmRange,
  type StrudelTemplate,
} from '../strudelTemplateLibrary';

describe('strudelTemplateLibrary', () => {
  it('has at least 8 templates', () => {
    expect(STRUDEL_TEMPLATES.length).toBeGreaterThanOrEqual(8);
  });

  it('every template has required fields', () => {
    for (const template of STRUDEL_TEMPLATES) {
      expect(typeof template.id).toBe('string');
      expect(typeof template.genre).toBe('string');
      expect(typeof template.description).toBe('string');
      expect(typeof template.code).toBe('string');
      expect(['simple', 'moderate', 'complex']).toContain(template.complexity);
      expect(typeof template.bpmRange.min).toBe('number');
      expect(typeof template.bpmRange.max).toBe('number');
      expect(template.bpmRange.min).toBeLessThanOrEqual(template.bpmRange.max);
      expect(Array.isArray(template.instruments)).toBe(true);
      expect(template.instruments.length).toBeGreaterThan(0);
      expect(typeof template.agentInstructions).toBe('string');
    }
  });

  describe('getTemplateByGenre', () => {
    it('finds template by genre name', () => {
      const template = getTemplateByGenre('techno');
      expect(template).toBeDefined();
      expect(template!.genre).toBe('techno');
    });

    it('returns undefined for unknown genre', () => {
      expect(getTemplateByGenre('nonexistent')).toBeUndefined();
    });
  });

  describe('getTemplatesByComplexity', () => {
    it('filters by complexity level', () => {
      const simple = getTemplatesByComplexity('simple');
      expect(simple.length).toBeGreaterThan(0);
      expect(simple.every((t) => t.complexity === 'simple')).toBe(true);
    });
  });

  describe('getTemplatesByBpmRange', () => {
    it('filters templates that overlap with given BPM range', () => {
      const fastTemplates = getTemplatesByBpmRange(140, 180);
      expect(Array.isArray(fastTemplates)).toBe(true);
      for (const t of fastTemplates) {
        expect(t.bpmRange.max).toBeGreaterThanOrEqual(140);
        expect(t.bpmRange.min).toBeLessThanOrEqual(180);
      }
    });
  });
});
