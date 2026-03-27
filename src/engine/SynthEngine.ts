import * as Tone from 'tone';
import type {
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
const DEFAULT_TRACK_GAIN = 0.55;

interface SynthInstance {
  synth: Tone.PolySynth;
  signature: string;
  gain: Tone.Gain;
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

function getTrackGainLevel(instrument: SubtractiveTrackInstrument, baseGain = DEFAULT_TRACK_GAIN): number {
  const outputGainScale = Math.pow(10, instrument.settings.outputGain / 20);
  return Math.max(0, Math.min(2, baseGain * outputGainScale));
}

export function createSynthForPreset(preset: SynthPreset): Tone.PolySynth {
  return createSynthForSource(preset);
}

export function createSynthForSource(source: SynthSource): Tone.PolySynth {
  const instrument = resolveSubtractiveInstrument(source);
  const synth = new Tone.PolySynth(Tone.Synth);
  synth.set({
    oscillator: { type: instrument.settings.oscillator.waveform },
    envelope: {
      attack: instrument.settings.ampEnvelope.attack,
      decay: instrument.settings.ampEnvelope.decay,
      sustain: instrument.settings.ampEnvelope.sustain,
      release: instrument.settings.ampEnvelope.release,
    },
    portamento: instrument.settings.glideTime,
  });

  return synth;
}

class SynthEngine {
  private synths = new Map<string, SynthInstance>();
  private previewSynth: Tone.PolySynth | null = null;
  private previewGain: Tone.Gain | null = null;
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
      existing.synth.releaseAll();
      existing.synth.dispose();
      existing.gain.dispose();
    }

    const instrument = resolveSubtractiveInstrument(source);
    const synth = createSynthForSource(source);
    const gain = new Tone.Gain(getTrackGainLevel(instrument));
    synth.connect(gain);
    if (connectTo) {
      gain.connect(connectTo);
    } else {
      gain.toDestination();
    }
    this.synths.set(trackId, { synth, signature, gain });
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
      this.previewGain?.dispose();
      const instrument = resolveSubtractiveInstrument(source);
      this.previewSynth = createSynthForSource(source);
      this.previewGain = new Tone.Gain(getTrackGainLevel(instrument, 0.3)).toDestination();
      this.previewSynth.connect(this.previewGain);
      this.previewSignature = signature;
    }
    const freq = Tone.Frequency(pitch, 'midi').toFrequency();
    this.previewSynth.triggerAttackRelease(freq, duration, undefined, velocity / 127);
  }

  async playNote(trackId: string, pitch: number, velocity: number, duration: number, source: SynthSource) {
    await this.ensureStarted();
    const synth = this.ensureTrackSynth(trackId, source);
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
    instance.synth.releaseAll();
    instance.synth.dispose();
    instance.gain.dispose();
    this.synths.delete(trackId);
  }

  dispose() {
    for (const trackId of this.synths.keys()) {
      this.removeTrackSynth(trackId);
    }
    this.previewSynth?.dispose();
    this.previewGain?.dispose();
    this.previewSynth = null;
    this.previewGain = null;
    this.previewSignature = null;
  }
}

export const synthEngine = new SynthEngine();
