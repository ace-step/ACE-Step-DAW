import * as Tone from 'tone';
import type { WavetableSettings } from '../types/project';
import { computePartialsAtPosition } from './wavetablePresets';

interface WavetableInstance {
  synth: Tone.PolySynth;
  gain: Tone.Gain;
  settings: WavetableSettings;
  /** Current morph position (updated manually via setPosition). */
  currentPosition: number;
}

/**
 * Engine that manages wavetable synthesis instances per track.
 * Uses Tone.PolySynth with custom `partials` arrays and interpolates
 * between waveform tables based on position.
 *
 * Note: `morphSpeed` is stored in settings for UI/persistence but automatic
 * real-time morphing requires a Transport-scheduled callback (not yet wired).
 * Use `setPosition()` to drive morphing from an external clock or automation lane.
 */
class WavetableEngine {
  private instances = new Map<string, WavetableInstance>();

  /**
   * Ensure a wavetable synth exists for the given track, creating or
   * updating it as needed.
   */
  ensureTrackSynth(
    trackId: string,
    settings: WavetableSettings,
    connectTo?: Tone.InputNode,
  ): Tone.PolySynth {
    const existing = this.instances.get(trackId);
    if (existing) {
      this.applySettings(trackId, settings);
      return existing.synth;
    }

    // Create new instance
    const partials = computePartialsAtPosition(settings.waveforms, settings.position);
    const synth = new Tone.PolySynth(Tone.Synth);
    synth.set({
      oscillator: { type: 'custom', partials },
      envelope: {
        attack: settings.ampEnvelope.attack,
        decay: settings.ampEnvelope.decay,
        sustain: settings.ampEnvelope.sustain,
        release: settings.ampEnvelope.release,
      },
    });

    const gain = new Tone.Gain(settings.outputGain);
    synth.connect(gain);
    if (connectTo) {
      gain.connect(connectTo);
    } else {
      gain.toDestination();
    }

    const instance: WavetableInstance = {
      synth,
      gain,
      settings: { ...settings },
      currentPosition: settings.position,
    };

    this.instances.set(trackId, instance);
    return synth;
  }

  /**
   * Apply updated settings to an existing wavetable instance.
   */
  applySettings(trackId: string, settings: WavetableSettings): void {
    const instance = this.instances.get(trackId);
    if (!instance) return;

    instance.settings = { ...settings };
    instance.currentPosition = settings.position;

    const partials = computePartialsAtPosition(settings.waveforms, settings.position);
    instance.synth.set({
      oscillator: { type: 'custom', partials },
      envelope: {
        attack: settings.ampEnvelope.attack,
        decay: settings.ampEnvelope.decay,
        sustain: settings.ampEnvelope.sustain,
        release: settings.ampEnvelope.release,
      },
    });

    instance.gain.gain.value = settings.outputGain;
  }

  /**
   * Set the wavetable position (0-1) and update partials in real-time.
   */
  setPosition(trackId: string, position: number): void {
    const instance = this.instances.get(trackId);
    if (!instance) return;

    const clamped = Math.max(0, Math.min(1, position));
    instance.currentPosition = clamped;
    const partials = computePartialsAtPosition(instance.settings.waveforms, clamped);
    instance.synth.set({ oscillator: { type: 'custom', partials } });
  }

  /**
   * Get the current morph position for a track.
   */
  getPosition(trackId: string): number {
    return this.instances.get(trackId)?.currentPosition ?? 0;
  }

  /**
   * Get the synth instance for a track (for external note triggering).
   */
  getSynth(trackId: string): Tone.PolySynth | null {
    return this.instances.get(trackId)?.synth ?? null;
  }

  /**
   * Play a note using the wavetable synth.
   */
  async playNote(
    trackId: string,
    pitch: number,
    velocity: number,
    duration: number,
    settings: WavetableSettings,
  ): Promise<void> {
    if (Tone.getContext().state !== 'running') {
      await Tone.start();
    }
    const synth = this.ensureTrackSynth(trackId, settings);
    const freq = Tone.Frequency(pitch, 'midi').toFrequency();
    synth.triggerAttackRelease(freq, duration, undefined, velocity / 127);
  }

  /**
   * Trigger note on.
   */
  noteOn(trackId: string, pitch: number, velocity = 100): void {
    const instance = this.instances.get(trackId);
    if (!instance) return;
    const freq = Tone.Frequency(pitch, 'midi').toFrequency();
    instance.synth.triggerAttack(freq, undefined, velocity / 127);
  }

  /**
   * Trigger note off.
   */
  noteOff(trackId: string, pitch: number): void {
    const instance = this.instances.get(trackId);
    if (!instance) return;
    const freq = Tone.Frequency(pitch, 'midi').toFrequency();
    instance.synth.triggerRelease(freq);
  }

  /**
   * Release all notes on all tracks.
   */
  releaseAll(): void {
    for (const instance of this.instances.values()) {
      instance.synth.releaseAll();
    }
  }

  /**
   * Remove and dispose a track's wavetable synth.
   */
  removeTrackSynth(trackId: string): void {
    const instance = this.instances.get(trackId);
    if (!instance) return;
    instance.synth.releaseAll();
    instance.synth.dispose();
    instance.gain.dispose();
    this.instances.delete(trackId);
  }

  /**
   * Dispose all instances.
   */
  dispose(): void {
    for (const trackId of this.instances.keys()) {
      this.removeTrackSynth(trackId);
    }
  }
}

export const wavetableEngine = new WavetableEngine();
