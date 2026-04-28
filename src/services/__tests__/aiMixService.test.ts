import { describe, it, expect } from 'vitest';
import { formatDb, formatPan } from '../aiMixService';

describe('formatDb', () => {
  it('formats positive values with + sign', () => {
    expect(formatDb(3.5)).toBe('+3.5 dB');
  });

  it('formats negative values with - sign', () => {
    expect(formatDb(-6.0)).toBe('-6.0 dB');
  });

  it('formats zero as +0.0 dB', () => {
    expect(formatDb(0)).toBe('+0.0 dB');
  });

  it('rounds to one decimal place', () => {
    expect(formatDb(1.234)).toBe('+1.2 dB');
    expect(formatDb(-0.999)).toBe('-1.0 dB');
  });
});

describe('formatPan', () => {
  it('formats center as C', () => {
    expect(formatPan(0)).toBe('C');
  });

  it('formats near-center as C (within threshold)', () => {
    expect(formatPan(0.005)).toBe('C');
    expect(formatPan(-0.005)).toBe('C');
  });

  it('formats left pan with L suffix', () => {
    expect(formatPan(-0.5)).toBe('50L');
    expect(formatPan(-1)).toBe('100L');
  });

  it('formats right pan with R suffix', () => {
    expect(formatPan(0.5)).toBe('50R');
    expect(formatPan(1)).toBe('100R');
  });

  it('rounds to nearest integer percentage', () => {
    expect(formatPan(0.333)).toBe('33R');
    expect(formatPan(-0.667)).toBe('67L');
  });
});
