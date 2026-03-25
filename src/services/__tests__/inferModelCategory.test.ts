import { describe, expect, it } from 'vitest';
import { inferModelCategory } from '../aceStepApi';

describe('inferModelCategory', () => {
  it('uses explicit category when provided', () => {
    expect(inferModelCategory({ category: 'lego', supported_task_types: ['text2music'] })).toBe('lego');
    expect(inferModelCategory({ category: 'text2music' })).toBe('text2music');
  });

  it('infers text2music from supported_task_types', () => {
    expect(inferModelCategory({ supported_task_types: ['text2music', 'cover', 'repaint'] })).toBe('text2music');
  });

  it('infers lego from supported_task_types', () => {
    expect(inferModelCategory({ supported_task_types: ['lego', 'cover', 'repaint'] })).toBe('lego');
  });

  it('infers lego from model name containing "lego"', () => {
    expect(inferModelCategory({ name: 'ace-step-lego-v1' })).toBe('lego');
    expect(inferModelCategory({ name: 'ACE-LEGO-turbo' })).toBe('lego');
  });

  it('defaults to text2music when no signals available', () => {
    expect(inferModelCategory({})).toBe('text2music');
    expect(inferModelCategory({ name: 'mystery-model' })).toBe('text2music');
  });

  it('prioritizes supported_task_types over name heuristic', () => {
    expect(inferModelCategory({
      name: 'lego-model',
      supported_task_types: ['text2music', 'cover'],
    })).toBe('text2music');
  });
});
