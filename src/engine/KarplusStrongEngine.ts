import * as Tone from 'tone';
import type { PhysicalModelSettings, PhysicalExciterType, PhysicalModelPreset } from '../types/project';

interface KarplusInstance {
  synths: Tone.PluckSynth[];
  filter: Tone.Filter;
  bodyFilter: Tone.Filter | null;
  bodyWetGain: Tone.Gain | null;
  output: Tone.Gain;
  settings: PhysicalModelSettings;
}

// ─── Presets ────────────────────────────────────────────────────────────────

export const PHYSICAL_PRESETS: Record<PhysicalModelPreset, PhysicalModelSettings> = {
  'acoustic-guitar': {
    exciter: 'pluck',
    damping: 0.3,
    brightness: 0.6,
    pluckPosition: 0.4,
    bodySize: 0.5,
    outputGain: -5,
  },
  'harp': {
    exciter: 'pluck',
    damping: 0.15,
    brightness: 0.8,
    pluckPosition: 0.3,
    bodySize: 0.3,
    outputGain: -5,
  },
  'kalimba': {
    exciter: 'hammer',
    damping: 0.4,
    brightness: 0.9,
    pluckPosition: 0.1,
    bodySize: 0.6,
    outputGain: -5,
  },
  'marimba': {
    exciter: 'hammer',
    damping: 0.5,
    brightness: 0.5,
    pluckPosition: 0.5,
    bodySize: 0.7,
    outputGain: -5,
  },
  'steel-drum': {
    exciter: 'hammer',
    damping: 0.25,
    brightness: 0.7,
    pluckPosition: 0.6,
    bodySize: 0.8,
    outputGain: -5,
  },
  'custom': {
    exciter: 'pluck',
    damping: 0.3,
    brightness: 0.5,
    pluckPosition: 0.5,
    bodySize: 0.4,
    outputGain: -5,
  },
};

// ─── Helper: map settings to PluckSynth parameters ────────────────────────

function exciterToAttackNoise(exciter: PhysicalExciterType): number {
  switch (exciter) {
    case 'pluck': return 1;
    case 'bow': return 4;
    case 'hammer': return 0.5;
  }
}

function settingsToPluckParams(settings: PhysicalModelSettings) {
  // pluckPosition affects brightness and resonance: edge = brighter, center = warmer
  const pos = Math.max(0, Math.min(1, settings.pluckPosition));
  const edgeFactor = Math.abs(pos - 0.5) * 2;
  const effectiveBrightness = Math.min(1, Math.max(0, settings.brightness * (0.8 + edgeFactor * 0.4)));
  const effectiveResonance = Math.min(1, Math.max(0, (1 - settings.damping) * (0.9 + edgeFactor * 0.2)));

  return {
    attackNoise: exciterToAttackNoise(settings.exciter),
    dampening: 1000 + effectiveBrightness * 14000,
    resonance: effectiveResonance,
  };
}

function dBToLinear(dB: number): number {
  return Math.pow(10, dB / 20);
}

// ─── Engine ────────────────────────────────────────────────────────────────

class KarplusStrongEngine {
  private instances = new Map<string, KarplusInstance>();

  async ensureStarted() {
    if (Tone.getContext().state !== 'running') {
      await Tone.start();
    }
  }

  ensureTrack(
    trackId: string,
    settings: PhysicalModelSettings,
    connectTo?: Tone.InputNode,
  ): KarplusInstance {
    const existing = this.instances.get(trackId);
    if (existing) {
      this._updateSettings(existing, settings);
      return existing;
    }

    const instance = this._createInstance(settings, connectTo);
    this.instances.set(trackId, instance);
    return instance;
  }

  noteOn(trackId: string, pitch: number, velocity = 100) {
    this._lazyInit(trackId);
    const instance = this.instances.get(trackId);
    if (!instance) return;
    const freq = Tone.Frequency(pitch, 'midi').toFrequency();
    // PluckSynth doesn't support velocity param — scale output gain temporarily
    const vel = Math.max(0, Math.min(127, velocity)) / 127;
    const baseGain = instance.output.gain.value;
    instance.output.gain.value = baseGain * vel;
    instance.synths[0].triggerAttack(freq);
    // Restore base gain after a short delay (PluckSynth excitation is immediate)
    instance.output.gain.value = baseGain;
  }

  noteOff(trackId: string, _pitch: number) {
    void trackId;
  }

  triggerAttackRelease(trackId: string, pitch: number, duration: number, velocity = 1) {
    this._lazyInit(trackId);
    const instance = this.instances.get(trackId);
    if (!instance) return;
    const freq = Tone.Frequency(pitch, 'midi').toFrequency();
    // PluckSynth doesn't support velocity in triggerAttack
    instance.synths[0].triggerAttack(freq);
  }

  setParameter(trackId: string, name: string, value: number | string | boolean) {
    const instance = this.instances.get(trackId);
    if (!instance) return;

    switch (name) {
      case 'damping':
        instance.settings.damping = value as number;
        instance.synths[0].resonance = 1 - (value as number);
        break;
      case 'brightness':
        instance.settings.brightness = value as number;
        instance.synths[0].dampening = 1000 + (value as number) * 14000;
        instance.filter.frequency.value = 500 + (value as number) * 19500;
        break;
      case 'exciter':
        instance.settings.exciter = value as PhysicalExciterType;
        instance.synths[0].attackNoise = exciterToAttackNoise(value as PhysicalExciterType);
        break;
      case 'bodySize': {
        const bs = value as number;
        instance.settings.bodySize = bs;
        if (instance.bodyFilter && instance.bodyWetGain) {
          instance.bodyFilter.frequency.value = 200 + bs * 2000;
          instance.bodyFilter.Q.value = 1 + bs * 5;
          instance.bodyWetGain.gain.value = bs;
        }
        break;
      }
      case 'outputGain':
        instance.output.gain.value = dBToLinear(value as number);
        break;
    }
  }

  releaseAll() {
    // PluckSynth notes are self-decaying
  }

  removeTrack(trackId: string) {
    const instance = this.instances.get(trackId);
    if (!instance) return;
    this._disposeInstance(instance);
    this.instances.delete(trackId);
  }

  dispose() {
    for (const trackId of [...this.instances.keys()]) {
      this.removeTrack(trackId);
    }
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  /** Lazily create instance with defaults if noteOn arrives before ensureTrack. */
  private _lazyInit(trackId: string) {
    if (!this.instances.has(trackId)) {
      this.ensureTrack(trackId, { ...PHYSICAL_PRESETS['custom'] });
    }
  }

  private _createInstance(
    settings: PhysicalModelSettings,
    connectTo?: Tone.InputNode,
  ): KarplusInstance {
    const params = settingsToPluckParams(settings);

    const synth = new Tone.PluckSynth({
      attackNoise: params.attackNoise,
      dampening: params.dampening,
      resonance: params.resonance,
    });

    const filter = new Tone.Filter({
      type: 'lowpass',
      frequency: 500 + settings.brightness * 19500,
      Q: 0.7,
    });

    // Body resonance: always create but control wet amount via bodyWetGain
    let bodyFilter: Tone.Filter | null = null;
    let bodyWetGain: Tone.Gain | null = null;
    if (settings.bodySize > 0) {
      bodyFilter = new Tone.Filter({
        type: 'bandpass',
        frequency: 200 + settings.bodySize * 2000,
        Q: 1 + settings.bodySize * 5,
      });
      bodyWetGain = new Tone.Gain(settings.bodySize);
    }

    const output = new Tone.Gain(dBToLinear(settings.outputGain));

    // Signal chain: synth → filter → output (dry) + filter → bodyFilter → bodyWetGain �� output (wet)
    synth.connect(filter);
    filter.connect(output);
    if (bodyFilter && bodyWetGain) {
      filter.connect(bodyFilter);
      bodyFilter.connect(bodyWetGain);
      bodyWetGain.connect(output);
    }

    if (connectTo) {
      output.connect(connectTo);
    } else {
      output.toDestination();
    }

    return {
      synths: [synth],
      filter,
      bodyFilter,
      bodyWetGain,
      output,
      settings: { ...settings },
    };
  }

  private _updateSettings(instance: KarplusInstance, settings: PhysicalModelSettings) {
    const params = settingsToPluckParams(settings);
    instance.synths[0].attackNoise = params.attackNoise;
    instance.synths[0].dampening = params.dampening;
    instance.synths[0].resonance = params.resonance;
    instance.filter.frequency.value = 500 + settings.brightness * 19500;

    if (instance.bodyFilter && instance.bodyWetGain && settings.bodySize > 0) {
      instance.bodyFilter.frequency.value = 200 + settings.bodySize * 2000;
      instance.bodyFilter.Q.value = 1 + settings.bodySize * 5;
      instance.bodyWetGain.gain.value = settings.bodySize;
    }

    instance.output.gain.value = dBToLinear(settings.outputGain);
    instance.settings = { ...settings };
  }

  private _disposeInstance(instance: KarplusInstance) {
    for (const s of instance.synths) s.dispose();
    instance.filter.dispose();
    instance.bodyFilter?.dispose();
    instance.bodyWetGain?.dispose();
    instance.output.dispose();
  }
}

export const karplusStrongEngine = new KarplusStrongEngine();
