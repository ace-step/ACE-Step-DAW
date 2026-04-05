/**
 * Native Web Audio synthesizer implementations.
 *
 * Uses OscillatorNode + GainNode + BiquadFilterNode for synthesis,
 * eliminating Tone.js dependency for synth creation.
 *
 * Part of Phase 4: Synthesizer Migration (#1127).
 */

import type {
  IDSPNode,
  IDSPPolySynth,
  IDSPFMSynth,
  IDSPMembraneSynth,
  IDSPNoiseSynth,
  IDSPMetalSynth,
  IDSPSynth,
  IDSPFrequencyEnvelope,
  IDSPBufferSource,
  IDSPPolySynthOptions,
  IDSPFMSynthOptions,
  IDSPMembraneSynthOptions,
  IDSPNoiseSynthOptions,
  IDSPMetalSynthOptions,
  IDSPSynthOptions,
  IDSPFrequencyEnvelopeOptions,
} from './interfaces';

import { noteToFreq } from './core/dsp-utils';

// ---------------------------------------------------------------------------
// Base wrapper
// ---------------------------------------------------------------------------

class NativeSynthBase implements IDSPNode {
  protected readonly _output: GainNode;
  protected readonly _ctx: AudioContext;

  constructor(ctx: AudioContext) {
    this._ctx = ctx;
    this._output = ctx.createGain();
  }

  get inputNode(): AudioNode { return this._output; }
  get outputNode(): AudioNode { return this._output; }

  connect(dest: IDSPNode): IDSPNode {
    this._output.connect(dest.inputNode);
    return dest;
  }

  connectNative(dest: AudioNode): AudioNode {
    this._output.connect(dest);
    return dest;
  }

  connectParam(dest: AudioParam): void {
    this._output.connect(dest);
  }

  disconnect(dest?: IDSPNode | AudioNode): void {
    if (!dest) {
      this._output.disconnect();
    } else if ('inputNode' in (dest as IDSPNode)) {
      this._output.disconnect((dest as IDSPNode).inputNode);
    } else {
      this._output.disconnect(dest as AudioNode);
    }
  }

  dispose(): void {
    this._output.disconnect();
  }
}

// ---------------------------------------------------------------------------
// Helper: parse note name to frequency
// ---------------------------------------------------------------------------

function noteNameToFreq(note: string): number {
  const match = note.match(/^([A-Ga-g])([#b]?)(-?\d+)$/);
  if (!match) return 440;

  const noteNames: Record<string, number> = {
    C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
    c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11,
  };

  let semitone = noteNames[match[1]] ?? 0;
  if (match[2] === '#') semitone++;
  if (match[2] === 'b') semitone--;
  const octave = parseInt(match[3], 10);
  const midi = (octave + 1) * 12 + semitone;
  return noteToFreq(midi);
}

function parseDuration(dur: number | string, ctx: AudioContext): number {
  if (typeof dur === 'number') return dur;
  // Parse Tone.js notation (e.g., '8n', '4n', '2n')
  const match = dur.match(/^(\d+)n$/);
  if (match) {
    return 60 / 120 * (4 / parseInt(match[1], 10)); // assume 120 BPM
  }
  return parseFloat(dur) || 0.25;
}

// ---------------------------------------------------------------------------
// Single voice with Osc + Gain envelope
// ---------------------------------------------------------------------------

interface MonoVoice {
  osc: OscillatorNode | null;
  gain: GainNode;
  filter: BiquadFilterNode;
}

function createMonoVoice(ctx: AudioContext, oscType: OscillatorType = 'triangle'): MonoVoice {
  const gain = ctx.createGain();
  gain.gain.value = 0;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 5000;
  filter.Q.value = 1;
  filter.connect(gain);
  return { osc: null, gain, filter };
}

// ---------------------------------------------------------------------------
// NativePolySynth
// ---------------------------------------------------------------------------

export class NativePolySynth extends NativeSynthBase implements IDSPPolySynth {
  private readonly _voices: MonoVoice[];
  private readonly _maxPoly: number;
  private readonly _oscType: OscillatorType;
  private readonly _envelope: {
    attack: number; decay: number; sustain: number; release: number;
  };
  private _nextVoice = 0;

  constructor(ctx: AudioContext, options?: IDSPPolySynthOptions) {
    super(ctx);
    this._maxPoly = options?.maxPolyphony ?? 8;
    this._oscType = (options?.oscillator?.type as OscillatorType) ?? 'triangle';
    this._envelope = {
      attack: options?.envelope?.attack ?? 0.01,
      decay: options?.envelope?.decay ?? 0.1,
      sustain: options?.envelope?.sustain ?? 0.7,
      release: options?.envelope?.release ?? 0.3,
    };

    this._voices = [];
    for (let i = 0; i < this._maxPoly; i++) {
      const voice = createMonoVoice(ctx, this._oscType);
      voice.gain.connect(this._output);
      this._voices.push(voice);
    }
  }

  private _allocVoice(): MonoVoice {
    const voice = this._voices[this._nextVoice % this._maxPoly];
    this._nextVoice++;
    return voice;
  }

  triggerAttack(notes: string | string[], time?: number, velocity = 1): void {
    const noteArr = Array.isArray(notes) ? notes : [notes];
    const t = time ?? this._ctx.currentTime;

    for (const note of noteArr) {
      const voice = this._allocVoice();
      const freq = noteNameToFreq(note);
      const env = this._envelope;

      // Stop and disconnect old oscillator to prevent node leaks
      if (voice.osc) {
        try { voice.osc.stop(t); } catch { /* */ }
        try { voice.osc.disconnect(); } catch { /* */ }
      }

      // Create new oscillator
      const osc = this._ctx.createOscillator();
      osc.type = this._oscType;
      osc.frequency.value = freq;
      osc.connect(voice.filter);
      voice.osc = osc;

      // ADSR attack
      voice.gain.gain.cancelScheduledValues(t);
      voice.gain.gain.setValueAtTime(0, t);
      voice.gain.gain.linearRampToValueAtTime(velocity, t + env.attack);
      voice.gain.gain.linearRampToValueAtTime(
        velocity * env.sustain,
        t + env.attack + env.decay,
      );

      osc.start(t);
    }
  }

  triggerRelease(notes: string | string[], time?: number): void {
    const t = time ?? this._ctx.currentTime;
    const env = this._envelope;

    // Release all active voices (simplified — in production would track per-note)
    for (const voice of this._voices) {
      if (voice.osc) {
        voice.gain.gain.cancelScheduledValues(t);
        voice.gain.gain.setValueAtTime(voice.gain.gain.value, t);
        voice.gain.gain.linearRampToValueAtTime(0, t + env.release);
        try { voice.osc.stop(t + env.release + 0.01); } catch { /* */ }
        voice.osc = null;
      }
    }
  }

  triggerAttackRelease(
    notes: string | string[],
    duration: number | string,
    time?: number,
    velocity?: number,
  ): void {
    const t = time ?? this._ctx.currentTime;
    const dur = parseDuration(duration, this._ctx);
    this.triggerAttack(notes, t, velocity);
    this.triggerRelease(notes, t + dur);
  }

  releaseAll(time?: number): void {
    this.triggerRelease([], time);
  }

  set(options: Record<string, unknown>): void {
    // Apply options to all voices (simplified)
    if (options.oscillator && typeof options.oscillator === 'object') {
      const oscOpts = options.oscillator as { type?: string };
      if (oscOpts.type) {
        for (const voice of this._voices) {
          if (voice.osc) voice.osc.type = oscOpts.type as OscillatorType;
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// NativeSynth (mono)
// ---------------------------------------------------------------------------

export class NativeSynth extends NativeSynthBase implements IDSPSynth {
  private readonly _voice: MonoVoice;
  private readonly _oscType: OscillatorType;
  private readonly _envelope: {
    attack: number; decay: number; sustain: number; release: number;
  };

  constructor(ctx: AudioContext, options?: IDSPSynthOptions) {
    super(ctx);
    this._oscType = (options?.oscillator?.type as OscillatorType) ?? 'triangle';
    this._envelope = {
      attack: options?.envelope?.attack ?? 0.01,
      decay: options?.envelope?.decay ?? 0.1,
      sustain: options?.envelope?.sustain ?? 0.7,
      release: options?.envelope?.release ?? 0.3,
    };
    this._voice = createMonoVoice(ctx, this._oscType);
    this._voice.gain.connect(this._output);
  }

  triggerAttackRelease(
    note: string,
    duration: number | string,
    time?: number,
    velocity = 1,
  ): void {
    const t = time ?? this._ctx.currentTime;
    const dur = parseDuration(duration, this._ctx);
    const freq = noteNameToFreq(note);
    const env = this._envelope;

    if (this._voice.osc) {
      try { this._voice.osc.stop(t); } catch { /* */ }
    }

    const osc = this._ctx.createOscillator();
    osc.type = this._oscType;
    osc.frequency.value = freq;
    osc.connect(this._voice.filter);
    this._voice.osc = osc;

    const g = this._voice.gain.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(0, t);
    g.linearRampToValueAtTime(velocity, t + env.attack);
    g.linearRampToValueAtTime(velocity * env.sustain, t + env.attack + env.decay);
    g.linearRampToValueAtTime(0, t + dur + env.release);

    osc.start(t);
    osc.stop(t + dur + env.release + 0.01);
  }
}

// ---------------------------------------------------------------------------
// NativeFMSynth
// ---------------------------------------------------------------------------

export class NativeFMSynth extends NativeSynthBase implements IDSPFMSynth {
  private readonly _oscType: OscillatorType;
  private readonly _modulationIndex: number;
  private readonly _harmonicity: number;
  private readonly _envelope: {
    attack: number; decay: number; sustain: number; release: number;
  };
  /** Track active nodes for cleanup on release. */
  private _activeCarrier: OscillatorNode | null = null;
  private _activeModulator: OscillatorNode | null = null;
  private _activeGain: GainNode | null = null;

  constructor(ctx: AudioContext, options?: IDSPFMSynthOptions) {
    super(ctx);
    this._oscType = (options?.oscillator?.type as OscillatorType) ?? 'sine';
    this._modulationIndex = options?.modulationIndex ?? 10;
    this._harmonicity = options?.harmonicity ?? 3;
    this._envelope = {
      attack: options?.envelope?.attack ?? 0.01,
      decay: options?.envelope?.decay ?? 0.1,
      sustain: options?.envelope?.sustain ?? 0.7,
      release: options?.envelope?.release ?? 0.3,
    };
  }

  triggerAttack(note: string, time?: number, velocity = 1): void {
    this._playFM(note, time, velocity, null);
  }

  triggerRelease(time?: number): void {
    const t = time ?? this._ctx.currentTime;
    const rel = this._envelope.release;
    if (this._activeGain) {
      this._activeGain.gain.cancelScheduledValues(t);
      this._activeGain.gain.setValueAtTime(this._activeGain.gain.value, t);
      this._activeGain.gain.linearRampToValueAtTime(0, t + rel);
    }
    // Stop oscillators after release
    if (this._activeCarrier) {
      try { this._activeCarrier.stop(t + rel + 0.01); } catch { /* */ }
      this._activeCarrier = null;
    }
    if (this._activeModulator) {
      try { this._activeModulator.stop(t + rel + 0.01); } catch { /* */ }
      this._activeModulator = null;
    }
  }

  triggerAttackRelease(
    note: string,
    duration: number | string,
    time?: number,
    velocity?: number,
  ): void {
    const dur = parseDuration(duration, this._ctx);
    this._playFM(note, time, velocity ?? 1, dur);
  }

  private _playFM(note: string, time: number | undefined, velocity: number, duration: number | null): void {
    const t = time ?? this._ctx.currentTime;
    const freq = noteNameToFreq(note);
    const env = this._envelope;

    // Carrier
    const carrier = this._ctx.createOscillator();
    carrier.type = this._oscType;
    carrier.frequency.value = freq;

    // Modulator
    const modulator = this._ctx.createOscillator();
    modulator.frequency.value = freq * this._harmonicity;

    const modGain = this._ctx.createGain();
    modGain.gain.value = freq * this._modulationIndex;

    modulator.connect(modGain);
    modGain.connect(carrier.frequency);

    const envGain = this._ctx.createGain();
    carrier.connect(envGain);
    envGain.connect(this._output);

    // Envelope
    envGain.gain.setValueAtTime(0, t);
    envGain.gain.linearRampToValueAtTime(velocity, t + env.attack);
    envGain.gain.linearRampToValueAtTime(velocity * env.sustain, t + env.attack + env.decay);

    this._activeCarrier = carrier;
    this._activeModulator = modulator;
    this._activeGain = envGain;

    carrier.start(t);
    modulator.start(t);

    if (duration !== null) {
      envGain.gain.linearRampToValueAtTime(0, t + duration + env.release);
      carrier.stop(t + duration + env.release + 0.01);
      modulator.stop(t + duration + env.release + 0.01);
    }
  }
}

// ---------------------------------------------------------------------------
// NativeMembraneSynth (kick/tom)
// ---------------------------------------------------------------------------

export class NativeMembraneSynth extends NativeSynthBase implements IDSPMembraneSynth {
  private readonly _pitchDecay: number;
  private readonly _octaves: number;

  constructor(ctx: AudioContext, options?: IDSPMembraneSynthOptions) {
    super(ctx);
    this._pitchDecay = options?.pitchDecay ?? 0.05;
    this._octaves = options?.octaves ?? 10;
  }

  triggerAttackRelease(
    note: string,
    duration: number | string,
    time?: number,
    velocity = 1,
  ): void {
    const t = time ?? this._ctx.currentTime;
    const dur = parseDuration(duration, this._ctx);
    const freq = noteNameToFreq(note);

    const osc = this._ctx.createOscillator();
    osc.type = 'sine';

    // Pitch sweep: start high, sweep down
    const startFreq = freq * Math.pow(2, this._octaves);
    osc.frequency.setValueAtTime(startFreq, t);
    osc.frequency.exponentialRampToValueAtTime(freq, t + this._pitchDecay);

    const gain = this._ctx.createGain();
    gain.gain.setValueAtTime(velocity, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

    osc.connect(gain);
    gain.connect(this._output);
    osc.start(t);
    osc.stop(t + dur + 0.01);
  }
}

// ---------------------------------------------------------------------------
// NativeNoiseSynth (hi-hat/snare)
// ---------------------------------------------------------------------------

export class NativeNoiseSynth extends NativeSynthBase implements IDSPNoiseSynth {
  private readonly _envelope: {
    attack: number; decay: number; sustain: number; release: number;
  };

  constructor(ctx: AudioContext, options?: IDSPNoiseSynthOptions) {
    super(ctx);
    this._envelope = {
      attack: options?.envelope?.attack ?? 0.001,
      decay: options?.envelope?.decay ?? 0.1,
      sustain: options?.envelope?.sustain ?? 0,
      release: options?.envelope?.release ?? 0.1,
    };
  }

  triggerAttackRelease(
    duration: number | string,
    time?: number,
    velocity = 1,
  ): void {
    const t = time ?? this._ctx.currentTime;
    const dur = parseDuration(duration, this._ctx);
    const env = this._envelope;

    // Create noise buffer
    const bufferSize = Math.max(1, Math.round(this._ctx.sampleRate * (dur + env.release + 0.1)));
    const buffer = this._ctx.createBuffer(1, bufferSize, this._ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const source = this._ctx.createBufferSource();
    source.buffer = buffer;

    const gain = this._ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(velocity, t + env.attack);
    gain.gain.linearRampToValueAtTime(velocity * env.sustain, t + env.attack + env.decay);
    gain.gain.linearRampToValueAtTime(0, t + dur + env.release);

    source.connect(gain);
    gain.connect(this._output);
    source.start(t);
    source.stop(t + dur + env.release + 0.01);
  }
}

// ---------------------------------------------------------------------------
// NativeMetalSynth (cymbal)
// ---------------------------------------------------------------------------

export class NativeMetalSynth extends NativeSynthBase implements IDSPMetalSynth {
  private readonly _frequency: number;
  private readonly _harmonicity: number;
  private readonly _modulationIndex: number;
  private readonly _envelope: {
    attack: number; decay: number; release: number;
  };

  constructor(ctx: AudioContext, options?: IDSPMetalSynthOptions) {
    super(ctx);
    this._frequency = options?.frequency ?? 200;
    this._harmonicity = options?.harmonicity ?? 5.1;
    this._modulationIndex = options?.modulationIndex ?? 32;
    this._envelope = {
      attack: options?.envelope?.attack ?? 0.001,
      decay: options?.envelope?.decay ?? 1.4,
      release: options?.envelope?.release ?? 0.2,
    };
  }

  triggerAttackRelease(
    duration: number | string,
    time?: number,
    velocity = 1,
  ): void {
    const t = time ?? this._ctx.currentTime;
    const dur = parseDuration(duration, this._ctx);
    const env = this._envelope;

    // FM synthesis for metallic timbre
    const carrier = this._ctx.createOscillator();
    carrier.type = 'square';
    carrier.frequency.value = this._frequency;

    const mod = this._ctx.createOscillator();
    mod.frequency.value = this._frequency * this._harmonicity;

    const modGain = this._ctx.createGain();
    modGain.gain.value = this._frequency * this._modulationIndex;

    mod.connect(modGain);
    modGain.connect(carrier.frequency);

    // Bandpass for bell-like quality
    const filter = this._ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = this._frequency * 3;
    filter.Q.value = 1;

    const gain = this._ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(velocity, t + env.attack);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur + env.release);

    carrier.connect(filter);
    filter.connect(gain);
    gain.connect(this._output);

    carrier.start(t);
    mod.start(t);
    carrier.stop(t + dur + env.release + 0.01);
    mod.stop(t + dur + env.release + 0.01);
  }
}

// ---------------------------------------------------------------------------
// NativeFrequencyEnvelope
// ---------------------------------------------------------------------------

export class NativeFrequencyEnvelope extends NativeSynthBase implements IDSPFrequencyEnvelope {
  attack = 0.01;
  decay = 0.1;
  sustain = 0.5;
  release = 0.3;
  baseFrequency = 200;
  octaves = 4;

  private readonly _gain: GainNode;

  constructor(ctx: AudioContext, options?: IDSPFrequencyEnvelopeOptions) {
    super(ctx);
    if (options?.attack !== undefined) this.attack = options.attack;
    if (options?.decay !== undefined) this.decay = options.decay;
    if (options?.sustain !== undefined) this.sustain = options.sustain;
    if (options?.release !== undefined) this.release = options.release;
    if (options?.baseFrequency !== undefined) this.baseFrequency = options.baseFrequency;
    if (options?.octaves !== undefined) this.octaves = options.octaves;

    this._gain = ctx.createGain();
    this._gain.gain.value = 0;
    this._gain.connect(this._output);
  }

  triggerAttack(time?: number): void {
    const t = time ?? this._ctx.currentTime;
    const peakFreq = this.baseFrequency * Math.pow(2, this.octaves);
    const sustainFreq = this.baseFrequency + (peakFreq - this.baseFrequency) * this.sustain;

    this._gain.gain.cancelScheduledValues(t);
    this._gain.gain.setValueAtTime(this.baseFrequency, t);
    this._gain.gain.linearRampToValueAtTime(peakFreq, t + this.attack);
    this._gain.gain.linearRampToValueAtTime(sustainFreq, t + this.attack + this.decay);
  }

  triggerRelease(time?: number): void {
    const t = time ?? this._ctx.currentTime;
    this._gain.gain.cancelScheduledValues(t);
    this._gain.gain.setValueAtTime(this._gain.gain.value, t);
    this._gain.gain.linearRampToValueAtTime(this.baseFrequency, t + this.release);
  }
}

// ---------------------------------------------------------------------------
// NativeBufferSource
// ---------------------------------------------------------------------------

export class NativeBufferSource extends NativeSynthBase implements IDSPBufferSource {
  private _source: AudioBufferSourceNode | null = null;
  private _buffer: AudioBuffer | null = null;
  private _playbackRate = 1;
  private _loop = false;
  private _loopStart = 0;
  private _loopEnd = 0;
  onended: (() => void) | null = null;

  constructor(ctx: AudioContext) {
    super(ctx);
  }

  get buffer(): AudioBuffer | null { return this._buffer; }
  set buffer(v: AudioBuffer | null) { this._buffer = v; }

  get playbackRate(): number { return this._playbackRate; }
  set playbackRate(v: number) {
    this._playbackRate = v;
    if (this._source) this._source.playbackRate.value = v;
  }

  get loop(): boolean { return this._loop; }
  set loop(v: boolean) {
    this._loop = v;
    if (this._source) this._source.loop = v;
  }

  get loopStart(): number { return this._loopStart; }
  set loopStart(v: number) {
    this._loopStart = v;
    if (this._source) this._source.loopStart = v;
  }

  get loopEnd(): number { return this._loopEnd; }
  set loopEnd(v: number) {
    this._loopEnd = v;
    if (this._source) this._source.loopEnd = v;
  }

  start(time?: number, offset?: number, duration?: number): void {
    if (this._source) {
      try { this._source.stop(); } catch { /* */ }
    }

    if (!this._buffer) return; // no-op when buffer is null

    const source = this._ctx.createBufferSource();
    source.buffer = this._buffer;
    source.playbackRate.value = this._playbackRate;
    source.loop = this._loop;
    source.loopStart = this._loopStart;
    source.loopEnd = this._loopEnd;
    source.connect(this._output);

    if (this.onended) {
      source.onended = this.onended;
    }

    this._source = source;
    source.start(time, offset, duration);
  }

  stop(time?: number): void {
    if (this._source) {
      try { this._source.stop(time); } catch { /* */ }
    }
  }
}
