import { describe, it, expect } from 'vitest';
import {
  interpretSoundDescription,
  generateVariations,
  type SoundDesignSuggestion,
} from '../soundDesignAssistant';
import type {
  SubtractiveInstrumentSettings,
  FmInstrumentSettings,
  WavetableSettings,
} from '../../types/project';

// Default subtractive settings for testing
const DEFAULT_SUB: SubtractiveInstrumentSettings = {
  oscillator: { waveform: 'sawtooth', octave: 0, detuneCents: 0, level: 1 },
  ampEnvelope: { attack: 0.01, decay: 0.3, sustain: 0.5, release: 0.5 },
  filter: { enabled: false, type: 'lowpass', cutoffHz: 2000, resonance: 1, drive: 0, keyTracking: 0 },
  filterEnvelope: { attack: 0.01, decay: 0.3, sustain: 0.5, release: 0.5, amount: 0 },
  lfo: { enabled: false, waveform: 'sine', target: 'off', rateHz: 1, depth: 0, retrigger: false },
  unison: { voices: 1, detuneCents: 0, stereoSpread: 0, blend: 0.5 },
  glideTime: 0,
  outputGain: 0.55,
};

describe('interpretSoundDescription', () => {
  it('returns a SoundDesignSuggestion with parameter changes', () => {
    const result = interpretSoundDescription('warm pad with slow attack', 'subtractive', DEFAULT_SUB);
    expect(result).toBeDefined();
    expect(result.changes).toBeDefined();
    expect(Object.keys(result.changes).length).toBeGreaterThan(0);
    expect(result.description).toBeTruthy();
  });

  it('interprets "warm" as lowpass filter', () => {
    const result = interpretSoundDescription('warm sound', 'subtractive', DEFAULT_SUB);
    expect(result.changes.filter?.enabled).toBe(true);
    expect(result.changes.filter?.type).toBe('lowpass');
  });

  it('interprets "bright" as higher cutoff', () => {
    const result = interpretSoundDescription('bright lead', 'subtractive', DEFAULT_SUB);
    expect(result.changes.filter?.cutoffHz).toBeGreaterThanOrEqual(4000);
  });

  it('interprets "slow attack" as long attack time', () => {
    const result = interpretSoundDescription('slow attack pad', 'subtractive', DEFAULT_SUB);
    expect(result.changes.ampEnvelope?.attack).toBeGreaterThanOrEqual(0.3);
  });

  it('interprets "plucky" as short attack and decay', () => {
    const result = interpretSoundDescription('plucky synth', 'subtractive', DEFAULT_SUB);
    expect(result.changes.ampEnvelope?.attack).toBeLessThanOrEqual(0.01);
    expect(result.changes.ampEnvelope?.sustain).toBeLessThanOrEqual(0.1);
  });

  it('interprets "aggressive" as distortion/drive', () => {
    const result = interpretSoundDescription('aggressive bass', 'subtractive', DEFAULT_SUB);
    expect(
      (result.changes.filter?.drive ?? 0) > 0 ||
      result.changes.filter?.resonance !== undefined
    ).toBe(true);
  });

  it('interprets "detuned" as unison voices', () => {
    const result = interpretSoundDescription('fat detuned saw', 'subtractive', DEFAULT_SUB);
    expect(result.changes.unison?.voices).toBeGreaterThan(1);
    expect(result.changes.unison?.detuneCents).toBeGreaterThan(0);
  });

  it('returns iterative changes for "brighter"', () => {
    const settings: SubtractiveInstrumentSettings = {
      ...DEFAULT_SUB,
      filter: { ...DEFAULT_SUB.filter, enabled: true, cutoffHz: 2000 },
    };
    const result = interpretSoundDescription('brighter', 'subtractive', settings);
    expect(result.changes.filter?.cutoffHz).toBeGreaterThan(2000);
  });

  it('returns iterative changes for "warmer"', () => {
    const settings: SubtractiveInstrumentSettings = {
      ...DEFAULT_SUB,
      filter: { ...DEFAULT_SUB.filter, enabled: true, cutoffHz: 5000 },
    };
    const result = interpretSoundDescription('warmer', 'subtractive', settings);
    expect(result.changes.filter?.cutoffHz).toBeLessThan(5000);
  });

  it('handles "softer attack"', () => {
    const settings: SubtractiveInstrumentSettings = {
      ...DEFAULT_SUB,
      ampEnvelope: { ...DEFAULT_SUB.ampEnvelope, attack: 0.01 },
    };
    const result = interpretSoundDescription('softer attack', 'subtractive', settings);
    expect(result.changes.ampEnvelope?.attack).toBeGreaterThan(0.01);
  });
});

describe('generateVariations', () => {
  it('generates N variations from base settings', () => {
    const variations = generateVariations(DEFAULT_SUB, 'subtractive', 5);
    expect(variations.length).toBe(5);
  });

  it('each variation differs from the base', () => {
    const variations = generateVariations(DEFAULT_SUB, 'subtractive', 3);
    for (const v of variations) {
      const keys = Object.keys(v.changes);
      expect(keys.length).toBeGreaterThan(0);
    }
  });

  it('each variation has a name and description', () => {
    const variations = generateVariations(DEFAULT_SUB, 'subtractive', 3);
    for (const v of variations) {
      expect(v.name).toBeTruthy();
      expect(v.description).toBeTruthy();
    }
  });
});
