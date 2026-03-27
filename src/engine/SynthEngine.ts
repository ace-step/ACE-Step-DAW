import * as Tone from 'tone';
import type {
  FmTrackInstrument,
  InstrumentLfoTarget,
  LegacySynthVoicePreset,
  SubtractiveTrackInstrument,
  SynthPreset,
  TrackInstrument,
} from '../types/project';
import {
  createDefaultSubtractiveInstrument,
  getLegacySynthPresetFromInstrument,
} from '../utils/trackInstrument';

type SynthSource = TrackInstrument | SynthPreset;
type RuntimeInstrument = SubtractiveTrackInstrument | FmTrackInstrument;
type SynthVoiceType = 'mono' | 'fm';
type SynthModulationEffectType = 'tremolo' | 'autoPanner' | 'autoFilter' | 'vibrato';
const DEFAULT_TRACK_GAIN = 0.55;
const MIN_LINEAR_GAIN = 0.0001;
const MAX_FAT_SPREAD_CENTS = 120;

interface RuntimeModulationRack {
  node: Tone.ToneAudioNode;
  retriggerOnNote: boolean;
  restart: () => void;
  dispose: () => void;
}

interface SynthInstance {
  synth: Tone.PolySynth;
  signature: string;
  gain: Tone.Gain;
  modulation: RuntimeModulationRack | null;
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function linearGainToDb(value: number): number {
  return 20 * Math.log10(Math.max(MIN_LINEAR_GAIN, value));
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
        restart: () => {
          if (!spec.retrigger) return;
          const now = Tone.now();
          node.stop(now);
          node.start(now + 0.001);
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
        restart: () => {
          if (!spec.retrigger) return;
          const now = Tone.now();
          node.stop(now);
          node.start(now + 0.001);
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
        restart: () => {
          if (!spec.retrigger) return;
          const now = Tone.now();
          node.stop(now);
          node.start(now + 0.001);
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

function connectSynthChain(
  synth: Tone.PolySynth,
  modulation: RuntimeModulationRack | null,
  gain: Tone.Gain,
  connectTo?: Tone.InputNode,
) {
  if (modulation) {
    synth.connect(modulation.node);
    modulation.node.connect(gain);
  } else {
    synth.connect(gain);
  }

  if (connectTo) {
    gain.connect(connectTo);
  } else {
    gain.toDestination();
  }
}

function restartModulation(instance: SynthInstance | null | undefined) {
  if (!instance?.modulation?.retriggerOnNote) return;
  instance.modulation.restart();
}

function disposeSynthInstance(instance: SynthInstance) {
  instance.synth.releaseAll();
  instance.synth.dispose();
  instance.modulation?.dispose();
  instance.gain.dispose();
}

class SynthEngine {
  private synths = new Map<string, SynthInstance>();
  private previewSynth: Tone.PolySynth | null = null;
  private previewGain: Tone.Gain | null = null;
  private previewModulation: RuntimeModulationRack | null = null;
  private previewSignature: string | null = null;

  async ensureStarted() {
    if (Tone.getContext().state !== 'running') {
      await Tone.start();
    }
  }

  ensureTrackSynth(trackId: string, source: SynthSource, connectTo?: Tone.InputNode): Tone.PolySynth {
    const signature = getSynthSignature(source);
    const existing = this.synths.get(trackId);
    if (existing && existing.signature === signature) return existing.synth;

    if (existing) {
      disposeSynthInstance(existing);
    }

    const spec = createSynthRuntimeSpec(source);
    const synth = createSynthForSource(source);
    const modulation = createRuntimeModulationRack(source);
    const gain = new Tone.Gain(spec.gainLevel);
    connectSynthChain(synth, modulation, gain, connectTo);
    this.synths.set(trackId, { synth, signature, gain, modulation });
    return synth;
  }

  getSynth(trackId: string): Tone.PolySynth | null {
    return this.synths.get(trackId)?.synth ?? null;
  }

  async previewNote(pitch: number, velocity = 100, duration = 0.3, source: SynthSource = 'piano') {
    await this.ensureStarted();
    const signature = getSynthSignature(source);

    if (!this.previewSynth || !this.previewGain || this.previewSignature !== signature) {
      this.previewSynth?.dispose();
      this.previewModulation?.dispose();
      this.previewGain?.dispose();
      const spec = createSynthRuntimeSpec(source);
      this.previewSynth = createSynthForSource(source);
      this.previewModulation = createRuntimeModulationRack(source);
      this.previewGain = new Tone.Gain(Math.max(0, Math.min(1, spec.gainLevel * 0.55)));
      connectSynthChain(this.previewSynth, this.previewModulation, this.previewGain);
      this.previewSignature = signature;
    }
    const freq = Tone.Frequency(pitch, 'midi').toFrequency();
    if (this.previewModulation?.retriggerOnNote) {
      this.previewModulation.restart();
    }
    this.previewSynth.triggerAttackRelease(freq, duration, undefined, velocity / 127);
  }

  async playNote(trackId: string, pitch: number, velocity: number, duration: number, source: SynthSource) {
    await this.ensureStarted();
    const synth = this.ensureTrackSynth(trackId, source);
    restartModulation(this.synths.get(trackId));
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
    const synth = this.ensureTrackSynth(trackId, source) as unknown as {
      set: (options: Record<string, unknown>) => void;
      triggerAttack: (note: number, time?: string | number, velocity?: number) => void;
      triggerRelease: (note: number, time?: string | number) => void;
      triggerAttackRelease: (note: number, duration: number, time?: string | number, velocity?: number) => void;
    };
    restartModulation(this.synths.get(trackId));
    const glideTime = Math.max(0.03, Math.min(0.12, duration * 0.35));
    const fromFreq = Tone.Frequency(fromPitch, 'midi').toFrequency();
    const toFreq = Tone.Frequency(toPitch, 'midi').toFrequency();
    synth.set({ portamento: glideTime });
    synth.triggerAttack(fromFreq, undefined, velocity / 127);
    synth.triggerRelease(fromFreq, `+${glideTime}`);
    synth.triggerAttackRelease(toFreq, Math.max(0.04, duration), `+${glideTime}`, velocity / 127);
  }

  /** Trigger note on for a track synth (for live playing / recording). */
  noteOn(trackId: string, pitch: number, velocity = 100) {
    const instance = this.synths.get(trackId);
    if (!instance) return;
    restartModulation(instance);
    const freq = Tone.Frequency(pitch, 'midi').toFrequency();
    instance.synth.triggerAttack(freq, undefined, velocity / 127);
  }

  /** Trigger note off for a track synth. */
  noteOff(trackId: string, pitch: number) {
    const instance = this.synths.get(trackId);
    if (!instance) return;
    const freq = Tone.Frequency(pitch, 'midi').toFrequency();
    instance.synth.triggerRelease(freq);
  }

  /** Release all currently sounding notes on all track synths. */
  releaseAll() {
    for (const instance of this.synths.values()) {
      instance.synth.releaseAll();
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
    this.previewSynth?.dispose();
    this.previewModulation?.dispose();
    this.previewGain?.dispose();
    this.previewSynth = null;
    this.previewModulation = null;
    this.previewGain = null;
    this.previewSignature = null;
  }
}

export const synthEngine = new SynthEngine();
