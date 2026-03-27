import { describe, it, expect } from 'vitest';
import {
  getDefaultTrackInstrumentPreset,
  createDefaultSubtractiveInstrument,
  createDefaultSamplerInstrument,
  createDefaultFmInstrument,
  getLegacySynthPresetFromInstrument,
  syncTrackInstrumentState,
} from '../trackInstrument';
import type {
  SubtractiveTrackInstrument,
  SamplerTrackInstrument,
  FmTrackInstrument,
  TrackName,
} from '../../types/project';

describe('getDefaultTrackInstrumentPreset', () => {
  it('returns "bass" for bass track', () => {
    expect(getDefaultTrackInstrumentPreset('bass')).toBe('bass');
  });

  it('returns "strings" for strings track', () => {
    expect(getDefaultTrackInstrumentPreset('strings')).toBe('strings');
  });

  it('returns "lead" for synth track', () => {
    expect(getDefaultTrackInstrumentPreset('synth')).toBe('lead');
  });

  it('returns "organ" for keyboard track', () => {
    expect(getDefaultTrackInstrumentPreset('keyboard')).toBe('organ');
  });

  it('returns "piano" for other track names', () => {
    const otherNames: TrackName[] = ['vocals', 'drums', 'guitar', 'percussion', 'fx', 'custom'];
    for (const name of otherNames) {
      expect(getDefaultTrackInstrumentPreset(name)).toBe('piano');
    }
  });
});

describe('createDefaultSubtractiveInstrument', () => {
  it('creates piano preset by default', () => {
    const inst = createDefaultSubtractiveInstrument();
    expect(inst.kind).toBe('subtractive');
    expect(inst.preset).toBe('piano');
    expect(inst.name).toBe('Studio Piano');
  });

  it('creates correct preset for each voice type', () => {
    const presets = ['piano', 'strings', 'pad', 'lead', 'bass', 'organ'] as const;
    const expectedNames = [
      'Studio Piano', 'Expressive Strings', 'Warm Pad',
      'Sharp Lead', 'Solid Bass', 'Drawbar Organ',
    ];
    for (let i = 0; i < presets.length; i++) {
      const inst = createDefaultSubtractiveInstrument(presets[i]);
      expect(inst.name).toBe(expectedNames[i]);
      expect(inst.preset).toBe(presets[i]);
    }
  });

  it('applies name override', () => {
    const inst = createDefaultSubtractiveInstrument('piano', { name: 'My Piano' });
    expect(inst.name).toBe('My Piano');
  });

  it('applies settings overrides while keeping defaults for unspecified', () => {
    const inst = createDefaultSubtractiveInstrument('piano', {
      settings: {
        glideTime: 0.1,
        outputGain: -3,
      } as SubtractiveTrackInstrument['settings'],
    });
    expect(inst.settings.glideTime).toBe(0.1);
    expect(inst.settings.outputGain).toBe(-3);
    // Default values still present
    expect(inst.settings.oscillator.waveform).toBe('triangle');
  });

  it('always sets kind to subtractive', () => {
    const inst = createDefaultSubtractiveInstrument('bass');
    expect(inst.kind).toBe('subtractive');
  });

  it('has all required settings sections', () => {
    const inst = createDefaultSubtractiveInstrument();
    expect(inst.settings.oscillator).not.toBeUndefined();
    expect(inst.settings.ampEnvelope).not.toBeUndefined();
    expect(inst.settings.filter).not.toBeUndefined();
    expect(inst.settings.filterEnvelope).not.toBeUndefined();
    expect(inst.settings.lfo).not.toBeUndefined();
    expect(inst.settings.unison).not.toBeUndefined();
    expect(typeof inst.settings.glideTime).toBe('number');
    expect(typeof inst.settings.outputGain).toBe('number');
  });
});

describe('createDefaultSamplerInstrument', () => {
  it('creates a sampler with default values', () => {
    const inst = createDefaultSamplerInstrument();
    expect(inst.kind).toBe('sampler');
    expect(inst.preset).toBe('sampler');
    expect(inst.name).toBe('Quick Sampler');
    expect(inst.settings.rootNote).toBe(60);
    expect(inst.settings.playbackMode).toBe('classic');
  });

  it('uses sampleName as name when provided', () => {
    const inst = createDefaultSamplerInstrument({ sampleName: 'Kick.wav' });
    expect(inst.name).toBe('Kick.wav');
  });

  it('prefers explicit name over sampleName', () => {
    const inst = createDefaultSamplerInstrument({ name: 'My Kick', sampleName: 'Kick.wav' });
    expect(inst.name).toBe('My Kick');
  });

  it('derives sampleDuration from trimEnd if not specified', () => {
    const inst = createDefaultSamplerInstrument({ trimEnd: 2.5 });
    expect(inst.settings.sampleDuration).toBe(2.5);
  });

  it('derives sampleDuration from loopEnd if trimEnd not specified', () => {
    const inst = createDefaultSamplerInstrument({ loopEnd: 3.0 });
    expect(inst.settings.sampleDuration).toBe(3.0);
  });

  it('defaults sampleDuration to 1 when nothing specified', () => {
    const inst = createDefaultSamplerInstrument();
    expect(inst.settings.sampleDuration).toBe(1);
  });

  it('has correct amp envelope defaults', () => {
    const inst = createDefaultSamplerInstrument();
    expect(inst.settings.ampEnvelope.attack).toBe(0.01);
    expect(inst.settings.ampEnvelope.decay).toBe(0.2);
    expect(inst.settings.ampEnvelope.sustain).toBe(0.7);
    expect(inst.settings.ampEnvelope.release).toBe(0.5);
  });

  it('applies ampEnvelope overrides', () => {
    const inst = createDefaultSamplerInstrument({ ampEnvelope: { attack: 0.5 } });
    expect(inst.settings.ampEnvelope.attack).toBe(0.5);
    // Non-overridden values still default
    expect(inst.settings.ampEnvelope.decay).toBe(0.2);
  });
});

describe('createDefaultFmInstrument', () => {
  it('creates FM instrument with defaults', () => {
    const inst = createDefaultFmInstrument();
    expect(inst.kind).toBe('fm');
    expect(inst.preset).toBe('fm');
    expect(inst.name).toBe('FM Init');
    expect(inst.fallbackPreset).toBe('lead');
  });

  it('applies name override', () => {
    const inst = createDefaultFmInstrument({ name: 'My FM' });
    expect(inst.name).toBe('My FM');
  });

  it('applies fallbackPreset override', () => {
    const inst = createDefaultFmInstrument({ fallbackPreset: 'bass' });
    expect(inst.fallbackPreset).toBe('bass');
  });

  it('has correct carrier defaults', () => {
    const inst = createDefaultFmInstrument();
    expect(inst.settings.carrier.waveform).toBe('sine');
    expect(inst.settings.carrier.ratio).toBe(1);
    expect(inst.settings.carrier.level).toBe(1);
  });

  it('has correct modulator defaults', () => {
    const inst = createDefaultFmInstrument();
    expect(inst.settings.modulator.waveform).toBe('sine');
    expect(inst.settings.modulator.ratio).toBe(2);
    expect(inst.settings.modulator.level).toBe(0.75);
  });

  it('has correct FM parameter defaults', () => {
    const inst = createDefaultFmInstrument();
    expect(inst.settings.modulationIndex).toBe(2);
    expect(inst.settings.harmonicity).toBe(2);
    expect(inst.settings.feedback).toBe(0);
    expect(inst.settings.algorithm).toBe('serial');
    expect(inst.settings.outputGain).toBe(0);
  });

  it('applies settings overrides', () => {
    const inst = createDefaultFmInstrument({
      settings: {
        modulationIndex: 5,
        feedback: 0.3,
      } as FmTrackInstrument['settings'],
    });
    expect(inst.settings.modulationIndex).toBe(5);
    expect(inst.settings.feedback).toBe(0.3);
    // Defaults preserved
    expect(inst.settings.carrier.waveform).toBe('sine');
  });
});

describe('getLegacySynthPresetFromInstrument', () => {
  it('returns "sampler" for sampler instrument', () => {
    const inst = createDefaultSamplerInstrument();
    expect(getLegacySynthPresetFromInstrument(inst)).toBe('sampler');
  });

  it('returns fallbackPreset for FM instrument', () => {
    const inst = createDefaultFmInstrument({ fallbackPreset: 'bass' });
    expect(getLegacySynthPresetFromInstrument(inst)).toBe('bass');
  });

  it('returns preset for subtractive instrument', () => {
    const inst = createDefaultSubtractiveInstrument('lead');
    expect(getLegacySynthPresetFromInstrument(inst)).toBe('lead');
  });
});

describe('syncTrackInstrumentState', () => {
  it('returns undefined instrument for non-pianoRoll track without instrument/sampler', () => {
    const result = syncTrackInstrumentState({
      trackName: 'vocals',
      trackType: 'stems',
      instrument: undefined,
      synthPreset: 'piano',
      sampler: undefined,
      samplerConfig: undefined,
    });
    expect(result.instrument).toBeUndefined();
    expect(result.synthPreset).toBe('piano');
  });

  it('creates subtractive instrument for pianoRoll track without instrument', () => {
    const result = syncTrackInstrumentState({
      trackName: 'synth',
      trackType: 'pianoRoll',
      instrument: undefined,
      synthPreset: undefined,
      sampler: undefined,
      samplerConfig: undefined,
    });
    expect(result.instrument).not.toBeUndefined();
    expect(result.instrument!.kind).toBe('subtractive');
    // synth track default preset is "lead"
    expect(result.synthPreset).toBe('lead');
  });

  it('creates sampler instrument when synthPreset is "sampler"', () => {
    const result = syncTrackInstrumentState({
      trackName: 'vocals',
      trackType: 'pianoRoll',
      instrument: undefined,
      synthPreset: 'sampler',
      sampler: undefined,
      samplerConfig: undefined,
    });
    expect(result.instrument!.kind).toBe('sampler');
    expect(result.synthPreset).toBe('sampler');
  });

  it('normalizes an existing subtractive instrument', () => {
    const existing = createDefaultSubtractiveInstrument('piano');
    const result = syncTrackInstrumentState({
      trackName: 'keyboard',
      trackType: 'pianoRoll',
      instrument: existing,
      synthPreset: 'piano',
      sampler: undefined,
      samplerConfig: undefined,
    });
    expect(result.instrument!.kind).toBe('subtractive');
    expect(result.sampler).toBeUndefined();
    expect(result.samplerConfig).toBeUndefined();
  });

  it('normalizes an existing FM instrument', () => {
    const existing = createDefaultFmInstrument({ fallbackPreset: 'lead' });
    const result = syncTrackInstrumentState({
      trackName: 'synth',
      trackType: 'pianoRoll',
      instrument: existing,
      synthPreset: 'lead',
      sampler: undefined,
      samplerConfig: undefined,
    });
    expect(result.instrument!.kind).toBe('fm');
    expect(result.synthPreset).toBe('lead');
  });

  it('builds legacy sampler state for sampler instrument', () => {
    const existing = createDefaultSamplerInstrument({
      audioKey: 'audio-123',
      sampleName: 'Kick.wav',
      rootNote: 48,
    });
    const result = syncTrackInstrumentState({
      trackName: 'drums',
      trackType: 'pianoRoll',
      instrument: existing,
      synthPreset: 'sampler',
      sampler: undefined,
      samplerConfig: undefined,
    });
    expect(result.instrument!.kind).toBe('sampler');
    expect(result.synthPreset).toBe('sampler');
    expect(result.sampler).not.toBeUndefined();
    expect(result.sampler!.audioKey).toBe('audio-123');
    expect(result.samplerConfig).not.toBeUndefined();
    expect(result.samplerConfig!.rootNote).toBe(48);
  });

  it('creates sampler from legacy sampler fields when no instrument exists', () => {
    const result = syncTrackInstrumentState({
      trackName: 'drums',
      trackType: 'pianoRoll',
      instrument: undefined,
      synthPreset: 'sampler',
      sampler: { audioKey: 'audio-456', rootNote: 60, sampleDuration: 2 },
      samplerConfig: {
        audioKey: 'audio-456',
        rootNote: 60,
        trimStart: 0,
        trimEnd: 2,
        playbackMode: 'classic',
        loopStart: 0,
        loopEnd: 2,
        attack: 0.01,
        decay: 0.2,
        sustain: 0.7,
        release: 0.5,
      },
    });
    expect(result.instrument!.kind).toBe('sampler');
    const settings = (result.instrument as SamplerTrackInstrument).settings;
    expect(settings.audioKey).toBe('audio-456');
    expect(settings.rootNote).toBe(60);
    expect(settings.trimEnd).toBe(2);
  });
});
