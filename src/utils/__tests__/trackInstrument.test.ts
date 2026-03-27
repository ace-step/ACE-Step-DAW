import { describe, expect, it } from 'vitest';
import {
  createDefaultFmInstrument,
  createDefaultSamplerInstrument,
  getTrackInstrumentSelectValue,
  getTrackSamplerConfigFromInstrument,
  resolveTrackInstrument,
} from '../trackInstrument';

describe('trackInstrument helpers', () => {
  it('resolves a subtractive instrument from legacy synth preset state', () => {
    const instrument = resolveTrackInstrument({
      trackName: 'keyboard',
      trackType: 'pianoRoll',
      instrument: undefined,
      synthPreset: 'pad',
      sampler: undefined,
      samplerConfig: undefined,
    });

    expect(instrument).toMatchObject({
      kind: 'subtractive',
      preset: 'pad',
    });
  });

  it('derives sampler config from a canonical sampler instrument', () => {
    const samplerConfig = getTrackSamplerConfigFromInstrument({
      trackName: 'keyboard',
      trackType: 'pianoRoll',
      instrument: createDefaultSamplerInstrument({
        audioKey: 'audio:test:sampler',
        sampleName: 'Glass Vox',
        rootNote: 48,
        sampleDuration: 1.5,
        trimEnd: 1.25,
        loopEnd: 1.1,
      }),
      synthPreset: undefined,
      sampler: undefined,
      samplerConfig: undefined,
    });

    expect(samplerConfig).toMatchObject({
      audioKey: 'audio:test:sampler',
      rootNote: 48,
      trimEnd: 1.25,
      loopEnd: 1.1,
    });
  });

  it('returns an fm selector value for canonical fm instruments', () => {
    const selectValue = getTrackInstrumentSelectValue({
      trackName: 'synth',
      trackType: 'pianoRoll',
      instrument: createDefaultFmInstrument({ fallbackPreset: 'lead' }),
      synthPreset: undefined,
      sampler: undefined,
      samplerConfig: undefined,
    });

    expect(selectValue).toBe('fm');
  });
});
