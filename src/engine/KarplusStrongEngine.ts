import * as Tone from 'tone';
import type { PhysicalModelSettings, PhysicalExciterType, PhysicalModelPreset } from '../types/project';

/** Number of polyphonic voices for PluckSynth (self-decaying, so overlap is common). */
const VOICE_COUNT = 8;

interface KarplusInstance {
  synths: Tone.PluckSynth[];
  nextVoice: number;
  filter: Tone.Filter;
  bodyFilter: Tone.Filter;
  bodyWetGain: Tone.Gain;
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

  async ensureTrack(
    trackId: string,
    settings: PhysicalModelSettings,
    connectTo?: Tone.InputNode,
  ): Promise<KarplusInstance> {
    await this.ensureStarted();

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
    const vel = Math.max(0, Math.min(127, velocity)) / 127;

    // Round-robin voice allocation for polyphony
    const voiceIdx = instance.nextVoice % instance.synths.length;
    instance.nextVoice = (instance.nextVoice + 1) % instance.synths.length;
    const synth = instance.synths[voiceIdx];

    // Apply velocity by scaling output temporarily with scheduled ramp
    const now = Tone.now();
    const baseGain = dBToLinear(instance.settings.outputGain);
    instance.output.gain.cancelScheduledValues(now);
    instance.output.gain.setValueAtTime(baseGain * vel, now);
    synth.triggerAttack(freq, now);
    // Restore base gain after excitation window (~50ms)
    instance.output.gain.linearRampToValueAtTime(baseGain, now + 0.05);
  }

  noteOff(_trackId: string, _pitch: number) {
    // PluckSynth notes self-decay — no explicit release needed.
  }

  triggerAttackRelease(trackId: string, pitch: number, _duration: number, velocity = 1) {
    // PluckSynth self-decays, so duration doesn't apply. Apply velocity.
    this.noteOn(trackId, pitch, Math.round(velocity * 127));
  }

  setParameter(trackId: string, name: string, value: number | string | boolean) {
    const instance = this.instances.get(trackId);
    if (!instance) return;

    switch (name) {
      case 'damping':
        instance.settings.damping = value as number;
        for (const s of instance.synths) s.resonance = 1 - (value as number);
        break;
      case 'brightness':
        instance.settings.brightness = value as number;
        for (const s of instance.synths) s.dampening = 1000 + (value as number) * 14000;
        instance.filter.frequency.value = 500 + (value as number) * 19500;
        break;
      case 'exciter':
        instance.settings.exciter = value as PhysicalExciterType;
        for (const s of instance.synths) s.attackNoise = exciterToAttackNoise(value as PhysicalExciterType);
        break;
      case 'pluckPosition': {
        instance.settings.pluckPosition = value as number;
        const params = settingsToPluckParams(instance.settings);
        for (const s of instance.synths) {
          s.dampening = params.dampening;
          s.resonance = params.resonance;
        }
        break;
      }
      case 'bodySize': {
        const bs = value as number;
        instance.settings.bodySize = bs;
        instance.bodyFilter.frequency.value = 200 + bs * 2000;
        instance.bodyFilter.Q.value = 1 + bs * 5;
        instance.bodyWetGain.gain.value = bs;
        break;
      }
      case 'outputGain':
        instance.settings.outputGain = value as number;
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
      // Synchronous fallback — ensureTrack is async but we need immediate init
      const instance = this._createInstance({ ...PHYSICAL_PRESETS['custom'] });
      this.instances.set(trackId, instance);
    }
  }

  private _createInstance(
    settings: PhysicalModelSettings,
    connectTo?: Tone.InputNode,
  ): KarplusInstance {
    const params = settingsToPluckParams(settings);

    // Create polyphonic voice pool
    const synths: Tone.PluckSynth[] = [];
    for (let i = 0; i < VOICE_COUNT; i++) {
      synths.push(new Tone.PluckSynth({
        attackNoise: params.attackNoise,
        dampening: params.dampening,
        resonance: params.resonance,
      }));
    }

    const filter = new Tone.Filter({
      type: 'lowpass',
      frequency: 500 + settings.brightness * 19500,
      Q: 0.7,
    });

    // Body resonance: always created, wet gain controls blend amount
    const bodyFilter = new Tone.Filter({
      type: 'bandpass',
      frequency: 200 + settings.bodySize * 2000,
      Q: 1 + settings.bodySize * 5,
    });
    const bodyWetGain = new Tone.Gain(settings.bodySize);

    const output = new Tone.Gain(dBToLinear(settings.outputGain));

    // Signal chain: synth -> filter -> output (dry) + filter -> bodyFilter -> bodyWetGain -> output (wet)
    for (const synth of synths) {
      synth.connect(filter);
    }
    filter.connect(output);
    filter.connect(bodyFilter);
    bodyFilter.connect(bodyWetGain);
    bodyWetGain.connect(output);

    if (connectTo) {
      output.connect(connectTo);
    } else {
      output.toDestination();
    }

    return {
      synths,
      nextVoice: 0,
      filter,
      bodyFilter,
      bodyWetGain,
      output,
      settings: { ...settings },
    };
  }

  private _updateSettings(instance: KarplusInstance, settings: PhysicalModelSettings) {
    const params = settingsToPluckParams(settings);
    for (const synth of instance.synths) {
      synth.attackNoise = params.attackNoise;
      synth.dampening = params.dampening;
      synth.resonance = params.resonance;
    }
    instance.filter.frequency.value = 500 + settings.brightness * 19500;
    instance.bodyFilter.frequency.value = 200 + settings.bodySize * 2000;
    instance.bodyFilter.Q.value = 1 + settings.bodySize * 5;
    instance.bodyWetGain.gain.value = settings.bodySize;
    instance.output.gain.value = dBToLinear(settings.outputGain);
    instance.settings = { ...settings };
  }

  private _disposeInstance(instance: KarplusInstance) {
    for (const s of instance.synths) s.dispose();
    instance.filter.dispose();
    instance.bodyFilter.dispose();
    instance.bodyWetGain.dispose();
    instance.output.dispose();
  }
}

export const karplusStrongEngine = new KarplusStrongEngine();
