import { describe, expect, it } from 'vitest';
import { createSynthModulationSpec, createSynthRuntimeSpec, resolveSlidePortamentoSeconds } from '../SynthEngine';
import {
  createDefaultFmInstrument,
  createDefaultSamplerInstrument,
  createDefaultSubtractiveInstrument,
} from '../../utils/trackInstrument';

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

describe('createSynthModulationSpec', () => {
  it('maps amp modulation to a tremolo rack for subtractive instruments', () => {
    const instrument = createDefaultSubtractiveInstrument('pad', {
      settings: {
        lfo: {
          enabled: true,
          waveform: 'triangle',
          target: 'amp',
          rateHz: 6.2,
          depth: 0.64,
          retrigger: true,
        },
      },
    });

    const spec = createSynthModulationSpec(instrument);

    expect(spec).toMatchObject({
      target: 'amp',
      effectType: 'tremolo',
      frequencyHz: 6.2,
      depth: 0.64,
      retrigger: true,
      options: {
        frequency: 6.2,
        depth: 0.64,
        type: 'triangle',
        spread: 0,
      },
    });
  });

  it('maps filter cutoff modulation to auto-filter settings when the filter is enabled', () => {
    const instrument = createDefaultSubtractiveInstrument('lead', {
      settings: {
        filter: {
          enabled: true,
          type: 'bandpass',
          cutoffHz: 1800,
          resonance: 7,
          drive: 0.2,
          keyTracking: 0.35,
        },
        lfo: {
          enabled: true,
          waveform: 'sawtooth',
          target: 'filterCutoff',
          rateHz: 3.4,
          depth: 0.55,
          retrigger: false,
        },
      },
    });

    const spec = createSynthModulationSpec(instrument);

    expect(spec?.target).toBe('filterCutoff');
    expect(spec?.effectType).toBe('autoFilter');
    expect(spec?.options).toMatchObject({
      frequency: 3.4,
      depth: 0.55,
      type: 'sawtooth',
      filter: {
        type: 'bandpass',
        Q: 7,
      },
    });

    const options = spec?.options as { baseFrequency: number; octaves: number };
    expect(options.baseFrequency).toBeLessThan(1800);
    expect(options.octaves).toBeGreaterThan(2);
  });

  it('returns null for disabled, unsupported, or non-subtractive modulation sources', () => {
    const subtractive = createDefaultSubtractiveInstrument('piano', {
      settings: {
        lfo: {
          enabled: false,
          waveform: 'sine',
          target: 'amp',
          rateHz: 5,
          depth: 0.8,
          retrigger: true,
        },
      },
    });
    const fm = createDefaultFmInstrument();
    const sampler = createDefaultSamplerInstrument({ audioKey: 'audio:test', sampleName: 'Kick' });

    expect(createSynthModulationSpec(subtractive)).toBeNull();
    expect(createSynthModulationSpec(fm)).toBeNull();
    expect(createSynthModulationSpec(sampler)).toBeNull();
    expect(createSynthModulationSpec('lead')).toBeNull();
  });

  it('maps pitch modulation to vibrato with a tempered depth curve', () => {
    const instrument = createDefaultSubtractiveInstrument('lead', {
      settings: {
        lfo: {
          enabled: true,
          waveform: 'square',
          target: 'pitch',
          rateHz: 7.5,
          depth: 1,
          retrigger: true,
        },
      },
    });

    const spec = createSynthModulationSpec(instrument);

    expect(spec).toMatchObject({
      target: 'pitch',
      effectType: 'vibrato',
      frequencyHz: 7.5,
      retrigger: true,
      options: {
        frequency: 7.5,
        type: 'square',
        maxDelay: 0.005,
      },
    });

    const options = spec?.options as { depth: number };
    expect(options.depth).toBeCloseTo(0.85, 5);
  });
});

describe('resolveSlidePortamentoSeconds', () => {
  it('uses canonical subtractive glide time when a positive glide value is configured', () => {
    const instrument = createDefaultSubtractiveInstrument('lead', {
      settings: {
        glideTime: 0.48,
      },
    });

    expect(resolveSlidePortamentoSeconds(instrument, 0.2)).toBeCloseTo(0.48, 5);
  });

  it('falls back to the legacy slide heuristic for zero-glide subtractive, FM, and preset sources', () => {
    const subtractive = createDefaultSubtractiveInstrument('pad', {
      settings: {
        glideTime: 0,
      },
    });
    const fm = createDefaultFmInstrument();

    expect(resolveSlidePortamentoSeconds(subtractive, 0.5)).toBeCloseTo(0.12, 5);
    expect(resolveSlidePortamentoSeconds(fm, 0.4)).toBeCloseTo(0.12, 5);
    expect(resolveSlidePortamentoSeconds('lead', 0.04)).toBeCloseTo(0.03, 5);
  });
});
