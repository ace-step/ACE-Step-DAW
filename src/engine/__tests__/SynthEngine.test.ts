import { describe, expect, it } from 'vitest';
import { createSynthRuntimeSpec } from '../SynthEngine';
import { createDefaultFmInstrument, createDefaultSubtractiveInstrument } from '../../utils/trackInstrument';

describe('createSynthRuntimeSpec', () => {
  it('maps subtractive instruments to MonoSynth runtime options with filter and unison support', () => {
    const instrument = createDefaultSubtractiveInstrument('lead', {
      settings: {
        oscillator: {
          waveform: 'square',
          octave: -1,
          detuneCents: 7,
          level: 0.72,
        },
        filter: {
          enabled: true,
          type: 'lowpass',
          cutoffHz: 2400,
          resonance: 6,
          drive: 0.35,
          keyTracking: 0.4,
        },
        filterEnvelope: {
          attack: 0.05,
          decay: 0.25,
          sustain: 0.35,
          release: 0.4,
          amount: 0.3,
        },
        unison: {
          voices: 4,
          detuneCents: 18,
          stereoSpread: 0.5,
          blend: 0.8,
        },
        glideTime: 0.12,
        outputGain: -3,
      },
    });

    const spec = createSynthRuntimeSpec(instrument);

    expect(spec.engine).toBe('subtractive');
    expect(spec.voiceType).toBe('mono');
    expect(spec.options).toMatchObject({
      oscillator: {
        type: 'fatsquare',
        count: 4,
      },
      filter: {
        type: 'lowpass',
        frequency: 2400,
        Q: 6,
      },
      detune: -1193,
      portamento: 0.12,
    });

    const oscillatorOptions = spec.options.oscillator as { spread: number };
    const filterEnvelope = spec.options.filterEnvelope as { baseFrequency: number; octaves: number };

    expect(oscillatorOptions.spread).toBeGreaterThan(18);
    expect(filterEnvelope.baseFrequency).toBeLessThan(2400);
    expect(filterEnvelope.octaves).toBeGreaterThan(1);
    expect(spec.gainLevel).toBeCloseTo(0.38937, 4);
  });

  it('maps FM instruments to FMSynth runtime options instead of legacy fallback synths', () => {
    const instrument = createDefaultFmInstrument({
      fallbackPreset: 'bass',
      settings: {
        carrier: {
          waveform: 'square',
          ratio: 1,
          level: 0.82,
        },
        modulator: {
          waveform: 'triangle',
          ratio: 3,
          level: 0.5,
        },
        modulationIndex: 4,
        feedback: 0.25,
        ampEnvelope: {
          attack: 0.02,
          decay: 0.3,
          sustain: 0.55,
          release: 0.8,
        },
        outputGain: 2,
      },
    });

    const spec = createSynthRuntimeSpec(instrument);

    expect(spec.engine).toBe('fm');
    expect(spec.voiceType).toBe('fm');
    expect(spec.options).toMatchObject({
      oscillator: {
        type: 'square',
      },
      modulation: {
        type: 'triangle',
      },
      harmonicity: 3,
      detune: 0,
    });

    const modulationEnvelope = spec.options.modulationEnvelope as { sustain: number };
    expect(modulationEnvelope.sustain).toBeCloseTo(0.5, 5);
    expect(spec.options.modulationIndex).toBeCloseTo(3.9, 5);
    expect(spec.gainLevel).toBeCloseTo(0.6924, 4);
  });
});
