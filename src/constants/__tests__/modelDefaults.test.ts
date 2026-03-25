import { describe, expect, it } from 'vitest';
import { inferModelVariant, getModelDefaults, MODEL_VARIANT_DEFAULTS } from '../modelDefaults';

describe('inferModelVariant', () => {
  it('detects turbo from name', () => {
    expect(inferModelVariant({ name: 'ace-step-turbo-v1' })).toBe('turbo');
    expect(inferModelVariant({ name: 'ACE-TURBO-2.0' })).toBe('turbo');
  });

  it('detects sft from name', () => {
    expect(inferModelVariant({ name: 'ace-step-sft-v1' })).toBe('sft');
    expect(inferModelVariant({ name: 'ace-lego-v1' })).toBe('sft');
  });

  it('detects sft from lego in supported_task_types', () => {
    expect(inferModelVariant({ name: 'mystery-model', supported_task_types: ['lego', 'cover'] })).toBe('sft');
  });

  it('detects sft from lego category', () => {
    expect(inferModelVariant({ name: 'some-model', category: 'lego' })).toBe('sft');
  });

  it('defaults to base for unknown models', () => {
    expect(inferModelVariant({ name: 'ace-step-v1' })).toBe('base');
    expect(inferModelVariant({})).toBe('base');
  });

  it('turbo takes priority over sft hints', () => {
    // If name has both turbo and sft, turbo wins
    expect(inferModelVariant({ name: 'turbo-sft-hybrid' })).toBe('turbo');
  });
});

describe('getModelDefaults', () => {
  it('returns turbo defaults for turbo model', () => {
    const defaults = getModelDefaults({ name: 'ace-turbo-v1' });
    expect(defaults.inferenceSteps).toBe(8);
    expect(defaults.inferenceStepsMax).toBe(20);
    expect(defaults.guidanceScaleVisible).toBe(false);
    expect(defaults.advancedDitVisible).toBe(false);
  });

  it('returns base defaults for base model', () => {
    const defaults = getModelDefaults({ name: 'ace-step-base-v1' });
    expect(defaults.inferenceSteps).toBe(32);
    expect(defaults.inferenceStepsMax).toBe(200);
    expect(defaults.guidanceScaleVisible).toBe(true);
    expect(defaults.advancedDitVisible).toBe(true);
  });

  it('returns sft defaults for sft model', () => {
    const defaults = getModelDefaults({ name: 'ace-step-sft-stems' });
    expect(defaults.inferenceSteps).toBe(50);
    expect(defaults.guidanceScaleVisible).toBe(true);
  });
});

describe('MODEL_VARIANT_DEFAULTS', () => {
  it('turbo has restricted task types', () => {
    expect(MODEL_VARIANT_DEFAULTS.turbo.supportedTaskTypes).toEqual(['text2music', 'repaint', 'cover']);
    expect(MODEL_VARIANT_DEFAULTS.turbo.supportedTaskTypes).not.toContain('lego');
  });

  it('sft supports all task types including lego', () => {
    expect(MODEL_VARIANT_DEFAULTS.sft.supportedTaskTypes).toContain('lego');
    expect(MODEL_VARIANT_DEFAULTS.sft.supportedTaskTypes).toContain('text2music');
  });
});
