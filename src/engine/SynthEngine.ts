import * as Tone from 'tone';
import type { SynthPreset, FilterEnvelope, FmInstrumentSettings, UnisonSettings } from '../types/project';

interface UnisonVoice {
  synth: Tone.PolySynth;
  panner: Tone.Panner;
  gain: Tone.Gain;
}

interface SynthInstance {
  synth: Tone.PolySynth;
  preset: SynthPreset;
  gain: Tone.Gain;
  filter?: Tone.Filter;
  filterEnvelope?: Tone.FrequencyEnvelope;
}

interface FmSynthInstance {
  synth: Tone.FMSynth;
  params: FmInstrumentSettings;
  gain: Tone.Gain;
  connectTo: Tone.InputNode | undefined;
}

/**
 * Build a Tone.FMSynth configuration from FmInstrumentSettings.
 * Different algorithms map to different harmonicity / modulationIndex / envelope shapes.
 */
function buildFmSynthOptions(params: FmInstrumentSettings): Partial<Tone.FMSynthOptions> {
  const { carrier, modulator, modulationIndex, harmonicity, feedback, algorithm, ampEnvelope } = params;

  const base: Partial<Tone.FMSynthOptions> = {
    modulationIndex,
    harmonicity,
    oscillator: { type: carrier.waveform } as Tone.FMSynthOptions['oscillator'],
    modulation: { type: modulator.waveform } as Tone.FMSynthOptions['modulation'],
    envelope: {
      attack: ampEnvelope.attack,
      decay: ampEnvelope.decay,
      sustain: ampEnvelope.sustain,
      release: ampEnvelope.release,
    } as Tone.FMSynthOptions['envelope'],
  };

  // Algorithm-specific parameter mapping
  switch (algorithm) {
    case 'serial':
      // Classic: Modulator -> Carrier, standard FM
      break;

    case 'parallel':
      // Both operators as carriers: reduce modulation, boost harmonicity
      base.modulationIndex = modulationIndex * 0.3;
      break;

    case 'stack':
      // Two modulators feeding one carrier: increase modulation depth
      base.modulationIndex = modulationIndex * 1.5;
      base.harmonicity = harmonicity * 0.5;
      break;

    case 'feedback':
      // Modulator self-feedback: boost modulation with feedback factor
      base.modulationIndex = modulationIndex * (1 + feedback);
      break;
  }

  return base;
}

/** Check whether two FmInstrumentSettings are identical. */
function fmParamsEqual(a: FmInstrumentSettings, b: FmInstrumentSettings): boolean {
  return (
    a.modulationIndex === b.modulationIndex &&
    a.harmonicity === b.harmonicity &&
    a.feedback === b.feedback &&
    a.algorithm === b.algorithm &&
    a.outputGain === b.outputGain &&
    a.carrier.waveform === b.carrier.waveform &&
    a.carrier.ratio === b.carrier.ratio &&
    a.carrier.level === b.carrier.level &&
    a.modulator.waveform === b.modulator.waveform &&
    a.modulator.ratio === b.modulator.ratio &&
    a.modulator.level === b.modulator.level &&
    a.ampEnvelope.attack === b.ampEnvelope.attack &&
    a.ampEnvelope.decay === b.ampEnvelope.decay &&
    a.ampEnvelope.sustain === b.ampEnvelope.sustain &&
    a.ampEnvelope.release === b.ampEnvelope.release
  );
}

/**
 * @deprecated Use {@link InstrumentEngine} via {@link getEngineForInstrument} instead.
 * This function will be removed once all call-sites migrate to the unified interface.
 */
export function createSynthForPreset(preset: SynthPreset): Tone.PolySynth {
  const synth = new Tone.PolySynth(Tone.Synth);

  switch (preset) {
    case 'piano':
      synth.set({
        oscillator: { type: 'triangle8' },
        envelope: { attack: 0.005, decay: 0.3, sustain: 0.2, release: 1.2 },
      });
      break;
    case 'strings':
      synth.set({
        oscillator: { type: 'sawtooth' },
        envelope: { attack: 0.4, decay: 0.2, sustain: 0.8, release: 1.5 },
      });
      break;
    case 'pad':
      synth.set({
        oscillator: { type: 'sine' },
        envelope: { attack: 0.8, decay: 0.5, sustain: 0.9, release: 2.0 },
      });
      break;
    case 'lead':
      synth.set({
        oscillator: { type: 'square' },
        envelope: { attack: 0.01, decay: 0.1, sustain: 0.6, release: 0.3 },
      });
      break;
    case 'bass':
      synth.set({
        oscillator: { type: 'sawtooth' },
        envelope: { attack: 0.01, decay: 0.2, sustain: 0.4, release: 0.5 },
      });
      break;
    case 'organ':
      synth.set({
        oscillator: { type: 'sine' },
        envelope: { attack: 0.01, decay: 0.01, sustain: 1, release: 0.1 },
      });
      break;
  }

  return synth;
}

/**
 * Compute the detune and pan offsets for each extra unison voice.
 * Voices are spread symmetrically: e.g. for 4 total voices (3 extra),
 * detune offsets are [-detune, 0, +detune] and pan is spread accordingly.
 */
function computeUnisonOffsets(
  extraVoiceCount: number,
  detuneCents: number,
  spread: number,
): Array<{ detune: number; pan: number }> {
  if (extraVoiceCount <= 0) return [];
  const offsets: Array<{ detune: number; pan: number }> = [];
  for (let i = 0; i < extraVoiceCount; i++) {
    // Map i to a position in [-1, 1] across extra voices
    const t = extraVoiceCount === 1 ? 0 : (2 * i) / (extraVoiceCount - 1) - 1;
    offsets.push({
      detune: t * detuneCents,
      pan: t * spread,
    });
  }
  return offsets;
}

/**
 * @deprecated Use {@link InstrumentEngine} via {@link getEngineForInstrument} instead.
 * This class will be removed once all call-sites migrate to the unified interface.
 */
class SynthEngine {
  private synths = new Map<string, SynthInstance>();
  private fmSynths = new Map<string, FmSynthInstance>();
  private unisonVoices = new Map<string, UnisonVoice[]>();
  private previewSynth: Tone.PolySynth | null = null;
  private previewGain: Tone.Gain | null = null;

  async ensureStarted() {
    if (Tone.getContext().state !== 'running') {
      await Tone.start();
    }
  }

  ensureTrackSynth(trackId: string, preset: SynthPreset, connectTo?: Tone.InputNode): Tone.PolySynth {
    const existing = this.synths.get(trackId);
    if (existing && existing.preset === preset) return existing.synth;

    if (existing) {
      existing.synth.releaseAll();
      existing.synth.dispose();
      existing.gain.dispose();
      existing.filter?.dispose();
      existing.filterEnvelope?.dispose();
    }

    const synth = createSynthForPreset(preset);
    const gain = new Tone.Gain(0.55);
    synth.connect(gain);
    if (connectTo) {
      gain.connect(connectTo);
    } else {
      gain.toDestination();
    }
    this.synths.set(trackId, { synth, preset, gain });
    return synth;
  }

  /**
   * Apply a filter envelope to a track's synth signal chain.
   * Inserts a Tone.Filter between synth and gain, controlled by a FrequencyEnvelope.
   * Pass null to remove the filter envelope.
   */
  setFilterEnvelope(trackId: string, envelope: FilterEnvelope | null): void {
    const instance = this.synths.get(trackId);
    if (!instance) return;

    // Clean up existing filter envelope
    if (instance.filterEnvelope) {
      instance.filterEnvelope.dispose();
      instance.filterEnvelope = undefined;
    }
    if (instance.filter) {
      // Reconnect synth directly to gain
      instance.synth.disconnect();
      instance.filter.dispose();
      instance.filter = undefined;
      instance.synth.connect(instance.gain);
    }

    if (!envelope) return;

    // Create filter and frequency envelope
    const filter = new Tone.Filter({
      type: 'lowpass',
      frequency: envelope.baseFrequency,
      Q: 2,
    });

    const freqEnv = new Tone.FrequencyEnvelope({
      attack: envelope.attack,
      decay: envelope.decay,
      sustain: envelope.sustain,
      release: envelope.release,
      baseFrequency: envelope.baseFrequency,
      octaves: envelope.octaves,
    });

    // Connect frequency envelope output to the filter's frequency param
    freqEnv.connect(filter.frequency);

    // Re-route: synth -> filter -> gain
    instance.synth.disconnect();
    instance.synth.connect(filter);
    filter.connect(instance.gain);

    instance.filter = filter;
    instance.filterEnvelope = freqEnv;
  }

  /** Get the filter envelope node for a track (for triggering). */
  getFilterEnvelope(trackId: string): Tone.FrequencyEnvelope | undefined {
    return this.synths.get(trackId)?.filterEnvelope;
  }

  getSynth(trackId: string): Tone.PolySynth | null {
    return this.synths.get(trackId)?.synth ?? null;
  }

  /** Create or retrieve an FM synth for a track. Reuses existing instance when params match. */
  ensureFmSynth(trackId: string, params: FmInstrumentSettings, connectTo?: Tone.InputNode): Tone.FMSynth {
    const existing = this.fmSynths.get(trackId);
    if (existing && fmParamsEqual(existing.params, params)) {
      // Reconnect gain if the output node has changed.
      if (connectTo && connectTo !== existing.connectTo) {
        existing.gain.disconnect();
        existing.gain.connect(connectTo);
        existing.connectTo = connectTo;
      }
      return existing.synth;
    }

    if (existing) {
      existing.synth.dispose();
      existing.gain.dispose();
    }

    const synth = new Tone.FMSynth();
    const options = buildFmSynthOptions(params);
    synth.set(options);

    const gain = new Tone.Gain(params.outputGain ?? 0.55);
    synth.connect(gain);
    if (connectTo) {
      gain.connect(connectTo);
    } else {
      gain.toDestination();
    }
    this.fmSynths.set(trackId, { synth, params, gain, connectTo });
    return synth;
  }

  /** Retrieve an existing FM synth for a track, or null. */
  getFmSynth(trackId: string): Tone.FMSynth | null {
    return this.fmSynths.get(trackId)?.synth ?? null;
  }

  /** Remove and dispose an FM synth for a track. */
  removeFmSynth(trackId: string) {
    const instance = this.fmSynths.get(trackId);
    if (!instance) return;
    instance.synth.dispose();
    instance.gain.dispose();
    this.fmSynths.delete(trackId);
  }

  /** Get the extra unison voices for a track (does not include the main synth). */
  getUnisonVoices(trackId: string): UnisonVoice[] {
    return this.unisonVoices.get(trackId) ?? [];
  }

  /** Apply unison voice stacking. Creates/removes extra detuned synth voices. */
  applyUnison(trackId: string, settings: UnisonSettings): void {
    const instance = this.synths.get(trackId);
    if (!instance) return;

    // Dispose existing unison voices
    this.disposeUnisonVoices(trackId);

    const extraCount = Math.max(0, settings.voices - 1);
    if (extraCount === 0) return;

    const offsets = computeUnisonOffsets(extraCount, settings.detune, settings.spread);
    const voices: UnisonVoice[] = [];

    // Reduce main voice gain to compensate for added voices
    const perVoiceGain = 0.55 / (extraCount + 1);
    instance.gain.gain.value = perVoiceGain;

    for (const offset of offsets) {
      const synth = createSynthForPreset(instance.preset);
      synth.set({ detune: offset.detune });
      const panner = new Tone.Panner(offset.pan);
      const gain = new Tone.Gain(perVoiceGain);
      synth.connect(gain);
      gain.connect(panner);
      panner.toDestination();
      voices.push({ synth, panner, gain });
    }

    this.unisonVoices.set(trackId, voices);
  }

  private disposeUnisonVoices(trackId: string): void {
    const voices = this.unisonVoices.get(trackId);
    if (!voices) return;
    for (const voice of voices) {
      voice.synth.releaseAll();
      voice.synth.dispose();
      voice.panner.dispose();
      voice.gain.dispose();
    }
    this.unisonVoices.delete(trackId);
  }

  async previewNote(pitch: number, velocity = 100, duration = 0.3, preset: SynthPreset = 'piano') {
    await this.ensureStarted();
    if (!this.previewSynth || !this.previewGain) {
      this.previewSynth = createSynthForPreset(preset);
      this.previewGain = new Tone.Gain(0.3).toDestination();
      this.previewSynth.connect(this.previewGain);
    }
    const freq = Tone.Frequency(pitch, 'midi').toFrequency();
    this.previewSynth.triggerAttackRelease(freq, duration, undefined, velocity / 127);
  }

  async playNote(trackId: string, pitch: number, velocity: number, duration: number, preset: SynthPreset) {
    await this.ensureStarted();
    const synth = this.ensureTrackSynth(trackId, preset);
    const freq = Tone.Frequency(pitch, 'midi').toFrequency();
    // Trigger filter envelope if present
    const filterEnv = this.synths.get(trackId)?.filterEnvelope;
    if (filterEnv) {
      filterEnv.triggerAttackRelease(duration);
    }
    synth.triggerAttackRelease(freq, duration, undefined, velocity / 127);

    // Trigger unison voices too
    const voices = this.unisonVoices.get(trackId);
    if (voices) {
      for (const voice of voices) {
        voice.synth.triggerAttackRelease(freq, duration, undefined, velocity / 127);
      }
    }
  }

  async playSlideNote(
    trackId: string,
    fromPitch: number,
    toPitch: number,
    velocity: number,
    duration: number,
    preset: SynthPreset,
  ) {
    await this.ensureStarted();
    const synth = this.ensureTrackSynth(trackId, preset) as unknown as {
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
    // Trigger filter envelope for slide note
    const filterEnv = this.synths.get(trackId)?.filterEnvelope;
    if (filterEnv) {
      filterEnv.triggerAttackRelease(Math.max(0.04, duration) + glideTime);
    }
    synth.triggerAttackRelease(toFreq, Math.max(0.04, duration), `+${glideTime}`, velocity / 127);
  }

  /** Trigger note on for a track synth (for live playing / recording). */
  noteOn(trackId: string, pitch: number, velocity = 100) {
    const instance = this.synths.get(trackId);
    if (!instance) return;
    const freq = Tone.Frequency(pitch, 'midi').toFrequency();
    // Trigger filter envelope attack
    instance.filterEnvelope?.triggerAttack();
    instance.synth.triggerAttack(freq, undefined, velocity / 127);

    // Trigger unison voices too
    const voices = this.unisonVoices.get(trackId);
    if (voices) {
      for (const voice of voices) {
        voice.synth.triggerAttack(freq, undefined, velocity / 127);
      }
    }
  }

  /** Trigger note off for a track synth. */
  noteOff(trackId: string, pitch: number) {
    const instance = this.synths.get(trackId);
    if (!instance) return;
    const freq = Tone.Frequency(pitch, 'midi').toFrequency();
    // Trigger filter envelope release
    instance.filterEnvelope?.triggerRelease();
    instance.synth.triggerRelease(freq);

    // Release unison voices too
    const voices = this.unisonVoices.get(trackId);
    if (voices) {
      for (const voice of voices) {
        voice.synth.triggerRelease(freq);
      }
    }
  }

  /** Release all currently sounding notes on all track synths (subtractive + FM). */
  releaseAll() {
    for (const instance of this.synths.values()) {
      instance.filterEnvelope?.triggerRelease();
      instance.synth.releaseAll();
    }
    for (const voices of this.unisonVoices.values()) {
      for (const voice of voices) {
        voice.synth.releaseAll();
      }
    }
    for (const instance of this.fmSynths.values()) {
      instance.synth.triggerRelease();
    }
  }

  /**
   * Update the oscillator waveform on a live synth instance.
   * Falls back to base type if a partial type (e.g. 'triangle8') was set by preset.
   */
  setOscillatorType(trackId: string, type: 'sine' | 'triangle' | 'sawtooth' | 'square'): void {
    const instance = this.synths.get(trackId);
    if (!instance) return;
    instance.synth.set({ oscillator: { type } });
    // Also update unison voices
    const voices = this.unisonVoices.get(trackId);
    if (voices) {
      for (const voice of voices) {
        voice.synth.set({ oscillator: { type } });
      }
    }
  }

  /** Update the amplitude envelope on a live synth instance. */
  setEnvelope(trackId: string, envelope: { attack?: number; decay?: number; sustain?: number; release?: number }): void {
    const instance = this.synths.get(trackId);
    if (!instance) return;
    instance.synth.set({ envelope });
    const voices = this.unisonVoices.get(trackId);
    if (voices) {
      for (const voice of voices) {
        voice.synth.set({ envelope });
      }
    }
  }

  /** Update the filter settings (type, frequency, Q) on a live synth's filter node. */
  setFilter(trackId: string, filter: { type?: string; frequency?: number; Q?: number }): void {
    const instance = this.synths.get(trackId);
    if (!instance?.filter) return;
    if (filter.type) instance.filter.type = filter.type as BiquadFilterType;
    if (filter.frequency !== undefined) instance.filter.frequency.value = filter.frequency;
    if (filter.Q !== undefined) instance.filter.Q.value = filter.Q;
  }

  removeTrackSynth(trackId: string) {
    this.disposeUnisonVoices(trackId);
    const instance = this.synths.get(trackId);
    if (!instance) return;
    instance.synth.releaseAll();
    instance.synth.dispose();
    instance.gain.dispose();
    instance.filter?.dispose();
    instance.filterEnvelope?.dispose();
    this.synths.delete(trackId);
  }

  dispose() {
    for (const trackId of this.synths.keys()) {
      this.removeTrackSynth(trackId);
    }
    for (const trackId of this.fmSynths.keys()) {
      this.removeFmSynth(trackId);
    }
    this.previewSynth?.dispose();
    this.previewGain?.dispose();
    this.previewSynth = null;
    this.previewGain = null;
  }
}

export const synthEngine = new SynthEngine();
