import * as Tone from 'tone';
import type { AdditiveSettings, AdditivePartial, AdditivePreset, InstrumentEnvelope } from '../types/project';

// ─── Preset Harmonic Profiles ──────────────────────────────────────────────

function generateSawPartials(count: number): AdditivePartial[] {
  return Array.from({ length: count }, (_, i) => ({
    ratio: i + 1,
    amplitude: 1 / (i + 1),
    phase: 0,
  }));
}

function generateSquarePartials(count: number): AdditivePartial[] {
  return Array.from({ length: count }, (_, i) => {
    const n = i + 1;
    return {
      ratio: n,
      amplitude: n % 2 === 1 ? 1 / n : 0, // odd harmonics only
      phase: 0,
    };
  });
}

function generateOrganPartials(count: number): AdditivePartial[] {
  // Drawbar-style organ: fundamental + select harmonics
  const drawbarRatios = [1, 2, 3, 4, 5, 6, 8, 10, 12];
  const drawbarAmps = [1, 0.8, 0.6, 0.3, 0.2, 0.15, 0.1, 0.08, 0.05];
  return Array.from({ length: Math.min(count, drawbarRatios.length) }, (_, i) => ({
    ratio: drawbarRatios[i],
    amplitude: drawbarAmps[i],
    phase: 0,
  }));
}

function generateBellPartials(count: number): AdditivePartial[] {
  // Inharmonic partials for metallic bell sound
  const bellRatios = [1, 2.0, 3.0, 4.2, 5.4, 6.8, 8.1, 9.3, 10.7, 12.0, 13.5, 15.1, 16.8, 18.6, 20.5, 22.5];
  return Array.from({ length: Math.min(count, bellRatios.length) }, (_, i) => ({
    ratio: bellRatios[i],
    amplitude: Math.pow(0.7, i), // exponential decay
    phase: Math.random() * Math.PI * 2, // random phase for richness
  }));
}

export function createPresetPartials(preset: AdditivePreset, count = 16): AdditivePartial[] {
  switch (preset) {
    case 'saw': return generateSawPartials(count);
    case 'square': return generateSquarePartials(count);
    case 'organ': return generateOrganPartials(count);
    case 'bell': return generateBellPartials(count);
    case 'custom':
    default:
      return generateSawPartials(count);
  }
}

export const DEFAULT_ADDITIVE_ENVELOPE: InstrumentEnvelope = {
  attack: 0.01,
  decay: 0.3,
  sustain: 0.6,
  release: 0.5,
};

export function createDefaultAdditiveSettings(preset: AdditivePreset = 'saw'): AdditiveSettings {
  return {
    partials: createPresetPartials(preset),
    ampEnvelope: { ...DEFAULT_ADDITIVE_ENVELOPE },
    outputGain: 0,
  };
}

// ─── Instance ──────────────────────────────────────────────────────────────

interface ActiveVoice {
  oscillators: OscillatorNode[];
  gains: GainNode[];
  masterGain: GainNode;
  pitch: number;
}

interface AdditiveInstance {
  output: Tone.Gain;
  settings: AdditiveSettings;
  activeVoices: Map<number, ActiveVoice>;
}

// ─── Engine ────────────────────────────────────────────────────────────────

class AdditiveEngine {
  private instances = new Map<string, AdditiveInstance>();

  async ensureStarted() {
    if (Tone.getContext().state !== 'running') {
      await Tone.start();
    }
  }

  ensureTrack(
    trackId: string,
    settings: AdditiveSettings,
    connectTo?: Tone.InputNode,
  ): AdditiveInstance {
    const existing = this.instances.get(trackId);
    if (existing) {
      existing.settings = { ...settings };
      return existing;
    }

    const outputLevel = settings.outputGain !== 0
      ? Math.pow(10, settings.outputGain / 20)
      : 0.55;
    const output = new Tone.Gain(outputLevel);

    if (connectTo) {
      output.connect(connectTo);
    } else {
      output.toDestination();
    }

    const instance: AdditiveInstance = {
      output,
      settings: { ...settings },
      activeVoices: new Map(),
    };
    this.instances.set(trackId, instance);
    return instance;
  }

  noteOn(trackId: string, pitch: number, velocity = 100) {
    const instance = this.instances.get(trackId);
    if (!instance) return;

    // Kill existing voice at this pitch if any
    this._stopVoice(instance, pitch);

    const { partials, ampEnvelope } = instance.settings;
    const ctx = Tone.getContext().rawContext;
    const now = ctx.currentTime;
    const fundamentalFreq = Tone.Frequency(pitch, 'midi').toFrequency();
    const vel = Math.max(0, Math.min(127, velocity)) / 127;

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0, now);
    masterGain.gain.linearRampToValueAtTime(vel, now + ampEnvelope.attack);
    masterGain.gain.linearRampToValueAtTime(
      vel * ampEnvelope.sustain,
      now + ampEnvelope.attack + ampEnvelope.decay,
    );
    masterGain.connect((instance.output as unknown as { input: AudioNode }).input ?? ctx.destination);

    const oscillators: OscillatorNode[] = [];
    const gains: GainNode[] = [];

    for (const partial of partials) {
      if (partial.amplitude <= 0) continue;

      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = fundamentalFreq * partial.ratio;

      const gain = ctx.createGain();
      // Scale amplitude by number of active partials for normalization
      const normalizedAmp = partial.amplitude / Math.sqrt(partials.filter((p) => p.amplitude > 0).length || 1);
      gain.gain.value = normalizedAmp;

      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(now);

      oscillators.push(osc);
      gains.push(gain);
    }

    instance.activeVoices.set(pitch, {
      oscillators,
      gains,
      masterGain,
      pitch,
    });
  }

  noteOff(trackId: string, pitch: number) {
    const instance = this.instances.get(trackId);
    if (!instance) return;

    const voice = instance.activeVoices.get(pitch);
    if (!voice) return;

    const ctx = Tone.getContext().rawContext;
    const now = ctx.currentTime;
    const release = instance.settings.ampEnvelope.release;

    // Apply release envelope
    voice.masterGain.gain.cancelScheduledValues(now);
    voice.masterGain.gain.setValueAtTime(voice.masterGain.gain.value, now);
    voice.masterGain.gain.linearRampToValueAtTime(0, now + release);

    // Schedule cleanup after release
    const stopTime = now + release + 0.05;
    for (const osc of voice.oscillators) {
      osc.stop(stopTime);
    }

    instance.activeVoices.delete(pitch);
  }

  triggerAttackRelease(trackId: string, pitch: number, duration: number, velocity = 1) {
    this.noteOn(trackId, pitch, Math.round(velocity * 127));
    // Schedule noteOff after duration
    const ctx = Tone.getContext().rawContext;
    const releaseTime = ctx.currentTime + duration;
    setTimeout(() => {
      this.noteOff(trackId, pitch);
    }, (releaseTime - ctx.currentTime) * 1000);
  }

  setParameter(trackId: string, name: string, value: number | string | boolean) {
    const instance = this.instances.get(trackId);
    if (!instance) return;

    switch (name) {
      case 'outputGain': {
        const level = (value as number) !== 0
          ? Math.pow(10, (value as number) / 20)
          : 0.55;
        instance.output.gain.value = level;
        break;
      }
    }
  }

  /** Update partial amplitudes in real-time (for draw mode). */
  updatePartials(trackId: string, partials: AdditivePartial[]) {
    const instance = this.instances.get(trackId);
    if (!instance) return;
    instance.settings.partials = [...partials];
  }

  releaseAll() {
    for (const instance of this.instances.values()) {
      for (const pitch of [...instance.activeVoices.keys()]) {
        this._stopVoice(instance, pitch);
      }
    }
  }

  removeTrack(trackId: string) {
    const instance = this.instances.get(trackId);
    if (!instance) return;
    for (const pitch of [...instance.activeVoices.keys()]) {
      this._stopVoice(instance, pitch);
    }
    instance.output.dispose();
    this.instances.delete(trackId);
  }

  dispose() {
    for (const trackId of [...this.instances.keys()]) {
      this.removeTrack(trackId);
    }
  }

  private _stopVoice(instance: AdditiveInstance, pitch: number) {
    const voice = instance.activeVoices.get(pitch);
    if (!voice) return;
    for (const osc of voice.oscillators) {
      try { osc.stop(); } catch { /* already stopped */ }
    }
    try { voice.masterGain.disconnect(); } catch { /* already disconnected */ }
    instance.activeVoices.delete(pitch);
  }
}

export const additiveEngine = new AdditiveEngine();
