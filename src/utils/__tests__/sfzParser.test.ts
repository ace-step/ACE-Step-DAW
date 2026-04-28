import { describe, it, expect } from 'vitest';
import { parseSfz, type SfzRegion } from '../sfzParser';

describe('parseSfz', () => {
  it('parses a minimal SFZ with one region', () => {
    const sfz = `
<group>
<region> sample=piano_C4.wav lokey=48 hikey=72 pitch_keycenter=60
`;
    const result = parseSfz(sfz);
    expect(result.regions).toHaveLength(1);
    expect(result.regions[0]).toEqual(
      expect.objectContaining({
        sample: 'piano_C4.wav',
        lokey: 48,
        hikey: 72,
        pitchKeycenter: 60,
      }),
    );
  });

  it('parses multiple regions', () => {
    const sfz = `
<region> sample=soft.wav lokey=0 hikey=127 lovel=0 hivel=63 pitch_keycenter=60
<region> sample=hard.wav lokey=0 hikey=127 lovel=64 hivel=127 pitch_keycenter=60
`;
    const result = parseSfz(sfz);
    expect(result.regions).toHaveLength(2);
    expect(result.regions[0].lovel).toBe(0);
    expect(result.regions[0].hivel).toBe(63);
    expect(result.regions[1].lovel).toBe(64);
    expect(result.regions[1].hivel).toBe(127);
  });

  it('inherits group-level defaults', () => {
    const sfz = `
<group> lovel=0 hivel=127
<region> sample=a.wav lokey=48 hikey=60 pitch_keycenter=54
<region> sample=b.wav lokey=61 hikey=72 pitch_keycenter=66
`;
    const result = parseSfz(sfz);
    expect(result.regions).toHaveLength(2);
    expect(result.regions[0].lovel).toBe(0);
    expect(result.regions[0].hivel).toBe(127);
    expect(result.regions[1].lovel).toBe(0);
    expect(result.regions[1].hivel).toBe(127);
  });

  it('region overrides group defaults', () => {
    const sfz = `
<group> lovel=0 hivel=127
<region> sample=a.wav lokey=48 hikey=60 lovel=64 hivel=127 pitch_keycenter=54
`;
    const result = parseSfz(sfz);
    expect(result.regions[0].lovel).toBe(64);
    expect(result.regions[0].hivel).toBe(127);
  });

  it('defaults lokey=0 hikey=127 when missing', () => {
    const sfz = '<region> sample=test.wav pitch_keycenter=60';
    const result = parseSfz(sfz);
    expect(result.regions[0].lokey).toBe(0);
    expect(result.regions[0].hikey).toBe(127);
  });

  it('defaults lovel=0 hivel=127 when missing', () => {
    const sfz = '<region> sample=test.wav pitch_keycenter=60';
    const result = parseSfz(sfz);
    expect(result.regions[0].lovel).toBe(0);
    expect(result.regions[0].hivel).toBe(127);
  });

  it('parses volume and pan opcodes', () => {
    const sfz = '<region> sample=test.wav volume=-6 pan=50 pitch_keycenter=60';
    const result = parseSfz(sfz);
    expect(result.regions[0].volume).toBe(-6);
    expect(result.regions[0].pan).toBe(50);
  });

  it('parses tune opcode', () => {
    const sfz = '<region> sample=test.wav tune=50 pitch_keycenter=60';
    const result = parseSfz(sfz);
    expect(result.regions[0].tune).toBe(50);
  });

  it('ignores comments', () => {
    const sfz = `
// This is a comment
<region> sample=test.wav pitch_keycenter=60
// Another comment
`;
    const result = parseSfz(sfz);
    expect(result.regions).toHaveLength(1);
  });

  it('returns empty regions for empty input', () => {
    expect(parseSfz('').regions).toEqual([]);
    expect(parseSfz('// just comments').regions).toEqual([]);
  });

  it('parses note names as MIDI numbers', () => {
    const sfz = '<region> sample=test.wav lokey=c4 hikey=b4 pitch_keycenter=e4';
    const result = parseSfz(sfz);
    expect(result.regions[0].lokey).toBe(60);
    expect(result.regions[0].hikey).toBe(71);
    expect(result.regions[0].pitchKeycenter).toBe(64);
  });
});
