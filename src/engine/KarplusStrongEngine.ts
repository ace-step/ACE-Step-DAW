import * as Tone from 'tone';
import type { PhysicalModelSettings, PhysicalExciterType, PhysicalModelPreset } from '../types/project';

interface KarplusInstance {
  synths: Tone.PluckSynth[];
  filter: Tone.Filter;
  bodyFilter: Tone.Filter | null;
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
    outputGain: 0,
  },
  'harp': {
    exciter: 'pluck',
    damping: 0.15,
    brightness: 0.8,
    pluckPosition: 0.3,
    bodySize: 0.3,
    outputGain: 0,
  },
  'kalimba': {
    exciter: 'hammer',
    damping: 0.4,
    brightness: 0.9,
    pluckPosition: 0.1,
    bodySize: 0.6,
    outputGain: 0,
  },
  'marimba': {
    exciter: 'hammer',
    damping: 0.5,
    brightness: 0.5,
    pluckPosition: 0.5,
    bodySize: 0.7,
    outputGain: 0,
  },
  'steel-drum': {
    exciter: 'hammer',
    damping: 0.25,
    brightness: 0.7,
    pluckPosition: 0.6,
    bodySize: 0.8,
    outputGain: 0,
  },
  'custom': {
    exciter: 'pluck',
    damping: 0.3,
    brightness: 0.5,
    pluckPosition: 0.5,
    bodySize: 0.4,
    outputGain: 0,
  },
};

// ─── Helper: map exciter type to PluckSynth resonance behavior ────────────

function exciterToAttackNoise(exciter: PhysicalExciterType): number {
  switch (exciter) {
    case 'pluck': return 1;      // short noise burst
    case 'bow': return 4;        // longer excitation
    case 'hammer': return 0.5;   // very short impulse
  }
}

function settingsToPluckParams(settings: PhysicalModelSettings) {
  return {
    attackNoise: exciterToAttackNoise(settings.exciter),
    dampening: 1000 + settings.brightness * 14000, // 1kHz (dark) to 15kHz (bright)
    resonance: 1 - settings.damping, // higher damping = lower resonance = faster decay
  };
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
    const instance = this.instances.get(trackId);
    if (!instance) return;
    const freq = Tone.Frequency(pitch, 'midi').toFrequency();
    const vel = Math.max(0, Math.min(127, velocity)) / 127;
    // PluckSynth.triggerAttack(note, time?)
    instance.synths[0].triggerAttack(freq);
  }

  noteOff(trackId: string, _pitch: number) {
    // PluckSynth is self-decaying, no explicit release needed
    void trackId;
  }

  triggerAttackRelease(trackId: string, pitch: number, _duration: number, velocity = 1) {
    const instance = this.instances.get(trackId);
    if (!instance) return;
    const freq = Tone.Frequency(pitch, 'midi').toFrequency();
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
        // Also update the brightness filter
        instance.filter.frequency.value = 500 + (value as number) * 19500;
        break;
      case 'exciter':
        instance.settings.exciter = value as PhysicalExciterType;
        instance.synths[0].attackNoise = exciterToAttackNoise(value as PhysicalExciterType);
        break;
      case 'bodySize':
        instance.settings.bodySize = value as number;
        if (instance.bodyFilter) {
          instance.bodyFilter.frequency.value = 200 + (value as number) * 2000;
          instance.bodyFilter.Q.value = 1 + (value as number) * 5;
        }
        break;
      case 'outputGain': {
        const level = (value as number) !== 0
          ? Math.pow(10, (value as number) / 20)
          : 0.55;
        instance.output.gain.value = level;
        break;
      }
    }
  }

  releaseAll() {
    // PluckSynth notes are self-decaying, nothing to release
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

    // Brightness filter on the output
    const filter = new Tone.Filter({
      type: 'lowpass',
      frequency: 500 + settings.brightness * 19500,
      Q: 0.7,
    });

    // Body resonance simulation via bandpass comb filter
    let bodyFilter: Tone.Filter | null = null;
    if (settings.bodySize > 0) {
      bodyFilter = new Tone.Filter({
        type: 'bandpass',
        frequency: 200 + settings.bodySize * 2000,
        Q: 1 + settings.bodySize * 5,
      });
    }

    const outputLevel = settings.outputGain !== 0
      ? Math.pow(10, settings.outputGain / 20)
      : 0.55;
    const output = new Tone.Gain(outputLevel);

    // Signal chain: synth → filter → [bodyFilter] → output
    synth.connect(filter);
    if (bodyFilter) {
      // Mix dry and body-resonated signals
      filter.connect(output);
      filter.connect(bodyFilter);
      bodyFilter.connect(output);
    } else {
      filter.connect(output);
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

    if (instance.bodyFilter && settings.bodySize > 0) {
      instance.bodyFilter.frequency.value = 200 + settings.bodySize * 2000;
      instance.bodyFilter.Q.value = 1 + settings.bodySize * 5;
    }

    const outputLevel = settings.outputGain !== 0
      ? Math.pow(10, settings.outputGain / 20)
      : 0.55;
    instance.output.gain.value = outputLevel;

    instance.settings = { ...settings };
  }

  private _disposeInstance(instance: KarplusInstance) {
    for (const s of instance.synths) s.dispose();
    instance.filter.dispose();
    instance.bodyFilter?.dispose();
    instance.output.dispose();
  }
}

export const karplusStrongEngine = new KarplusStrongEngine();
