/**
 * Voice management system for polyphonic synthesizers.
 *
 * Handles voice allocation, stealing, and lifecycle management.
 * AudioWorklet-safe, zero dependencies.
 *
 * Part of Phase 4: Synthesizer Migration (#1127).
 */

export type VoiceStealingStrategy = 'oldest' | 'quietest' | 'lowest';

export interface Voice<T> {
  /** The synth voice instance. */
  instance: T;
  /** Currently held note (MIDI number), or -1 if free. */
  note: number;
  /** Timestamp when voice was triggered (for oldest-steal). */
  triggerTime: number;
  /** Whether voice is in release phase. */
  releasing: boolean;
}

export interface VoiceCallbacks<T> {
  /** Called when a voice needs to trigger attack. */
  onAttack: (voice: T, note: number, velocity: number) => void;
  /** Called when a voice needs to trigger release. */
  onRelease: (voice: T) => void;
  /** Get current amplitude of a voice (for quietest-steal). */
  getAmplitude?: (voice: T) => number;
}

export class VoiceManager<T> {
  private readonly _voices: Voice<T>[];
  private readonly _callbacks: VoiceCallbacks<T>;
  private _strategy: VoiceStealingStrategy;
  private _time = 0;

  constructor(
    voiceInstances: T[],
    callbacks: VoiceCallbacks<T>,
    strategy: VoiceStealingStrategy = 'oldest',
  ) {
    this._voices = voiceInstances.map(instance => ({
      instance,
      note: -1,
      triggerTime: 0,
      releasing: false,
    }));
    this._callbacks = callbacks;
    this._strategy = strategy;
  }

  get maxPolyphony(): number { return this._voices.length; }
  get strategy(): VoiceStealingStrategy { return this._strategy; }
  set strategy(s: VoiceStealingStrategy) { this._strategy = s; }

  /** Get the count of active (non-free) voices. */
  get activeCount(): number {
    return this._voices.filter(v => v.note >= 0).length;
  }

  /**
   * Trigger a note. Returns the voice instance that was allocated.
   */
  noteOn(note: number, velocity: number): T {
    this._time++;

    // 1. Look for a free voice
    let voice = this._voices.find(v => v.note < 0);

    // 2. Look for a voice already playing this note (retrigger)
    if (!voice) {
      voice = this._voices.find(v => v.note === note);
    }

    // 3. Look for a releasing voice
    if (!voice) {
      voice = this._voices.find(v => v.releasing);
    }

    // 4. Steal according to strategy
    if (!voice) {
      voice = this._steal();
    }

    // Release old note if voice was active
    if (voice.note >= 0) {
      this._callbacks.onRelease(voice.instance);
    }

    voice.note = note;
    voice.triggerTime = this._time;
    voice.releasing = false;
    this._callbacks.onAttack(voice.instance, note, velocity);

    return voice.instance;
  }

  /**
   * Release a note. If multiple voices play the same note, releases the oldest.
   */
  noteOff(note: number): void {
    // Find the oldest voice playing this note (smallest triggerTime)
    let voice: Voice<T> | undefined;
    for (const candidate of this._voices) {
      if (candidate.note === note && !candidate.releasing) {
        if (!voice || candidate.triggerTime < voice.triggerTime) {
          voice = candidate;
        }
      }
    }
    if (voice) {
      voice.releasing = true;
      this._callbacks.onRelease(voice.instance);
    }
  }

  /**
   * Mark a voice as free (call when envelope reaches idle).
   */
  voiceEnded(instance: T): void {
    const voice = this._voices.find(v => v.instance === instance);
    if (voice) {
      voice.note = -1;
      voice.releasing = false;
    }
  }

  /** Release all active voices. */
  releaseAll(): void {
    for (const voice of this._voices) {
      if (voice.note >= 0 && !voice.releasing) {
        voice.releasing = true;
        this._callbacks.onRelease(voice.instance);
      }
    }
  }

  /** Force-stop all voices immediately. */
  stopAll(): void {
    for (const voice of this._voices) {
      if (voice.note >= 0) {
        this._callbacks.onRelease(voice.instance);
        voice.note = -1;
        voice.releasing = false;
      }
    }
  }

  private _steal(): Voice<T> {
    switch (this._strategy) {
      case 'oldest':
        return this._stealOldest();
      case 'quietest':
        return this._stealQuietest();
      case 'lowest':
        return this._stealLowest();
    }
  }

  private _stealOldest(): Voice<T> {
    let oldest = this._voices[0];
    for (let i = 1; i < this._voices.length; i++) {
      if (this._voices[i].triggerTime < oldest.triggerTime) {
        oldest = this._voices[i];
      }
    }
    return oldest;
  }

  private _stealQuietest(): Voice<T> {
    const getAmp = this._callbacks.getAmplitude;
    if (!getAmp) return this._stealOldest();

    let quietest = this._voices[0];
    let minAmp = getAmp(quietest.instance);

    for (let i = 1; i < this._voices.length; i++) {
      const amp = getAmp(this._voices[i].instance);
      if (amp < minAmp) {
        minAmp = amp;
        quietest = this._voices[i];
      }
    }
    return quietest;
  }

  private _stealLowest(): Voice<T> {
    let lowest = this._voices[0];
    for (let i = 1; i < this._voices.length; i++) {
      if (this._voices[i].note < lowest.note) {
        lowest = this._voices[i];
      }
    }
    return lowest;
  }
}
