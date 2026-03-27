import { describe, expect, it } from 'vitest';
import {
  createDefaultFmInstrument,
  createDefaultSamplerInstrument,
  getTrackInstrumentPlaybackSource,
  getTrackSamplerPlaybackState,
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

  it('returns the canonical playback source for fm instruments', () => {
    const source = getTrackInstrumentPlaybackSource({
      trackName: 'synth',
      trackType: 'pianoRoll',
      instrument: createDefaultFmInstrument({
        name: 'FM Bell',
        fallbackPreset: 'lead',
      }),
      synthPreset: 'lead',
      sampler: undefined,
      samplerConfig: undefined,
    });

    expect(source).toMatchObject({
      kind: 'fm',
      name: 'FM Bell',
      fallbackPreset: 'lead',
    });
  });

  it('derives sampler playback state from canonical sampler instruments without legacy mirrors', () => {
    const samplerState = getTrackSamplerPlaybackState({
      trackName: 'keyboard',
      trackType: 'pianoRoll',
      instrument: createDefaultSamplerInstrument({
        audioKey: 'audio:test:vox',
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

    expect(samplerState).toMatchObject({
      audioKey: 'audio:test:vox',
      config: {
        audioKey: 'audio:test:vox',
        rootNote: 48,
        trimEnd: 1.25,
        loopEnd: 1.1,
      },
    });
  });
});
