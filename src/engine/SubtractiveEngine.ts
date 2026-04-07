import * as Tone from 'tone';
import type {
  SubtractiveInstrumentSettings,
} from '../types/project';
import type { ModulationTargets } from './ModulationEngine';

interface SubtractiveInstance {
  synth: Tone.PolySynth;
  filter: Tone.Filter | null;
  lfo: Tone.LFO | null;
  panner: Tone.Panner;
  output: Tone.Gain;
  settings: SubtractiveInstrumentSettings;
}

/**
 * Engine for subtractive synthesis tracks.
 * Maps SubtractiveInstrumentSettings to Tone.js PolySynth with filter, LFO, and unison.
 */
class SubtractiveEngine {
  private instances = new Map<string, SubtractiveInstance>();
  private previewInstance: SubtractiveInstance | null = null;

  async ensureStarted() {
    if (Tone.getContext().state !== 'running') {
      await Tone.start();
    }
  }

  ensureTrackSynth(
    trackId: string,
    settings: SubtractiveInstrumentSettings,
    connectTo?: Tone.InputNode,
  ): SubtractiveInstance {
    const existing = this.instances.get(trackId);
    if (existing) {
      this._updateSettings(existing, settings);
      return existing;
    }

    const instance = this._createInstance(settings, connectTo);
    this.instances.set(trackId, instance);
    return instance;
  }

  getSynth(trackId: string): Tone.PolySynth | null {
    return this.instances.get(trackId)?.synth ?? null;
  }

  setParameter(trackId: string, name: string, value: number | string | boolean) {
    const instance = this.instances.get(trackId);
    if (!instance) return;
    this._applyParameter(instance, name, value);
  }

  triggerAttackRelease(trackId: string, pitch: number, duration: number, velocity = 1) {
    const instance = this.instances.get(trackId);
    if (!instance) return;
    const freq = this._pitchToFreq(pitch, instance.settings.oscillator.octave);
    instance.synth.triggerAttackRelease(freq, duration, undefined, velocity);
  }

  noteOn(trackId: string, pitch: number, velocity = 100) {
    const instance = this.instances.get(trackId);
    if (!instance) return;
    const freq = this._pitchToFreq(pitch, instance.settings.oscillator.octave);
    instance.synth.triggerAttack(freq, undefined, velocity / 127);
    // Retrigger LFO on note-on (key-sync mode)
    if (instance.lfo && instance.settings.lfo.retrigger) {
      instance.lfo.stop();
      instance.lfo.start();
    }
  }

  noteOff(trackId: string, pitch: number) {
    const instance = this.instances.get(trackId);
    if (!instance) return;
    const freq = this._pitchToFreq(pitch, instance.settings.oscillator.octave);
    instance.synth.triggerRelease(freq);
  }

  playSlideNote(
    trackId: string,
    fromPitch: number,
    toPitch: number,
    velocity: number,
    duration: number,
  ) {
    const instance = this.instances.get(trackId);
    if (!instance) return;

    const octave = instance.settings.oscillator.octave;
    const glideTime = instance.settings.glideTime > 0
      ? instance.settings.glideTime
      : Math.max(0.03, Math.min(0.12, duration * 0.35));
    const fromFreq = this._pitchToFreq(fromPitch, octave);
    const toFreq = this._pitchToFreq(toPitch, octave);

    const synth = instance.synth as unknown as {
      set: (options: Record<string, unknown>) => void;
      triggerAttack: (note: number, time?: string | number, velocity?: number) => void;
      triggerRelease: (note: number, time?: string | number) => void;
      triggerAttackRelease: (note: number, duration: number, time?: string | number, velocity?: number) => void;
    };
    synth.set({ portamento: glideTime });
    synth.triggerAttack(fromFreq, undefined, velocity / 127);
    synth.triggerRelease(fromFreq, `+${glideTime}`);
    synth.triggerAttackRelease(toFreq, Math.max(0.04, duration), `+${glideTime}`, velocity / 127);
  }

  async previewNote(
    pitch: number,
    velocity = 100,
    duration = 0.3,
    settings: SubtractiveInstrumentSettings,
  ) {
    await this.ensureStarted();
    if (this.previewInstance) {
      this._disposeInstance(this.previewInstance);
    }
    this.previewInstance = this._createInstance(settings);
    // _createInstance already routes output → panner → destination when no connectTo is given
    const freq = this._pitchToFreq(pitch, settings.oscillator.octave);
    this.previewInstance.synth.triggerAttackRelease(freq, duration, undefined, velocity / 127);
  }

  releaseAll() {
    for (const instance of this.instances.values()) {
      instance.synth.releaseAll();
    }
  }

  /**
   * Return AudioParam references for the modulation engine to connect to.
   * Returns null if no synth exists for the track.
   */
  getModulationTargets(trackId: string): ModulationTargets | null {
    const instance = this.instances.get(trackId);
    if (!instance) return null;

    return {
      amp: instance.output.gain as unknown as Tone.InputNode,
      pitch: (instance.synth as unknown as { detune: Tone.InputNode }).detune ?? undefined,
      pan: instance.panner.pan as unknown as Tone.InputNode,
      filterCutoff: instance.filter
        ? (instance.filter.frequency as unknown as Tone.InputNode)
        : undefined,
      filterResonance: instance.filter
        ? (instance.filter.Q as unknown as Tone.InputNode)
        : undefined,
    };
  }

  removeTrackSynth(trackId: string) {
    const instance = this.instances.get(trackId);
    if (!instance) return;
    instance.synth.releaseAll();
    this._disposeInstance(instance);
    this.instances.delete(trackId);
  }

  dispose() {
    for (const trackId of this.instances.keys()) {
      this.removeTrackSynth(trackId);
    }
    if (this.previewInstance) {
      this._disposeInstance(this.previewInstance);
      this.previewInstance = null;
    }
  }

  // --- Private helpers ---

  private _pitchToFreq(pitch: number, octaveOffset: number): number {
    return Tone.Frequency(pitch + octaveOffset * 12, 'midi').toFrequency();
  }

  private _createInstance(
    settings: SubtractiveInstrumentSettings,
    connectTo?: Tone.InputNode,
  ): SubtractiveInstance {
    const { oscillator, ampEnvelope, filter, lfo, unison } = settings;

    const voiceCount = Math.max(1, Math.min(8, unison.voices));
    const detuneValue = oscillator.detuneCents + (voiceCount > 1 ? unison.detuneCents : 0);
    const synth = new Tone.PolySynth(Tone.Synth);
    synth.set({
      oscillator: { type: oscillator.waveform as OscillatorType },
      envelope: {
        attack: ampEnvelope.attack,
        decay: ampEnvelope.decay,
        sustain: ampEnvelope.sustain,
        release: ampEnvelope.release,
      },
      portamento: settings.glideTime,
      volume: oscillator.level < 1 ? 20 * Math.log10(Math.max(0.0001, oscillator.level)) : 0,
    });
    if (detuneValue !== 0) {
      synth.set({ detune: detuneValue });
    }

    // Output gain (outputGain is in dB; 0 dB → use default 0.55 for legacy compat)
    const outputLevel = settings.outputGain !== 0
      ? Math.pow(10, settings.outputGain / 20)
      : 0.55;
    const output = new Tone.Gain(outputLevel);

    // Signal chain: synth → [filter] → output → panner → connectTo/destination
    let toneFilter: Tone.Filter | null = null;
    // Always insert a panner so modulation matrix can target pan regardless of LFO config
    const tonePanner = new Tone.Panner(0);

    if (filter.enabled) {
      toneFilter = new Tone.Filter({
        type: filter.type,
        frequency: filter.cutoffHz,
        Q: filter.resonance * 30,
        rolloff: -12,
      });
      synth.connect(toneFilter);
      toneFilter.connect(output);
    } else {
      synth.connect(output);
    }

    // LFO modulation
    let lfoNode: Tone.LFO | null = null;

    if (lfo.enabled && lfo.target !== 'off' && lfo.depth > 0) {
      switch (lfo.target) {
        case 'amp': {
          lfoNode = new Tone.LFO({
            frequency: lfo.rateHz,
            type: lfo.waveform as Tone.ToneOscillatorType,
            min: Math.max(0, outputLevel - lfo.depth * outputLevel),
            max: outputLevel + lfo.depth * outputLevel,
          });
          lfoNode.connect(output.gain as unknown as Tone.InputNode);
          lfoNode.start();
          break;
        }
        case 'filterCutoff': {
          if (toneFilter) {
            const range = lfo.depth * filter.cutoffHz;
            lfoNode = new Tone.LFO({
              frequency: lfo.rateHz,
              type: lfo.waveform as Tone.ToneOscillatorType,
              min: Math.max(20, filter.cutoffHz - range),
              max: Math.min(20000, filter.cutoffHz + range),
            });
            lfoNode.connect(toneFilter.frequency as unknown as Tone.InputNode);
            lfoNode.start();
          }
          break;
        }
        case 'pitch': {
          // Modulate global detune param on PolySynth. depth 1.0 = ±1200 cents (1 octave).
          const detuneParam = (synth as unknown as { detune: Tone.InputNode }).detune;
          if (detuneParam) {
            const maxCents = lfo.depth * 1200;
            lfoNode = new Tone.LFO({
              frequency: lfo.rateHz,
              type: lfo.waveform as Tone.ToneOscillatorType,
              min: -maxCents,
              max: maxCents,
            });
            lfoNode.connect(detuneParam);
            lfoNode.start();
          }
          break;
        }
        case 'pan': {
          // Modulate the always-present panner's pan param
          lfoNode = new Tone.LFO({
            frequency: lfo.rateHz,
            type: lfo.waveform as Tone.ToneOscillatorType,
            min: -lfo.depth,
            max: lfo.depth,
          });
          lfoNode.connect(tonePanner.pan as unknown as Tone.InputNode);
          lfoNode.start();
          break;
        }
      }
    }

    // Final output routing: output → panner → connectTo/destination
    output.connect(tonePanner);
    if (connectTo) {
      tonePanner.connect(connectTo);
    } else {
      tonePanner.toDestination();
    }

    return {
      synth,
      filter: toneFilter,
      lfo: lfoNode,
      panner: tonePanner,
      output,
      settings: { ...settings },
    };
  }

  private _updateSettings(instance: SubtractiveInstance, settings: SubtractiveInstrumentSettings) {
    const { oscillator, ampEnvelope, unison } = settings;

    instance.synth.set({
      oscillator: { type: oscillator.waveform as OscillatorType },
      envelope: {
        attack: ampEnvelope.attack,
        decay: ampEnvelope.decay,
        sustain: ampEnvelope.sustain,
        release: ampEnvelope.release,
      },
      portamento: settings.glideTime,
    });
    const detuneValue = oscillator.detuneCents + (unison.voices > 1 ? unison.detuneCents : 0);
    if (detuneValue !== 0) {
      instance.synth.set({ detune: detuneValue });
    }

    if (instance.filter && settings.filter.enabled) {
      instance.filter.frequency.value = settings.filter.cutoffHz;
      instance.filter.Q.value = settings.filter.resonance * 30;
      instance.filter.type = settings.filter.type;
    }

    if (instance.lfo && settings.lfo.enabled) {
      instance.lfo.frequency.value = settings.lfo.rateHz;
    }

    const outputLevel = settings.outputGain !== 0
      ? Math.pow(10, settings.outputGain / 20)
      : 0.55;
    instance.output.gain.value = outputLevel;

    instance.settings = { ...settings };
  }

  private _applyParameter(instance: SubtractiveInstance, name: string, value: number | string | boolean) {
    switch (name) {
      case 'oscillator.waveform':
        instance.synth.set({ oscillator: { type: value as OscillatorType } });
        break;
      case 'oscillator.detuneCents':
        instance.synth.set({ detune: value as number });
        break;
      case 'ampEnvelope.attack':
        instance.synth.set({ envelope: { attack: value as number } });
        break;
      case 'ampEnvelope.decay':
        instance.synth.set({ envelope: { decay: value as number } });
        break;
      case 'ampEnvelope.sustain':
        instance.synth.set({ envelope: { sustain: value as number } });
        break;
      case 'ampEnvelope.release':
        instance.synth.set({ envelope: { release: value as number } });
        break;
      case 'filter.cutoffHz':
        if (instance.filter) instance.filter.frequency.value = value as number;
        break;
      case 'filter.resonance':
        if (instance.filter) instance.filter.Q.value = (value as number) * 30;
        break;
      case 'lfo.rateHz':
        if (instance.lfo) instance.lfo.frequency.value = value as number;
        break;
      case 'lfo.depth':
        if (instance.lfo) {
          instance.lfo.min = -(value as number);
          instance.lfo.max = value as number;
        }
        break;
      case 'outputGain': {
        const level = (value as number) !== 0
          ? Math.pow(10, (value as number) / 20)
          : 0.55;
        instance.output.gain.value = level;
        break;
      }
      case 'glideTime':
        instance.synth.set({ portamento: value as number });
        break;
    }
  }

  private _disposeInstance(instance: SubtractiveInstance) {
    instance.synth.releaseAll();
    instance.synth.dispose();
    instance.lfo?.stop();
    instance.lfo?.dispose();
    instance.filter?.dispose();
    instance.panner.dispose();
    instance.output.dispose();
  }
}

export const subtractiveEngine = new SubtractiveEngine();
