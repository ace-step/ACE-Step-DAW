import * as Tone from 'tone';
import type { SynthPreset } from '../types/project';

interface SynthInstance {
  synth: Tone.PolySynth;
  preset: SynthPreset;
  gain: Tone.Gain;
}

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

class SynthEngine {
  private synths = new Map<string, SynthInstance>();
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

  getSynth(trackId: string): Tone.PolySynth | null {
    return this.synths.get(trackId)?.synth ?? null;
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
    synth.triggerAttackRelease(freq, duration, undefined, velocity / 127);
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
  }
}

export const synthEngine = new SynthEngine();
