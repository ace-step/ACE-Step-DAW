import type {
  FmTrackInstrument,
  InstrumentEnvelope,
  LegacySynthVoicePreset,
  SamplerConfig,
  SamplerSettings,
  SamplerTrackInstrument,
  SubtractiveTrackInstrument,
  SynthPreset,
  Track,
  TrackName,
  TrackType,
  TrackInstrument,
} from '../types/project';

type TrackInstrumentSyncInput = Pick<
  Track,
  'trackName' | 'trackType' | 'instrument' | 'synthPreset' | 'sampler' | 'samplerConfig'
>;

type TrackInstrumentSyncState = Pick<Track, 'instrument' | 'synthPreset' | 'sampler' | 'samplerConfig'>;

const DEFAULT_AMP_ENVELOPE: InstrumentEnvelope = {
  attack: 0.01,
  decay: 0.2,
  sustain: 0.7,
  release: 0.5,
};

const SUBTRACTIVE_PRESET_DEFAULTS: Record<
  LegacySynthVoicePreset,
  Pick<SubtractiveTrackInstrument, 'name'> & { settings: SubtractiveTrackInstrument['settings'] }
> = {
  piano: {
    name: 'Studio Piano',
    settings: {
      oscillator: { waveform: 'triangle', octave: 0, detuneCents: 0, level: 0.9 },
      ampEnvelope: { attack: 0.005, decay: 0.3, sustain: 0.2, release: 1.2 },
      filter: { enabled: true, type: 'lowpass', cutoffHz: 7200, resonance: 0.2, drive: 0, keyTracking: 0.1 },
      filterEnvelope: { attack: 0.01, decay: 0.3, sustain: 0.2, release: 1, amount: 0.08 },
      lfo: { enabled: false, waveform: 'sine', target: 'off', rateHz: 5, depth: 0, retrigger: true },
      unison: { voices: 1, detuneCents: 0, stereoSpread: 0, blend: 1 },
      glideTime: 0,
      outputGain: 0,
    },
  },
  strings: {
    name: 'Expressive Strings',
    settings: {
      oscillator: { waveform: 'sawtooth', octave: 0, detuneCents: 0, level: 0.9 },
      ampEnvelope: { attack: 0.4, decay: 0.2, sustain: 0.8, release: 1.5 },
      filter: { enabled: true, type: 'lowpass', cutoffHz: 5200, resonance: 0.35, drive: 0, keyTracking: 0.18 },
      filterEnvelope: { attack: 0.2, decay: 0.35, sustain: 0.6, release: 1.2, amount: 0.18 },
      lfo: { enabled: false, waveform: 'sine', target: 'off', rateHz: 5.5, depth: 0, retrigger: true },
      unison: { voices: 1, detuneCents: 0, stereoSpread: 0, blend: 1 },
      glideTime: 0,
      outputGain: 0,
    },
  },
  pad: {
    name: 'Warm Pad',
    settings: {
      oscillator: { waveform: 'sine', octave: 0, detuneCents: 0, level: 0.85 },
      ampEnvelope: { attack: 0.8, decay: 0.5, sustain: 0.9, release: 2 },
      filter: { enabled: true, type: 'lowpass', cutoffHz: 4200, resonance: 0.3, drive: 0, keyTracking: 0.12 },
      filterEnvelope: { attack: 0.5, decay: 0.6, sustain: 0.7, release: 1.6, amount: 0.14 },
      lfo: { enabled: false, waveform: 'sine', target: 'off', rateHz: 4.25, depth: 0, retrigger: true },
      unison: { voices: 1, detuneCents: 0, stereoSpread: 0, blend: 1 },
      glideTime: 0,
      outputGain: 0,
    },
  },
  lead: {
    name: 'Sharp Lead',
    settings: {
      oscillator: { waveform: 'square', octave: 0, detuneCents: 0, level: 0.95 },
      ampEnvelope: { attack: 0.01, decay: 0.1, sustain: 0.6, release: 0.3 },
      filter: { enabled: true, type: 'lowpass', cutoffHz: 6800, resonance: 0.28, drive: 0, keyTracking: 0.15 },
      filterEnvelope: { attack: 0.01, decay: 0.14, sustain: 0.4, release: 0.35, amount: 0.12 },
      lfo: { enabled: false, waveform: 'sine', target: 'off', rateHz: 6, depth: 0, retrigger: true },
      unison: { voices: 1, detuneCents: 0, stereoSpread: 0, blend: 1 },
      glideTime: 0,
      outputGain: 0,
    },
  },
  bass: {
    name: 'Solid Bass',
    settings: {
      oscillator: { waveform: 'sawtooth', octave: -1, detuneCents: 0, level: 0.95 },
      ampEnvelope: { attack: 0.01, decay: 0.2, sustain: 0.4, release: 0.5 },
      filter: { enabled: true, type: 'lowpass', cutoffHz: 2200, resonance: 0.4, drive: 0, keyTracking: 0.08 },
      filterEnvelope: { attack: 0.01, decay: 0.18, sustain: 0.2, release: 0.45, amount: 0.2 },
      lfo: { enabled: false, waveform: 'sine', target: 'off', rateHz: 4.5, depth: 0, retrigger: true },
      unison: { voices: 1, detuneCents: 0, stereoSpread: 0, blend: 1 },
      glideTime: 0,
      outputGain: 0,
    },
  },
  organ: {
    name: 'Drawbar Organ',
    settings: {
      oscillator: { waveform: 'sine', octave: 0, detuneCents: 0, level: 0.9 },
      ampEnvelope: { attack: 0.01, decay: 0.01, sustain: 1, release: 0.1 },
      filter: { enabled: true, type: 'lowpass', cutoffHz: 9000, resonance: 0.12, drive: 0, keyTracking: 0.1 },
      filterEnvelope: { attack: 0.01, decay: 0.01, sustain: 0, release: 0.1, amount: 0 },
      lfo: { enabled: false, waveform: 'sine', target: 'off', rateHz: 5, depth: 0, retrigger: true },
      unison: { voices: 1, detuneCents: 0, stereoSpread: 0, blend: 1 },
      glideTime: 0,
      outputGain: 0,
    },
  },
};

function cloneEnvelope(
  base: InstrumentEnvelope,
  overrides?: Partial<InstrumentEnvelope>,
): InstrumentEnvelope {
  return {
    attack: overrides?.attack ?? base.attack,
    decay: overrides?.decay ?? base.decay,
    sustain: overrides?.sustain ?? base.sustain,
    release: overrides?.release ?? base.release,
  };
}

export function getDefaultTrackInstrumentPreset(trackName: TrackName): LegacySynthVoicePreset {
  return trackName === 'bass' ? 'bass'
    : trackName === 'strings' ? 'strings'
      : trackName === 'synth' ? 'lead'
        : trackName === 'keyboard' ? 'organ'
          : 'piano';
}

export function createDefaultSubtractiveInstrument(
  preset: LegacySynthVoicePreset = 'piano',
  overrides?: Partial<SubtractiveTrackInstrument>,
): SubtractiveTrackInstrument {
  const base = SUBTRACTIVE_PRESET_DEFAULTS[preset];
  const settings = overrides?.settings;

  return {
    kind: 'subtractive',
    preset: overrides?.preset ?? preset,
    name: overrides?.name ?? base.name,
    settings: {
      oscillator: {
        ...base.settings.oscillator,
        ...settings?.oscillator,
      },
      ampEnvelope: cloneEnvelope(base.settings.ampEnvelope, settings?.ampEnvelope),
      filter: {
        ...base.settings.filter,
        ...settings?.filter,
      },
      filterEnvelope: {
        ...base.settings.filterEnvelope,
        ...settings?.filterEnvelope,
      },
      lfo: {
        ...base.settings.lfo,
        ...settings?.lfo,
      },
      unison: {
        ...base.settings.unison,
        ...settings?.unison,
      },
      glideTime: settings?.glideTime ?? base.settings.glideTime,
      outputGain: settings?.outputGain ?? base.settings.outputGain,
    },
  };
}

export function createDefaultSamplerInstrument(
  overrides?: Partial<SamplerTrackInstrument['settings']> & { name?: string },
): SamplerTrackInstrument {
  const sampleDuration = overrides?.sampleDuration
    ?? overrides?.trimEnd
    ?? overrides?.loopEnd
    ?? 1;

  return {
    kind: 'sampler',
    preset: 'sampler',
    name: overrides?.name ?? overrides?.sampleName ?? 'Quick Sampler',
    settings: {
      audioKey: overrides?.audioKey,
      sampleName: overrides?.sampleName,
      rootNote: overrides?.rootNote ?? 60,
      sampleDuration,
      trimStart: overrides?.trimStart ?? 0,
      trimEnd: overrides?.trimEnd ?? sampleDuration,
      playbackMode: overrides?.playbackMode ?? 'classic',
      loopStart: overrides?.loopStart ?? 0,
      loopEnd: overrides?.loopEnd ?? sampleDuration,
      ampEnvelope: cloneEnvelope(DEFAULT_AMP_ENVELOPE, overrides?.ampEnvelope),
    },
  };
}

export function createDefaultFmInstrument(
  overrides?: Partial<FmTrackInstrument>,
): FmTrackInstrument {
  const settings = overrides?.settings;

  return {
    kind: 'fm',
    preset: 'fm',
    name: overrides?.name ?? 'FM Init',
    fallbackPreset: overrides?.fallbackPreset ?? 'lead',
    settings: {
      carrier: {
        waveform: settings?.carrier?.waveform ?? 'sine',
        ratio: settings?.carrier?.ratio ?? 1,
        level: settings?.carrier?.level ?? 1,
      },
      modulator: {
        waveform: settings?.modulator?.waveform ?? 'sine',
        ratio: settings?.modulator?.ratio ?? 2,
        level: settings?.modulator?.level ?? 0.75,
      },
      modulationIndex: settings?.modulationIndex ?? 2,
      harmonicity: settings?.harmonicity ?? 2,
      feedback: settings?.feedback ?? 0,
      algorithm: settings?.algorithm ?? 'serial',
      ampEnvelope: cloneEnvelope(DEFAULT_AMP_ENVELOPE, settings?.ampEnvelope),
      outputGain: settings?.outputGain ?? 0,
    },
  };
}

function buildSamplerInstrumentFromLegacy(input: TrackInstrumentSyncInput): SamplerTrackInstrument {
  const sampleDuration = input.sampler?.sampleDuration
    ?? input.samplerConfig?.trimEnd
    ?? input.samplerConfig?.loopEnd
    ?? 1;

  return createDefaultSamplerInstrument({
    audioKey: input.samplerConfig?.audioKey ?? input.sampler?.audioKey,
    sampleName: input.sampler?.sampleName,
    rootNote: input.samplerConfig?.rootNote ?? input.sampler?.rootNote ?? 60,
    sampleDuration,
    trimStart: input.samplerConfig?.trimStart ?? 0,
    trimEnd: input.samplerConfig?.trimEnd ?? sampleDuration,
    playbackMode: input.samplerConfig?.playbackMode ?? 'classic',
    loopStart: input.samplerConfig?.loopStart ?? 0,
    loopEnd: input.samplerConfig?.loopEnd ?? sampleDuration,
    ampEnvelope: {
      attack: input.samplerConfig?.attack ?? DEFAULT_AMP_ENVELOPE.attack,
      decay: input.samplerConfig?.decay ?? DEFAULT_AMP_ENVELOPE.decay,
      sustain: input.samplerConfig?.sustain ?? DEFAULT_AMP_ENVELOPE.sustain,
      release: input.samplerConfig?.release ?? DEFAULT_AMP_ENVELOPE.release,
    },
  });
}

function buildLegacySamplerState(instrument: SamplerTrackInstrument): Pick<Track, 'sampler' | 'samplerConfig'> {
  const { settings } = instrument;
  const sampleDuration = settings.sampleDuration
    ?? settings.trimEnd
    ?? settings.loopEnd;
  const hasSamplerSource = Boolean(settings.audioKey);
  const audioKey = settings.audioKey;

  const sampler: SamplerSettings | undefined = hasSamplerSource
    ? {
        audioKey: audioKey!,
        sampleName: settings.sampleName,
        rootNote: settings.rootNote,
        sampleDuration,
      }
    : undefined;

  const samplerConfig: SamplerConfig | undefined = hasSamplerSource
    ? {
        audioKey: audioKey!,
        rootNote: settings.rootNote,
        trimStart: settings.trimStart,
        trimEnd: settings.trimEnd,
        playbackMode: settings.playbackMode,
        loopStart: settings.loopStart,
        loopEnd: settings.loopEnd,
        attack: settings.ampEnvelope.attack,
        decay: settings.ampEnvelope.decay,
        sustain: settings.ampEnvelope.sustain,
        release: settings.ampEnvelope.release,
      }
    : undefined;

  return { sampler, samplerConfig };
}

export function getLegacySynthPresetFromInstrument(instrument: TrackInstrument): SynthPreset {
  switch (instrument.kind) {
    case 'sampler':
      return 'sampler';
    case 'fm':
      return instrument.fallbackPreset;
    case 'wavetable':
      return instrument.fallbackPreset;
    case 'subtractive':
    default:
      return instrument.preset;
  }
}

function normalizeExistingInstrument(
  input: TrackInstrumentSyncInput,
  instrument: TrackInstrument,
): TrackInstrument {
  switch (instrument.kind) {
    case 'sampler':
      return createDefaultSamplerInstrument({
        ...buildSamplerInstrumentFromLegacy(input).settings,
        ...instrument.settings,
        name: instrument.name,
      });
    case 'fm':
      return createDefaultFmInstrument(instrument);
    case 'wavetable':
      return instrument;
    case 'subtractive':
    default:
      return createDefaultSubtractiveInstrument(instrument.preset, instrument);
  }
}

function shouldKeepInstrumentModel(input: TrackInstrumentSyncInput): boolean {
  return input.trackType === 'pianoRoll'
    || Boolean(input.instrument)
    || input.synthPreset === 'sampler'
    || Boolean(input.sampler)
    || Boolean(input.samplerConfig);
}

export function syncTrackInstrumentState(input: TrackInstrumentSyncInput): TrackInstrumentSyncState {
  if (!shouldKeepInstrumentModel(input)) {
    return {
      instrument: undefined,
      synthPreset: input.synthPreset,
      sampler: input.sampler,
      samplerConfig: input.samplerConfig,
    };
  }

  const instrument = input.instrument
    ? normalizeExistingInstrument(input, input.instrument)
    : (
        input.synthPreset === 'sampler' || input.sampler || input.samplerConfig
          ? buildSamplerInstrumentFromLegacy(input)
          : createDefaultSubtractiveInstrument(
              (input.synthPreset ?? getDefaultTrackInstrumentPreset(input.trackName)) as LegacySynthVoicePreset,
            )
      );

  if (instrument.kind === 'sampler') {
    return {
      instrument,
      synthPreset: 'sampler',
      ...buildLegacySamplerState(instrument),
    };
  }

  return {
    instrument,
    synthPreset: getLegacySynthPresetFromInstrument(instrument),
    sampler: undefined,
    samplerConfig: undefined,
  };
}
