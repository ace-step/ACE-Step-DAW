import * as Tone from 'tone';
import type {
  FmTrackInstrument,
  InstrumentLfoTarget,
  LegacySynthVoicePreset,
  MidiNote,
  SubtractiveTrackInstrument,
  SynthPreset,
  TrackInstrument,
} from '../types/project';
import {
  createDefaultSubtractiveInstrument,
  getLegacySynthPresetFromInstrument,
} from '../utils/trackInstrument';

export type SynthSource = TrackInstrument | SynthPreset;
type RuntimeInstrument = SubtractiveTrackInstrument | FmTrackInstrument;
type SynthVoiceType = 'mono' | 'fm';
type SynthCharacterEffectType = 'distortion';
type SynthModulationEffectType = 'tremolo' | 'autoPanner' | 'autoFilter' | 'vibrato';
const DEFAULT_TRACK_GAIN = 0.55;
const MIN_LINEAR_GAIN = 0.0001;
const MAX_FAT_SPREAD_CENTS = 120;

type SlidePlaybackSynth = {
  set: (options: Record<string, unknown>) => void;
  triggerAttack: (note: number, time?: string | number, velocity?: number) => void;
  triggerRelease: (note: number, time?: string | number) => void;
  triggerAttackRelease: (note: number, duration: number, time?: string | number, velocity?: number) => void;
};

interface RuntimeModulationRack {
  node: Tone.ToneAudioNode;
  retriggerOnNote: boolean;
  restart: (time?: number) => void;
  dispose: () => void;
}

interface RuntimeCharacterRack {
  input: Tone.ToneAudioNode;
  output: Tone.ToneAudioNode;
  dispose: () => void;
}

export interface SynthPlaybackChain {
  synth: Tone.PolySynth;
  gain: Tone.Gain;
  restartModulation: (time?: number) => void;
  dispose: () => void;
}

interface SynthInstance {
  playback: SynthPlaybackChain;
  signature: string;
}

export interface SynthRuntimeSpec {
  engine: 'subtractive' | 'fm';
  voiceType: SynthVoiceType;
  options: Record<string, unknown>;
  gainLevel: number;
}

export interface SynthModulationSpec {
  target: Exclude<InstrumentLfoTarget, 'off'>;
  effectType: SynthModulationEffectType;
  frequencyHz: number;
  depth: number;
  retrigger: boolean;
  options: Record<string, unknown>;
}

export interface SynthCharacterSpec {
  effectType: SynthCharacterEffectType;
  drive: number;
  amount: number;
  wet: number;
  preGain: number;
  outputTrim: number;
}

interface CreateSynthPlaybackChainOptions {
  gainScale?: number;
  connectTo?: Tone.InputNode;
  routeToDestination?: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function linearGainToDb(value: number): number {
  return 20 * Math.log10(Math.max(MIN_LINEAR_GAIN, value));
}

function getLegacySlidePortamentoSeconds(duration: number): number {
  return Math.max(0.03, Math.min(0.12, duration * 0.35));
}

function toLegacySubtractivePreset(preset: SynthPreset): LegacySynthVoicePreset {
  return preset === 'sampler' ? 'piano' : preset;
}

function resolveSubtractiveInstrument(source: SynthSource): SubtractiveTrackInstrument {
  if (typeof source === 'string') {
    return createDefaultSubtractiveInstrument(toLegacySubtractivePreset(source));
  }

  if (source.kind === 'subtractive') return source;

  return createDefaultSubtractiveInstrument(
    toLegacySubtractivePreset(getLegacySynthPresetFromInstrument(source)),
  );
}

function getSynthSignature(source: SynthSource): string {
  return typeof source === 'string'
    ? `preset:${source}`
    : `instrument:${JSON.stringify(source)}`;
}

function getTrackGainLevel(instrument: RuntimeInstrument, baseGain = DEFAULT_TRACK_GAIN): number {
  const outputGainScale = Math.pow(10, instrument.settings.outputGain / 20);
  return Math.max(0, Math.min(2, baseGain * outputGainScale));
}

function getFatOscillatorType(waveform: SubtractiveTrackInstrument['settings']['oscillator']['waveform']) {
  return `fat${waveform}` as const;
}

function resolveSubtractiveLfoInstrument(source: SynthSource): SubtractiveTrackInstrument | null {
  return typeof source !== 'string' && source.kind === 'subtractive' ? source : null;
}

function createSubtractiveRuntimeSpec(instrument: SubtractiveTrackInstrument): SynthRuntimeSpec {
  const { oscillator, ampEnvelope, filter, filterEnvelope, unison, glideTime } = instrument.settings;
  const unisonVoices = Math.max(1, Math.round(unison.voices));
  const filterEnabled = filter.enabled;
  const filterCutoff = filterEnabled ? clamp(filter.cutoffHz, 40, 18000) : 20000;
  const filterAmount = clamp(filterEnvelope.amount, 0, 1);
  const oscillatorType = unisonVoices > 1
    ? getFatOscillatorType(oscillator.waveform)
    : oscillator.waveform;
  const oscillatorOptions = unisonVoices > 1
    ? {
        type: oscillatorType,
        count: unisonVoices,
        spread: clamp(unison.detuneCents + (unison.stereoSpread * 40), 1, MAX_FAT_SPREAD_CENTS),
      }
    : {
        type: oscillatorType,
      };
  const filterBaseFrequency = filterEnabled
    ? Math.max(30, filterCutoff * Math.max(0.06, 1 - filterAmount))
    : 20000;
  const filterOctaves = filterEnabled
    ? clamp((filterAmount * 6) + (filter.keyTracking * 2), 0, 8)
    : 0;
  const voiceLevel = clamp(
    oscillator.level * (0.6 + (unison.blend * 0.4)),
    MIN_LINEAR_GAIN,
    1.25,
  );

  return {
    engine: 'subtractive',
    voiceType: 'mono',
    gainLevel: getTrackGainLevel(instrument),
    options: {
      oscillator: oscillatorOptions,
      envelope: {
        attack: ampEnvelope.attack,
        decay: ampEnvelope.decay,
        sustain: ampEnvelope.sustain,
        release: ampEnvelope.release,
      },
      filter: {
        type: filter.type,
        frequency: filterCutoff,
        Q: clamp(filter.resonance, 0.1, 20),
        gain: clamp(filter.drive * 12, 0, 12),
      },
      filterEnvelope: {
        attack: filterEnvelope.attack,
        decay: filterEnvelope.decay,
        sustain: filterEnvelope.sustain,
        release: filterEnvelope.release,
        baseFrequency: filterBaseFrequency,
        octaves: filterOctaves,
        exponent: 1 + (filter.drive * 2),
      },
      detune: (oscillator.octave * 1200) + oscillator.detuneCents,
      portamento: glideTime,
      volume: linearGainToDb(voiceLevel),
    },
  };
}

function createFmRuntimeSpec(instrument: FmTrackInstrument): SynthRuntimeSpec {
  const { carrier, modulator, modulationIndex, feedback, ampEnvelope } = instrument.settings;
  const harmonicity = clamp(modulator.ratio / Math.max(0.25, carrier.ratio), 0.25, 8);
  const carrierDetune = 1200 * Math.log2(Math.max(0.25, carrier.ratio));
  const effectiveModulationIndex = clamp(
    (modulationIndex * (0.4 + (modulator.level * 0.9))) + (feedback * 2),
    0,
    20,
  );

  return {
    engine: 'fm',
    voiceType: 'fm',
    gainLevel: getTrackGainLevel(instrument),
    options: {
      oscillator: {
        type: carrier.waveform,
      },
      modulation: {
        type: modulator.waveform,
      },
      envelope: {
        attack: ampEnvelope.attack,
        decay: ampEnvelope.decay,
        sustain: ampEnvelope.sustain,
        release: ampEnvelope.release,
      },
      modulationEnvelope: {
        attack: Math.max(0.001, ampEnvelope.attack * 0.8),
        decay: Math.max(0.01, ampEnvelope.decay),
        sustain: clamp(modulator.level, 0, 1),
        release: ampEnvelope.release,
      },
      harmonicity,
      modulationIndex: effectiveModulationIndex,
      detune: carrierDetune,
      volume: linearGainToDb(clamp(carrier.level, MIN_LINEAR_GAIN, 1.25)),
    },
  };
}

export function createSynthRuntimeSpec(source: SynthSource): SynthRuntimeSpec {
  if (typeof source === 'string') {
    return createSubtractiveRuntimeSpec(
      createDefaultSubtractiveInstrument(toLegacySubtractivePreset(source)),
    );
  }

  if (source.kind === 'fm') {
    return createFmRuntimeSpec(source);
  }

  return createSubtractiveRuntimeSpec(resolveSubtractiveInstrument(source));
}

export function resolveSlidePortamentoSeconds(source: SynthSource, duration: number): number {
  const spec = createSynthRuntimeSpec(source);
  const configured = typeof spec.options.portamento === 'number'
    ? Math.max(0, spec.options.portamento)
    : 0;

  return configured > 0
    ? configured
    : getLegacySlidePortamentoSeconds(duration);
}

export function findSlideSourceNote(notes: MidiNote[], noteIndex: number): MidiNote | undefined {
  const note = notes[noteIndex];
  if (!note?.isSlide) return undefined;

  return notes
    .slice(0, noteIndex)
    .reverse()
    .find((candidate) => candidate.startBeat + candidate.durationBeats >= note.startBeat);
}

export function triggerSlidePlayback(
  synth: SlidePlaybackSynth,
  fromPitch: number,
  toPitch: number,
  velocity: number,
  duration: number,
  source: SynthSource,
  time?: string | number,
): number {
  const glideTime = resolveSlidePortamentoSeconds(source, duration);
  const fromFreq = Tone.Frequency(fromPitch, 'midi').toFrequency();
  const toFreq = Tone.Frequency(toPitch, 'midi').toFrequency();
  const glideAt = typeof time === 'number'
    ? time + glideTime
    : `+${glideTime}`;

  synth.set({ portamento: glideTime });
  synth.triggerAttack(fromFreq, time, velocity);
  synth.triggerRelease(fromFreq, glideAt);
  synth.triggerAttackRelease(toFreq, Math.max(0.04, duration), glideAt, velocity);

  return glideTime;
}

export function createSynthModulationSpec(source: SynthSource): SynthModulationSpec | null {
  const instrument = resolveSubtractiveLfoInstrument(source);
  if (!instrument) return null;

  const { lfo, filter } = instrument.settings;
  if (!lfo.enabled || lfo.target === 'off' || lfo.depth <= 0) return null;

  const frequencyHz = clamp(lfo.rateHz, 0.1, 20);
  const depth = clamp(lfo.depth, 0, 1);
  const common = {
    frequencyHz,
    depth,
    retrigger: lfo.retrigger,
  };

  switch (lfo.target) {
    case 'amp':
      return {
        target: 'amp',
        effectType: 'tremolo',
        ...common,
        options: {
          frequency: frequencyHz,
          depth,
          type: lfo.waveform,
          spread: 0,
        },
      };
    case 'pan':
      return {
        target: 'pan',
        effectType: 'autoPanner',
        ...common,
        options: {
          frequency: frequencyHz,
          depth,
          type: lfo.waveform,
        },
      };
    case 'pitch':
      return {
        target: 'pitch',
        effectType: 'vibrato',
        ...common,
        options: {
          frequency: frequencyHz,
          depth: clamp(depth * 0.85, 0, 1),
          type: lfo.waveform,
          maxDelay: 0.005,
        },
      };
    case 'filterCutoff': {
      if (!filter.enabled) return null;

      const cutoffHz = clamp(filter.cutoffHz, 80, 16000);
      const baseFrequency = clamp(
        cutoffHz * Math.max(0.08, 1 - (depth * 0.85)),
        40,
        16000,
      );
      const octaves = clamp((depth * 5) + (filter.keyTracking * 2), 0.25, 8);

      return {
        target: 'filterCutoff',
        effectType: 'autoFilter',
        ...common,
        options: {
          frequency: frequencyHz,
          depth,
          type: lfo.waveform,
          baseFrequency,
          octaves,
          filter: {
            type: filter.type,
            Q: clamp(filter.resonance, 0.1, 20),
          },
        },
      };
    }
  }

  return null;
}

export function createSynthCharacterSpec(source: SynthSource): SynthCharacterSpec | null {
  const instrument = typeof source !== 'string' && source.kind === 'subtractive'
    ? source
    : null;

  if (!instrument) return null;

  const { filter } = instrument.settings;
  const drive = clamp(filter.drive, 0, 1);
  if (!filter.enabled || drive <= 0.001) return null;

  return {
    effectType: 'distortion',
    drive,
    amount: clamp((drive * 0.85) + 0.05, 0.05, 0.9),
    wet: clamp(drive * 0.9, 0.05, 0.95),
    preGain: 1 + (drive * 3),
    outputTrim: clamp(1 - (drive * 0.22), 0.72, 1),
  };
}

export function createSynthForPreset(preset: SynthPreset): Tone.PolySynth {
  return createSynthForSource(preset);
}

export function createSynthForSource(source: SynthSource): Tone.PolySynth {
  const spec = createSynthRuntimeSpec(source);
  return spec.voiceType === 'fm'
    ? new Tone.PolySynth(Tone.FMSynth, spec.options as never)
    : new Tone.PolySynth(Tone.MonoSynth, spec.options as never);
}

function createRuntimeModulationRack(source: SynthSource): RuntimeModulationRack | null {
  const spec = createSynthModulationSpec(source);
  if (!spec) return null;

  switch (spec.effectType) {
    case 'tremolo': {
      const node = new Tone.Tremolo(spec.options as never);
      node.start();
      return {
        node,
        retriggerOnNote: spec.retrigger,
        restart: (time) => {
          if (!spec.retrigger) return;
          const restartAt = time ?? Tone.now();
          node.stop(restartAt);
          node.start(restartAt + 0.001);
        },
        dispose: () => node.dispose(),
      };
    }
    case 'autoPanner': {
      const node = new Tone.AutoPanner(spec.options as never);
      node.start();
      return {
        node,
        retriggerOnNote: spec.retrigger,
        restart: (time) => {
          if (!spec.retrigger) return;
          const restartAt = time ?? Tone.now();
          node.stop(restartAt);
          node.start(restartAt + 0.001);
        },
        dispose: () => node.dispose(),
      };
    }
    case 'autoFilter': {
      const node = new Tone.AutoFilter(spec.options as never);
      node.start();
      return {
        node,
        retriggerOnNote: spec.retrigger,
        restart: (time) => {
          if (!spec.retrigger) return;
          const restartAt = time ?? Tone.now();
          node.stop(restartAt);
          node.start(restartAt + 0.001);
        },
        dispose: () => node.dispose(),
      };
    }
    case 'vibrato': {
      const node = new Tone.Vibrato(spec.options as never);
      return {
        node,
        retriggerOnNote: false,
        restart: () => {},
        dispose: () => node.dispose(),
      };
    }
  }
}

function createRuntimeCharacterRack(source: SynthSource): RuntimeCharacterRack | null {
  const spec = createSynthCharacterSpec(source);
  if (!spec) return null;

  switch (spec.effectType) {
    case 'distortion': {
      const input = new Tone.Gain(spec.preGain);
      const distortion = new Tone.Distortion({
        distortion: spec.amount,
        wet: spec.wet,
      });
      const output = new Tone.Gain(spec.outputTrim);
      input.connect(distortion);
      distortion.connect(output);
      return {
        input,
        output,
        dispose: () => {
          input.dispose();
          distortion.dispose();
          output.dispose();
        },
      };
    }
  }
}

function connectSynthChain(
  synth: Tone.PolySynth,
  character: RuntimeCharacterRack | null,
  modulation: RuntimeModulationRack | null,
  gain: Tone.Gain,
  connectTo?: Tone.InputNode,
  routeToDestination: boolean = true,
) {
  const sourceNode = character?.output ?? synth;

  if (character) {
    synth.connect(character.input);
  }

  if (modulation) {
    sourceNode.connect(modulation.node);
    modulation.node.connect(gain);
  } else {
    sourceNode.connect(gain);
  }

  if (connectTo) {
    gain.connect(connectTo);
  } else if (routeToDestination) {
    gain.toDestination();
  }
}

export function createSynthPlaybackChain(
  source: SynthSource,
  options: CreateSynthPlaybackChainOptions = {},
): SynthPlaybackChain {
  const { gainScale = 1, connectTo, routeToDestination = true } = options;
  const spec = createSynthRuntimeSpec(source);
  const synth = createSynthForSource(source);
  const character = createRuntimeCharacterRack(source);
  const modulation = createRuntimeModulationRack(source);
  const gain = new Tone.Gain(Math.max(0, Math.min(2, spec.gainLevel * gainScale)));
  connectSynthChain(synth, character, modulation, gain, connectTo, routeToDestination);

  return {
    synth,
    gain,
    restartModulation: (time) => {
      if (!modulation?.retriggerOnNote) return;
      modulation.restart(time);
    },
    dispose: () => {
      synth.releaseAll();
      synth.dispose();
      character?.dispose();
      modulation?.dispose();
      gain.dispose();
    },
  };
}

function restartPlaybackModulation(instance: SynthInstance | null | undefined, time?: number) {
  instance?.playback.restartModulation(time);
}

function disposeSynthInstance(instance: SynthInstance) {
  instance.playback.dispose();
}

class SynthEngine {
  private synths = new Map<string, SynthInstance>();
  private previewPlayback: SynthPlaybackChain | null = null;
  private previewSignature: string | null = null;

  async ensureStarted() {
    if (Tone.getContext().state !== 'running') {
      await Tone.start();
    }
  }

  ensureTrackSynth(trackId: string, source: SynthSource, connectTo?: Tone.InputNode): Tone.PolySynth {
    const signature = getSynthSignature(source);
    const existing = this.synths.get(trackId);
    if (existing && existing.signature === signature) return existing.playback.synth;

    if (existing) {
      disposeSynthInstance(existing);
    }

    const playback = createSynthPlaybackChain(source, { connectTo, routeToDestination: true });
    this.synths.set(trackId, { playback, signature });
    return playback.synth;
  }

  getSynth(trackId: string): Tone.PolySynth | null {
    return this.synths.get(trackId)?.playback.synth ?? null;
  }

  async previewNote(pitch: number, velocity = 100, duration = 0.3, source: SynthSource = 'piano') {
    await this.ensureStarted();
    const signature = getSynthSignature(source);

    if (!this.previewPlayback || this.previewSignature !== signature) {
      this.previewPlayback?.dispose();
      this.previewPlayback = createSynthPlaybackChain(source, {
        gainScale: 0.55,
        routeToDestination: true,
      });
      this.previewSignature = signature;
    }
    const freq = Tone.Frequency(pitch, 'midi').toFrequency();
    this.previewPlayback.restartModulation();
    this.previewPlayback.synth.triggerAttackRelease(freq, duration, undefined, velocity / 127);
  }

  async playNote(trackId: string, pitch: number, velocity: number, duration: number, source: SynthSource) {
    await this.ensureStarted();
    const synth = this.ensureTrackSynth(trackId, source);
    restartPlaybackModulation(this.synths.get(trackId));
    const freq = Tone.Frequency(pitch, 'midi').toFrequency();
    synth.triggerAttackRelease(freq, duration, undefined, velocity / 127);
  }

  async playSlideNote(
    trackId: string,
    fromPitch: number,
    toPitch: number,
    velocity: number,
    duration: number,
    source: SynthSource,
  ) {
    await this.ensureStarted();
    const synth = this.ensureTrackSynth(trackId, source) as unknown as SlidePlaybackSynth;
    restartPlaybackModulation(this.synths.get(trackId));
    triggerSlidePlayback(
      synth,
      fromPitch,
      toPitch,
      velocity / 127,
      duration,
      source,
    );
  }

  /** Trigger note on for a track synth (for live playing / recording). */
  noteOn(trackId: string, pitch: number, velocity = 100) {
    const instance = this.synths.get(trackId);
    if (!instance) return;
    restartPlaybackModulation(instance);
    const freq = Tone.Frequency(pitch, 'midi').toFrequency();
    instance.playback.synth.triggerAttack(freq, undefined, velocity / 127);
  }

  /** Trigger note off for a track synth. */
  noteOff(trackId: string, pitch: number) {
    const instance = this.synths.get(trackId);
    if (!instance) return;
    const freq = Tone.Frequency(pitch, 'midi').toFrequency();
    instance.playback.synth.triggerRelease(freq);
  }

  /** Release all currently sounding notes on all track synths. */
  releaseAll() {
    for (const instance of this.synths.values()) {
      instance.playback.synth.releaseAll();
    }
  }

  removeTrackSynth(trackId: string) {
    const instance = this.synths.get(trackId);
    if (!instance) return;
    disposeSynthInstance(instance);
    this.synths.delete(trackId);
  }

  dispose() {
    for (const trackId of this.synths.keys()) {
      this.removeTrackSynth(trackId);
    }
    this.previewPlayback?.dispose();
    this.previewPlayback = null;
    this.previewSignature = null;
  }
}

export const synthEngine = new SynthEngine();
