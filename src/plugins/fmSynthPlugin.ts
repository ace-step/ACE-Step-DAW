/**
 * FM Synth — Example WAP instrument plugin.
 *
 * Simple 2-operator FM synthesis with ADSR envelope.
 * Demonstrates the instrument plugin interface.
 */
import type {
  WAPPlugin,
  PluginAudioNode,
  PluginParamDescriptor,
  PluginParamValue,
  PluginParamValues,
  PluginFactory,
} from '../types/plugin';

interface Voice {
  carrier: OscillatorNode;
  modulator: OscillatorNode;
  modulatorGain: GainNode;
  envelope: GainNode;
  note: number;
  releaseTimeout?: ReturnType<typeof setTimeout>;
}

class FMSynthPlugin implements WAPPlugin {
  readonly name = 'FM Synth';
  readonly pluginType = 'instrument' as const;
  readonly version = '1.0.0';
  readonly author = 'ACE-Step';
  readonly description = 'Simple 2-operator FM synthesizer';

  private ctx: AudioContext | null = null;
  private outputGain: GainNode | null = null;
  private voices = new Map<number, Voice>();
  private params: PluginParamValues = {
    modulationIndex: 2,
    harmonicRatio: 2,
    attack: 0.01,
    decay: 0.2,
    sustain: 0.7,
    release: 0.3,
    carrierWaveform: 'sine',
    modulatorWaveform: 'sine',
  };

  getParameterDescriptors(): PluginParamDescriptor[] {
    return [
      {
        id: 'modulationIndex',
        name: 'Mod Index',
        type: 'float',
        min: 0,
        max: 20,
        defaultValue: 2,
      },
      {
        id: 'harmonicRatio',
        name: 'Harmonic Ratio',
        type: 'float',
        min: 0.5,
        max: 8,
        defaultValue: 2,
      },
      {
        id: 'attack',
        name: 'Attack',
        type: 'float',
        min: 0.001,
        max: 2,
        defaultValue: 0.01,
      },
      {
        id: 'decay',
        name: 'Decay',
        type: 'float',
        min: 0.001,
        max: 2,
        defaultValue: 0.2,
      },
      {
        id: 'sustain',
        name: 'Sustain',
        type: 'float',
        min: 0,
        max: 1,
        defaultValue: 0.7,
      },
      {
        id: 'release',
        name: 'Release',
        type: 'float',
        min: 0.001,
        max: 5,
        defaultValue: 0.3,
      },
      {
        id: 'carrierWaveform',
        name: 'Carrier Wave',
        type: 'enum',
        options: ['sine', 'triangle', 'sawtooth', 'square'],
        defaultValue: 'sine',
      },
      {
        id: 'modulatorWaveform',
        name: 'Mod Wave',
        type: 'enum',
        options: ['sine', 'triangle', 'sawtooth', 'square'],
        defaultValue: 'sine',
      },
    ];
  }

  createAudioNode(ctx: AudioContext): PluginAudioNode {
    this.ctx = ctx;
    this.outputGain = ctx.createGain();
    this.outputGain.gain.value = 0.3; // Prevent clipping with polyphony

    return {
      inputNode: null, // Instruments have no input
      outputNode: this.outputGain,
    };
  }

  noteOn(note: number, velocity: number, time?: number): void {
    if (!this.ctx || !this.outputGain) return;

    // Stop existing voice on this note
    this.noteOff(note);

    const now = time ?? this.ctx.currentTime;
    const freq = 440 * Math.pow(2, (note - 69) / 12);
    const harmonicRatio = Number(this.params.harmonicRatio);
    const modulationIndex = Number(this.params.modulationIndex);
    const attack = Number(this.params.attack);
    const decay = Number(this.params.decay);
    const sustain = Number(this.params.sustain);

    // Create modulator oscillator
    const modulator = this.ctx.createOscillator();
    modulator.type = String(this.params.modulatorWaveform) as OscillatorType;
    modulator.frequency.value = freq * harmonicRatio;

    // Modulator gain controls modulation depth
    const modulatorGain = this.ctx.createGain();
    modulatorGain.gain.value = freq * modulationIndex;

    // Create carrier oscillator
    const carrier = this.ctx.createOscillator();
    carrier.type = String(this.params.carrierWaveform) as OscillatorType;
    carrier.frequency.value = freq;

    // Connect modulator → carrier frequency
    modulator.connect(modulatorGain);
    modulatorGain.connect(carrier.frequency);

    // Envelope
    const envelope = this.ctx.createGain();
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(velocity, now + attack);
    envelope.gain.linearRampToValueAtTime(velocity * sustain, now + attack + decay);

    // Signal chain: carrier → envelope → output
    carrier.connect(envelope);
    envelope.connect(this.outputGain);

    modulator.start(now);
    carrier.start(now);

    this.voices.set(note, { carrier, modulator, modulatorGain, envelope, note });
  }

  noteOff(note: number, time?: number): void {
    const voice = this.voices.get(note);
    if (!voice || !this.ctx) return;

    const now = time ?? this.ctx.currentTime;
    const release = Number(this.params.release);

    // Release envelope
    voice.envelope.gain.cancelScheduledValues(now);
    voice.envelope.gain.setValueAtTime(voice.envelope.gain.value, now);
    voice.envelope.gain.linearRampToValueAtTime(0, now + release);

    // Clean up after release
    if (voice.releaseTimeout) clearTimeout(voice.releaseTimeout);
    voice.releaseTimeout = setTimeout(() => {
      voice.carrier.stop();
      voice.modulator.stop();
      voice.carrier.disconnect();
      voice.modulator.disconnect();
      voice.modulatorGain.disconnect();
      voice.envelope.disconnect();
      this.voices.delete(note);
    }, (release + 0.1) * 1000);
  }

  setParameter(paramId: string, value: PluginParamValue): void {
    this.params[paramId] = value;
  }

  getParameter(paramId: string): PluginParamValue | undefined {
    return this.params[paramId];
  }

  getParameters(): PluginParamValues {
    return { ...this.params };
  }

  dispose(): void {
    for (const [note] of this.voices) {
      this.noteOff(note);
    }
    this.voices.clear();
    if (this.outputGain) {
      this.outputGain.disconnect();
      this.outputGain = null;
    }
    this.ctx = null;
  }
}

export const createFMSynthPlugin: PluginFactory = () => new FMSynthPlugin();
