import * as Tone from 'tone';
import type { SamplerConfig } from '../types/project';

interface SamplerInstance {
  sampler: Tone.Sampler;
  gain: Tone.Gain;
  audioKey: string;
}

/** Default ADSR values for new sampler configs. */
export const DEFAULT_SAMPLER_CONFIG: Omit<SamplerConfig, 'audioKey'> = {
  rootNote: 60,
  attack: 0.005,
  decay: 0.1,
  sustain: 1,
  release: 0.3,
};

/**
 * Create a SamplerConfig with sensible defaults.
 */
export function createSamplerConfig(audioKey: string, overrides?: Partial<SamplerConfig>): SamplerConfig {
  return {
    ...DEFAULT_SAMPLER_CONFIG,
    audioKey,
    ...overrides,
  };
}

/**
 * Engine that manages Tone.js Sampler instances per track.
 * A sampler loads an audio buffer and pitch-shifts playback based on
 * the MIDI note relative to the configured root note.
 */
class SamplerEngine {
  private samplers = new Map<string, SamplerInstance>();
  private previewSampler: Tone.Sampler | null = null;
  private previewGain: Tone.Gain | null = null;

  async ensureStarted() {
    if (Tone.getContext().state !== 'running') {
      await Tone.start();
    }
  }

  /**
   * Create or update a Tone.js Sampler for a track.
   * If the audioKey hasn't changed, returns the existing sampler.
   */
  ensureTrackSampler(
    trackId: string,
    config: SamplerConfig,
    audioBuffer: AudioBuffer,
    connectTo?: Tone.InputNode,
  ): Tone.Sampler {
    const existing = this.samplers.get(trackId);
    if (existing && existing.audioKey === config.audioKey) {
      // Update envelope on existing sampler
      this._applyEnvelope(existing.sampler, config);
      return existing.sampler;
    }

    // Dispose old sampler if audioKey changed
    if (existing) {
      this._disposeInstance(existing);
    }

    const toneBuffer = new Tone.ToneAudioBuffer(audioBuffer);
    const noteName = Tone.Frequency(config.rootNote, 'midi').toNote();

    const sampler = new Tone.Sampler({
      urls: { [noteName]: toneBuffer },
      attack: config.attack,
      release: config.release,
    });

    const gain = new Tone.Gain(0.55);
    sampler.connect(gain);
    if (connectTo) {
      gain.connect(connectTo);
    } else {
      gain.toDestination();
    }

    this.samplers.set(trackId, { sampler, gain, audioKey: config.audioKey });
    return sampler;
  }

  getSampler(trackId: string): Tone.Sampler | null {
    return this.samplers.get(trackId)?.sampler ?? null;
  }

  /**
   * Preview a sample at a given pitch (for audition / piano roll click).
   */
  async previewNote(
    audioBuffer: AudioBuffer,
    rootNote: number,
    pitch: number,
    velocity = 100,
    duration = 0.3,
  ) {
    await this.ensureStarted();
    if (this.previewSampler) {
      this.previewSampler.dispose();
      this.previewGain?.dispose();
    }
    const toneBuffer = new Tone.ToneAudioBuffer(audioBuffer);
    const noteName = Tone.Frequency(rootNote, 'midi').toNote();
    this.previewSampler = new Tone.Sampler({ urls: { [noteName]: toneBuffer } });
    this.previewGain = new Tone.Gain(0.3).toDestination();
    this.previewSampler.connect(this.previewGain);

    const freq = Tone.Frequency(pitch, 'midi').toNote();
    this.previewSampler.triggerAttackRelease(freq, duration, undefined, velocity / 127);
  }

  /** Trigger note on for a track sampler (for live playing / recording). */
  noteOn(trackId: string, pitch: number, velocity = 100) {
    const instance = this.samplers.get(trackId);
    if (!instance) return;
    const note = Tone.Frequency(pitch, 'midi').toNote();
    instance.sampler.triggerAttack(note, undefined, velocity / 127);
  }

  /** Trigger note off for a track sampler. */
  noteOff(trackId: string, pitch: number) {
    const instance = this.samplers.get(trackId);
    if (!instance) return;
    const note = Tone.Frequency(pitch, 'midi').toNote();
    instance.sampler.triggerRelease(note);
  }

  /** Release all currently sounding notes on all track samplers. */
  releaseAll() {
    for (const instance of this.samplers.values()) {
      instance.sampler.releaseAll();
    }
  }

  removeTrackSampler(trackId: string) {
    const instance = this.samplers.get(trackId);
    if (!instance) return;
    this._disposeInstance(instance);
    this.samplers.delete(trackId);
  }

  dispose() {
    for (const trackId of this.samplers.keys()) {
      this.removeTrackSampler(trackId);
    }
    this.previewSampler?.dispose();
    this.previewGain?.dispose();
    this.previewSampler = null;
    this.previewGain = null;
  }

  private _applyEnvelope(sampler: Tone.Sampler, config: SamplerConfig) {
    sampler.attack = config.attack;
    sampler.release = config.release;
  }

  private _disposeInstance(instance: SamplerInstance) {
    instance.sampler.releaseAll();
    instance.sampler.dispose();
    instance.gain.dispose();
  }
}

export const samplerEngine = new SamplerEngine();
