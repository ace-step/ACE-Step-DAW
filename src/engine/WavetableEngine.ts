/**
 * WavetableEngine — manages wavetable synthesis instances per track.
 *
 * Phase 5J migration: replaced `Tone.PolySynth(Tone.Synth)` with
 * `Tone.oscillator.type = 'custom'` with a local `NativeWavetableSynth`
 * — a small polyphonic voice manager that drives each voice's
 * OscillatorNode from a `PeriodicWave` built out of the partials
 * array. This is the same wavetable wiring Tone does under the hood,
 * but without the dependency.
 *
 * Note: `morphSpeed` is stored in settings for UI/persistence but automatic
 * real-time morphing requires a Transport-scheduled callback (not yet wired).
 * Use `setPosition()` to drive morphing from an external clock or automation lane.
 */

import type { InstrumentEnvelope, WavetableSettings } from '../types/project';
import { computePartialsAtPosition } from './wavetablePresets';
import { getAudioEngine } from '../hooks/useAudioEngine';
import { midiToFrequency } from '../utils/pitch';

// ─── NativeWavetableSynth ──────────────────────────────────────────────────

interface WavetableVoice {
  osc: OscillatorNode | null;
  gain: GainNode;
  /** The freq currently held in this voice slot (Hz) — doubles as the
   *  identity for per-note release. null when idle. */
  freq: number | null;
}

/**
 * Small polyphonic wavetable synth. Each voice owns a GainNode (pre-
 * connected to the output bus) and rents an OscillatorNode for the
 * note's lifetime. The oscillator is driven by a PeriodicWave derived
 * from the current partials — swapping partials at runtime doesn't
 * affect voices already sounding (their oscillator captured the
 * previous wave), matching Tone.PolySynth's behaviour.
 */
export class NativeWavetableSynth {
  private readonly _ctx: AudioContext;
  private readonly _output: GainNode;
  private readonly _voices: WavetableVoice[] = [];
  private readonly _maxPoly: number;
  private _nextVoice = 0;
  private readonly _freqToVoice = new Map<number, number>();
  private _periodicWave: PeriodicWave;
  private _envelope: InstrumentEnvelope = {
    attack: 0.01,
    decay: 0.1,
    sustain: 0.7,
    release: 0.3,
  };

  constructor(ctx: AudioContext, partials: number[], maxPolyphony = 8) {
    this._ctx = ctx;
    this._maxPoly = maxPolyphony;
    this._output = ctx.createGain();
    this._periodicWave = this._buildWave(partials);
    for (let i = 0; i < this._maxPoly; i++) {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(this._output);
      this._voices.push({ osc: null, gain, freq: null });
    }
  }

  get outputNode(): GainNode {
    return this._output;
  }

  private _buildWave(partials: number[]): PeriodicWave {
    // partials[i] is the amplitude of the (i+1)th harmonic.
    // `createPeriodicWave(real, imag)` uses imag[k] as the sine
    // coefficient for the kth harmonic; index 0 is DC (ignored).
    const len = partials.length + 1;
    const real = new Float32Array(len);
    const imag = new Float32Array(len);
    for (let i = 0; i < partials.length; i++) {
      imag[i + 1] = partials[i];
    }
    return this._ctx.createPeriodicWave(real, imag, { disableNormalization: false });
  }

  setPartials(partials: number[]): void {
    this._periodicWave = this._buildWave(partials);
  }

  setEnvelope(env: InstrumentEnvelope): void {
    this._envelope = { ...env };
  }

  private _allocVoice(freq: number): WavetableVoice {
    const existing = this._freqToVoice.get(freq);
    if (existing !== undefined) return this._voices[existing];

    const idx = this._nextVoice % this._maxPoly;
    this._nextVoice++;

    // Evict any note currently occupying this slot
    for (const [f, vi] of this._freqToVoice) {
      if (vi === idx) {
        this._freqToVoice.delete(f);
        break;
      }
    }
    this._freqToVoice.set(freq, idx);
    return this._voices[idx];
  }

  triggerAttack(freq: number, time?: number, velocity = 1): void {
    const t = time ?? this._ctx.currentTime;
    const voice = this._allocVoice(freq);
    const env = this._envelope;

    // Stop & disconnect any lingering osc in this slot
    if (voice.osc) {
      try { voice.osc.stop(t); } catch { /* already stopped */ }
      try { voice.osc.disconnect(); } catch { /* already disconnected */ }
    }

    const osc = this._ctx.createOscillator();
    osc.setPeriodicWave(this._periodicWave);
    osc.frequency.value = freq;
    osc.connect(voice.gain);

    voice.gain.gain.cancelScheduledValues(t);
    voice.gain.gain.setValueAtTime(0, t);
    voice.gain.gain.linearRampToValueAtTime(velocity, t + env.attack);
    voice.gain.gain.linearRampToValueAtTime(
      velocity * env.sustain,
      t + env.attack + env.decay,
    );

    osc.start(t);
    voice.osc = osc;
    voice.freq = freq;
  }

  triggerRelease(freq: number, time?: number): void {
    const idx = this._freqToVoice.get(freq);
    if (idx === undefined) return;
    const voice = this._voices[idx];
    if (!voice.osc) return;

    const t = time ?? this._ctx.currentTime;
    const env = this._envelope;
    // `AudioParam.value` reflects the current time's computed value,
    // not the value at `t` — so naively anchoring via
    // `setValueAtTime(value, t)` after `cancelScheduledValues` drops
    // the scheduled ADSR mid-ramp. `cancelAndHoldAtTime(t)` is the
    // correct primitive: it cancels future events while preserving
    // whatever value the scheduled ramp would reach at `t`. Fall
    // back to the old approach for environments that don't expose it.
    const gainParam = voice.gain.gain;
    if (typeof gainParam.cancelAndHoldAtTime === 'function') {
      gainParam.cancelAndHoldAtTime(t);
    } else {
      gainParam.cancelScheduledValues(t);
      gainParam.setValueAtTime(gainParam.value, t);
    }
    gainParam.linearRampToValueAtTime(0, t + env.release);

    const osc = voice.osc;
    osc.onended = () => {
      try { osc.disconnect(); } catch { /* already disconnected */ }
    };
    try { osc.stop(t + env.release + 0.01); } catch { /* already stopped */ }

    voice.osc = null;
    voice.freq = null;
    this._freqToVoice.delete(freq);
  }

  triggerAttackRelease(
    freq: number,
    duration: number,
    time?: number,
    velocity = 1,
  ): void {
    const t = time ?? this._ctx.currentTime;
    this.triggerAttack(freq, t, velocity);
    this.triggerRelease(freq, t + duration);
  }

  releaseAll(time?: number): void {
    const t = time ?? this._ctx.currentTime;
    const freqs = [...this._freqToVoice.keys()];
    for (const f of freqs) {
      this.triggerRelease(f, t);
    }
  }

  dispose(): void {
    for (const voice of this._voices) {
      if (voice.osc) {
        try { voice.osc.stop(); } catch { /* already stopped */ }
        try { voice.osc.disconnect(); } catch { /* already disconnected */ }
        voice.osc = null;
      }
      try { voice.gain.disconnect(); } catch { /* already disconnected */ }
    }
    this._voices.length = 0;
    this._freqToVoice.clear();
    try { this._output.disconnect(); } catch { /* already disconnected */ }
  }
}

// ─── WavetableEngine ───────────────────────────────────────────────────────

interface WavetableInstance {
  synth: NativeWavetableSynth;
  gain: GainNode;
  settings: WavetableSettings;
  currentPosition: number;
  connectTo: AudioNode | undefined;
}

class WavetableEngine {
  private instances = new Map<string, WavetableInstance>();

  /**
   * Ensure a wavetable synth exists for the given track, creating or
   * updating it as needed.
   */
  ensureTrackSynth(
    trackId: string,
    settings: WavetableSettings,
    connectTo?: AudioNode,
  ): NativeWavetableSynth {
    const existing = this.instances.get(trackId);
    if (existing) {
      this.applySettings(trackId, settings);
      if (connectTo && connectTo !== existing.connectTo) {
        try { existing.gain.disconnect(); } catch { /* already disconnected */ }
        existing.gain.connect(connectTo);
        existing.connectTo = connectTo;
      }
      return existing.synth;
    }

    const ctx = getAudioEngine().ctx;
    const partials = computePartialsAtPosition(settings.waveforms, settings.position);
    const synth = new NativeWavetableSynth(ctx, partials);
    synth.setEnvelope(settings.ampEnvelope);

    const gain = ctx.createGain();
    gain.gain.value = settings.outputGain;
    synth.outputNode.connect(gain);
    if (connectTo) {
      gain.connect(connectTo);
    } else {
      gain.connect(ctx.destination);
    }

    const instance: WavetableInstance = {
      synth,
      gain,
      settings: { ...settings },
      currentPosition: settings.position,
      connectTo,
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

    // Clamp here to match `setPosition` — an out-of-range value on a
    // persisted project or a bad upstream call would otherwise be
    // cached in `currentPosition` without clamping, even though
    // `computePartialsAtPosition` clamps internally for the wave itself.
    const clamped = Math.max(0, Math.min(1, settings.position));
    instance.settings = { ...settings, position: clamped };
    instance.currentPosition = clamped;

    const partials = computePartialsAtPosition(settings.waveforms, clamped);
    instance.synth.setPartials(partials);
    instance.synth.setEnvelope(settings.ampEnvelope);
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
    instance.synth.setPartials(partials);
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
  getSynth(trackId: string): NativeWavetableSynth | null {
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
    const engine = getAudioEngine();
    if (engine.ctx.state !== 'running') {
      await engine.resume();
    }
    const synth = this.ensureTrackSynth(trackId, settings);
    synth.triggerAttackRelease(midiToFrequency(pitch), duration, undefined, velocity / 127);
  }

  /**
   * Trigger note on.
   */
  noteOn(trackId: string, pitch: number, velocity = 100): void {
    const instance = this.instances.get(trackId);
    if (!instance) return;
    instance.synth.triggerAttack(midiToFrequency(pitch), undefined, velocity / 127);
  }

  /**
   * Trigger note off.
   */
  noteOff(trackId: string, pitch: number): void {
    const instance = this.instances.get(trackId);
    if (!instance) return;
    instance.synth.triggerRelease(midiToFrequency(pitch));
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
    try { instance.gain.disconnect(); } catch { /* already disconnected */ }
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
