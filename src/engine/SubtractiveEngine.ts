/**
 * Subtractive synthesis engine.
 *
 * Phase 5K migration: replaced Tone wrappers with native Web Audio
 * primitives. Mapping:
 *   Tone.PolySynth(Tone.Synth, …) → NativeSubtractiveSynth (local class)
 *   Tone.Filter                   → BiquadFilterNode
 *   Tone.LFO                      → OscillatorNode + depth GainNode
 *   Tone.Panner                   → StereoPannerNode
 *   Tone.Gain                     → GainNode
 *   Tone.Frequency(…).toFrequency → midiToFrequency (utils/pitch)
 *
 * The local synth class (`NativeSubtractiveSynth`) exposes the
 * specific API SubtractiveEngine needs — voice allocation,
 * per-voice ADSR, shared detune bus for LFO-to-pitch routing,
 * and portamento glide — which the generic NativePolySynth in
 * `dsp/NativeSynths.ts` doesn't cover.
 */
import type { SubtractiveInstrumentSettings } from '../types/project';
import type { ModulationTargets } from './ModulationEngine';
import { getAudioEngine } from '../hooks/useAudioEngine';
import { midiToFrequency } from '../utils/pitch';

// ─── NativeSubtractiveSynth ──────────────────────────────────────────────

interface SubtractiveVoice {
  osc: OscillatorNode | null;
  gain: GainNode;
  /** The currently-playing freq in Hz (identity for per-note release). */
  freq: number | null;
}

interface SynthEnvelope {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
}

interface SynthSetOptions {
  oscillator?: { type?: OscillatorType };
  envelope?: Partial<SynthEnvelope>;
  portamento?: number;
  detune?: number;
  volume?: number; // dB
}

class NativeSubtractiveSynth {
  private readonly _ctx: AudioContext;
  private readonly _output: GainNode;
  private readonly _voices: SubtractiveVoice[] = [];
  private readonly _maxPoly: number;
  private _nextVoice = 0;
  private readonly _freqToVoice = new Map<number, number>();

  /**
   * Shared detune bus routed to every voice's `osc.detune`. Exposed
   * via the {@link detune} getter so external code (LFO / ModEngine)
   * can modulate pitch.
   */
  private readonly _detuneBus: ConstantSourceNode;

  private _envelope: SynthEnvelope = { attack: 0.01, decay: 0.1, sustain: 0.7, release: 0.3 };
  private _oscType: OscillatorType = 'sawtooth';
  private _portamento = 0;
  /** Static per-voice detune baseline (cents), separate from the LFO bus. */
  private _staticDetuneCents = 0;
  /** Last frequency played on this synth — used for portamento glide. */
  private _lastFreq: number | null = null;

  constructor(ctx: AudioContext, maxPolyphony = 8) {
    this._ctx = ctx;
    this._maxPoly = maxPolyphony;
    this._output = ctx.createGain();
    this._detuneBus = ctx.createConstantSource();
    this._detuneBus.offset.value = 0;
    this._detuneBus.start();
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

  /** AudioParam for external pitch-bus modulation (LFO / mod matrix). */
  get detune(): AudioParam {
    return this._detuneBus.offset;
  }

  set(options: SynthSetOptions): void {
    if (options.oscillator?.type) {
      this._oscType = options.oscillator.type;
      for (const voice of this._voices) {
        if (voice.osc) voice.osc.type = this._oscType;
      }
    }
    if (options.envelope) {
      this._envelope = { ...this._envelope, ...options.envelope };
    }
    if (options.portamento !== undefined) {
      this._portamento = Math.max(0, options.portamento);
    }
    if (options.detune !== undefined) {
      this._staticDetuneCents = options.detune;
      // Apply to any currently-playing voices.
      for (const voice of this._voices) {
        if (voice.osc) voice.osc.detune.value = options.detune;
      }
    }
    if (options.volume !== undefined) {
      this._output.gain.value = dbToLinear(options.volume);
    }
  }

  private _allocVoice(freq: number): SubtractiveVoice {
    const existing = this._freqToVoice.get(freq);
    if (existing !== undefined) return this._voices[existing];

    const idx = this._nextVoice % this._maxPoly;
    this._nextVoice++;

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

    if (voice.osc) {
      try { voice.osc.stop(t); } catch { /* already stopped */ }
      try { voice.osc.disconnect(); } catch { /* already disconnected */ }
    }

    const osc = this._ctx.createOscillator();
    osc.type = this._oscType;
    osc.detune.value = this._staticDetuneCents;
    // Hook shared detune bus so LFO / mod matrix can modulate pitch.
    try { this._detuneBus.connect(osc.detune); } catch { /* already connected */ }

    // Portamento glide: ramp from previous freq if set.
    if (this._portamento > 0 && this._lastFreq !== null && this._lastFreq !== freq) {
      osc.frequency.setValueAtTime(this._lastFreq, t);
      osc.frequency.linearRampToValueAtTime(freq, t + this._portamento);
    } else {
      osc.frequency.setValueAtTime(freq, t);
    }
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
    this._lastFreq = freq;
  }

  triggerRelease(freq: number, time?: number): void {
    const idx = this._freqToVoice.get(freq);
    if (idx === undefined) return;
    const voice = this._voices[idx];
    if (!voice.osc) return;

    const t = time ?? this._ctx.currentTime;
    const env = this._envelope;
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
    for (const f of [...this._freqToVoice.keys()]) {
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
    try { this._detuneBus.stop(); } catch { /* already stopped */ }
    try { this._detuneBus.disconnect(); } catch { /* already disconnected */ }
    try { this._output.disconnect(); } catch { /* already disconnected */ }
    this._voices.length = 0;
    this._freqToVoice.clear();
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function dbToLinear(db: number): number {
  return Math.pow(10, db / 20);
}

/** Tone.LFO was configured with `min`/`max`; we express the same on
 *  native nodes as `center + halfRange * sin(2πft)` — the
 *  OscillatorNode's natural [-1, 1] output scaled by `halfRange` in a
 *  depth GainNode, additively routed to the destination AudioParam
 *  whose base value is set to `center`. */
interface NativeLfo {
  osc: OscillatorNode;
  depthGain: GainNode;
  dispose: () => void;
}

function createNativeLfo(
  ctx: AudioContext,
  rateHz: number,
  waveform: OscillatorType,
  center: number,
  halfRange: number,
  target: AudioParam,
): NativeLfo {
  const osc = ctx.createOscillator();
  osc.type = waveform;
  osc.frequency.value = rateHz;
  const depthGain = ctx.createGain();
  depthGain.gain.value = halfRange;
  osc.connect(depthGain);
  depthGain.connect(target);
  target.value = center;
  osc.start();
  return {
    osc,
    depthGain,
    dispose: () => {
      try { osc.stop(); } catch { /* already stopped */ }
      try { osc.disconnect(); } catch { /* already disconnected */ }
      try { depthGain.disconnect(); } catch { /* already disconnected */ }
    },
  };
}

// ─── SubtractiveEngine ───────────────────────────────────────────────────

interface SubtractiveInstance {
  synth: NativeSubtractiveSynth;
  filter: BiquadFilterNode | null;
  lfo: NativeLfo | null;
  panner: StereoPannerNode;
  output: GainNode;
  settings: SubtractiveInstrumentSettings;
  /** Bookkeeping: target currently under LFO control (if any) so we
   *  know which base-value we've overwritten and can restore it. */
  lfoTarget: SubtractiveInstrumentSettings['lfo']['target'];
}

class SubtractiveEngine {
  private instances = new Map<string, SubtractiveInstance>();
  private previewInstance: SubtractiveInstance | null = null;

  async ensureStarted() {
    const engine = getAudioEngine();
    // Tolerate test harnesses that hand out a partial engine without
    // a `ctx` — those environments don't have a real AudioContext to
    // resume anyway.
    if (engine?.ctx?.state && engine.ctx.state !== 'running') {
      await engine.resume();
    }
  }

  ensureTrackSynth(
    trackId: string,
    settings: SubtractiveInstrumentSettings,
    connectTo?: AudioNode,
  ): SubtractiveInstance {
    const existing = this.instances.get(trackId);
    if (existing) {
      this._updateSettings(existing, settings);
      return existing;
    }

    const instance = this._createInstance(settings, connectTo);
    this.instances.set(trackId, instance);
    return instance;
  }

  getSynth(trackId: string): NativeSubtractiveSynth | null {
    return this.instances.get(trackId)?.synth ?? null;
  }

  setParameter(trackId: string, name: string, value: number | string | boolean) {
    const instance = this.instances.get(trackId);
    if (!instance) return;
    this._applyParameter(instance, name, value);
  }

  triggerAttackRelease(trackId: string, pitch: number, duration: number, velocity = 1) {
    const instance = this.instances.get(trackId);
    if (!instance) return;
    const freq = this._pitchToFreq(pitch, instance.settings.oscillator.octave);
    instance.synth.triggerAttackRelease(freq, duration, undefined, velocity);
  }

  noteOn(trackId: string, pitch: number, velocity = 100) {
    const instance = this.instances.get(trackId);
    if (!instance) return;
    const freq = this._pitchToFreq(pitch, instance.settings.oscillator.octave);
    instance.synth.triggerAttack(freq, undefined, velocity / 127);
    // Retrigger LFO on note-on (key-sync mode)
    if (instance.lfo && instance.settings.lfo.retrigger) {
      try { instance.lfo.osc.stop(); } catch { /* already stopped */ }
      // OscillatorNode is one-shot — recreate to retrigger.
      const ctx = getAudioEngine().ctx;
      const oldOsc = instance.lfo.osc;
      try { oldOsc.disconnect(); } catch { /* already disconnected */ }
      const newOsc = ctx.createOscillator();
      newOsc.type = oldOsc.type;
      newOsc.frequency.value = oldOsc.frequency.value;
      newOsc.connect(instance.lfo.depthGain);
      newOsc.start();
      instance.lfo.osc = newOsc;
    }
  }

  noteOff(trackId: string, pitch: number) {
    const instance = this.instances.get(trackId);
    if (!instance) return;
    const freq = this._pitchToFreq(pitch, instance.settings.oscillator.octave);
    instance.synth.triggerRelease(freq);
  }

  playSlideNote(
    trackId: string,
    fromPitch: number,
    toPitch: number,
    velocity: number,
    duration: number,
  ) {
    const instance = this.instances.get(trackId);
    if (!instance) return;

    const octave = instance.settings.oscillator.octave;
    const glideTime = instance.settings.glideTime > 0
      ? instance.settings.glideTime
      : Math.max(0.03, Math.min(0.12, duration * 0.35));
    const fromFreq = this._pitchToFreq(fromPitch, octave);
    const toFreq = this._pitchToFreq(toPitch, octave);

    // Configure the synth's portamento so the next triggerAttack ramps.
    instance.synth.set({ portamento: glideTime });
    const ctx = getAudioEngine().ctx;
    const now = ctx.currentTime;

    instance.synth.triggerAttack(fromFreq, now, velocity / 127);
    // Release the from-note as the slide begins, then attack the
    // to-note; the synth's portamento state causes the osc to ramp
    // from `_lastFreq` (= fromFreq) to toFreq.
    instance.synth.triggerRelease(fromFreq, now + glideTime);
    instance.synth.triggerAttackRelease(
      toFreq,
      Math.max(0.04, duration),
      now + glideTime,
      velocity / 127,
    );
  }

  async previewNote(
    pitch: number,
    velocity = 100,
    duration = 0.3,
    settings: SubtractiveInstrumentSettings,
  ) {
    await this.ensureStarted();
    if (this.previewInstance) {
      this._disposeInstance(this.previewInstance);
    }
    this.previewInstance = this._createInstance(settings);
    const freq = this._pitchToFreq(pitch, settings.oscillator.octave);
    this.previewInstance.synth.triggerAttackRelease(freq, duration, undefined, velocity / 127);
  }

  releaseAll() {
    for (const instance of this.instances.values()) {
      instance.synth.releaseAll();
    }
  }

  /**
   * Return native AudioParam references for the ModulationEngine.
   */
  getModulationTargets(trackId: string): ModulationTargets | null {
    const instance = this.instances.get(trackId);
    if (!instance) return null;

    // All native AudioParams now — no Tone wrapper indirection.
    // Upstream ModulationEngine will `output.connect(param)` which
    // is legal Web Audio for every field here.
    return {
      amp: instance.output.gain as unknown as ModulationTargets['amp'],
      pitch: instance.synth.detune as unknown as ModulationTargets['pitch'],
      pan: instance.panner.pan as unknown as ModulationTargets['pan'],
      filterCutoff: instance.filter
        ? (instance.filter.frequency as unknown as ModulationTargets['filterCutoff'])
        : undefined,
      filterResonance: instance.filter
        ? (instance.filter.Q as unknown as ModulationTargets['filterResonance'])
        : undefined,
    };
  }

  removeTrackSynth(trackId: string) {
    const instance = this.instances.get(trackId);
    if (!instance) return;
    instance.synth.releaseAll();
    this._disposeInstance(instance);
    this.instances.delete(trackId);
  }

  dispose() {
    for (const trackId of this.instances.keys()) {
      this.removeTrackSynth(trackId);
    }
    if (this.previewInstance) {
      this._disposeInstance(this.previewInstance);
      this.previewInstance = null;
    }
  }

  // --- Private helpers ---

  private _pitchToFreq(pitch: number, octaveOffset: number): number {
    return midiToFrequency(pitch + octaveOffset * 12);
  }

  private _createInstance(
    settings: SubtractiveInstrumentSettings,
    connectTo?: AudioNode,
  ): SubtractiveInstance {
    const { oscillator, ampEnvelope, filter, lfo, unison } = settings;
    const ctx = getAudioEngine().ctx;

    const voiceCount = Math.max(1, Math.min(8, unison.voices));
    const detuneValue = oscillator.detuneCents + (voiceCount > 1 ? unison.detuneCents : 0);
    const synth = new NativeSubtractiveSynth(ctx);
    synth.set({
      oscillator: { type: oscillator.waveform as OscillatorType },
      envelope: {
        attack: ampEnvelope.attack,
        decay: ampEnvelope.decay,
        sustain: ampEnvelope.sustain,
        release: ampEnvelope.release,
      },
      portamento: settings.glideTime,
      volume: oscillator.level < 1 ? 20 * Math.log10(Math.max(0.0001, oscillator.level)) : 0,
    });
    if (detuneValue !== 0) {
      synth.set({ detune: detuneValue });
    }

    // Output gain (outputGain is in dB; 0 dB → legacy default 0.55)
    const outputLevel = settings.outputGain !== 0
      ? dbToLinear(settings.outputGain)
      : 0.55;
    const output = ctx.createGain();
    output.gain.value = outputLevel;

    // Signal chain: synth → [filter] → output → panner → connectTo/destination
    let biquadFilter: BiquadFilterNode | null = null;
    const panner = ctx.createStereoPanner();
    panner.pan.value = 0;

    if (filter.enabled) {
      biquadFilter = ctx.createBiquadFilter();
      biquadFilter.type = filter.type;
      biquadFilter.frequency.value = filter.cutoffHz;
      biquadFilter.Q.value = filter.resonance * 30;
      synth.outputNode.connect(biquadFilter);
      biquadFilter.connect(output);
    } else {
      synth.outputNode.connect(output);
    }

    // LFO modulation
    let lfoNode: NativeLfo | null = null;

    if (lfo.enabled && lfo.target !== 'off' && lfo.depth > 0) {
      const waveform = lfo.waveform as OscillatorType;
      switch (lfo.target) {
        case 'amp': {
          const center = outputLevel;
          const halfRange = lfo.depth * outputLevel;
          lfoNode = createNativeLfo(ctx, lfo.rateHz, waveform, center, halfRange, output.gain);
          break;
        }
        case 'filterCutoff': {
          if (biquadFilter) {
            const maxRange = lfo.depth * filter.cutoffHz;
            const center = filter.cutoffHz;
            // Clamp to valid filter range — note that with additive
            // routing the runtime value can still swing slightly
            // past these bounds, but the base value stays sane.
            const halfRange = Math.min(maxRange, Math.min(center - 20, 20000 - center));
            lfoNode = createNativeLfo(
              ctx,
              lfo.rateHz,
              waveform,
              center,
              Math.max(0, halfRange),
              biquadFilter.frequency,
            );
          }
          break;
        }
        case 'pitch': {
          // depth 1.0 = ±1200 cents (1 octave). Routed into the
          // synth's shared detune bus so every voice's osc.detune
          // receives the modulation additively.
          const halfRange = lfo.depth * 1200;
          lfoNode = createNativeLfo(ctx, lfo.rateHz, waveform, 0, halfRange, synth.detune);
          break;
        }
        case 'pan': {
          const halfRange = lfo.depth;
          lfoNode = createNativeLfo(ctx, lfo.rateHz, waveform, 0, halfRange, panner.pan);
          break;
        }
      }
    }

    // Final output routing: output → panner → connectTo/destination
    output.connect(panner);
    if (connectTo) {
      panner.connect(connectTo);
    } else {
      panner.connect(ctx.destination);
    }

    return {
      synth,
      filter: biquadFilter,
      lfo: lfoNode,
      panner,
      output,
      settings: { ...settings },
      lfoTarget: lfo.target,
    };
  }

  private _updateSettings(instance: SubtractiveInstance, settings: SubtractiveInstrumentSettings) {
    const { oscillator, ampEnvelope, unison } = settings;

    instance.synth.set({
      oscillator: { type: oscillator.waveform as OscillatorType },
      envelope: {
        attack: ampEnvelope.attack,
        decay: ampEnvelope.decay,
        sustain: ampEnvelope.sustain,
        release: ampEnvelope.release,
      },
      portamento: settings.glideTime,
    });
    const detuneValue = oscillator.detuneCents + (unison.voices > 1 ? unison.detuneCents : 0);
    if (detuneValue !== 0) {
      instance.synth.set({ detune: detuneValue });
    }

    if (instance.filter && settings.filter.enabled) {
      instance.filter.frequency.value = settings.filter.cutoffHz;
      instance.filter.Q.value = settings.filter.resonance * 30;
      instance.filter.type = settings.filter.type;
    }

    if (instance.lfo && settings.lfo.enabled) {
      instance.lfo.osc.frequency.value = settings.lfo.rateHz;
    }

    const outputLevel = settings.outputGain !== 0
      ? dbToLinear(settings.outputGain)
      : 0.55;
    instance.output.gain.value = outputLevel;

    instance.settings = { ...settings };
  }

  private _applyParameter(instance: SubtractiveInstance, name: string, value: number | string | boolean) {
    switch (name) {
      case 'oscillator.waveform':
        instance.synth.set({ oscillator: { type: value as OscillatorType } });
        break;
      case 'oscillator.detuneCents':
        instance.synth.set({ detune: value as number });
        break;
      case 'ampEnvelope.attack':
        instance.synth.set({ envelope: { attack: value as number } });
        break;
      case 'ampEnvelope.decay':
        instance.synth.set({ envelope: { decay: value as number } });
        break;
      case 'ampEnvelope.sustain':
        instance.synth.set({ envelope: { sustain: value as number } });
        break;
      case 'ampEnvelope.release':
        instance.synth.set({ envelope: { release: value as number } });
        break;
      case 'filter.cutoffHz':
        if (instance.filter) instance.filter.frequency.value = value as number;
        break;
      case 'filter.resonance':
        if (instance.filter) instance.filter.Q.value = (value as number) * 30;
        break;
      case 'lfo.rateHz':
        if (instance.lfo) instance.lfo.osc.frequency.value = value as number;
        break;
      case 'lfo.depth':
        if (instance.lfo) {
          instance.lfo.depthGain.gain.value = value as number;
        }
        break;
      case 'outputGain': {
        const level = (value as number) !== 0
          ? dbToLinear(value as number)
          : 0.55;
        instance.output.gain.value = level;
        break;
      }
      case 'glideTime':
        instance.synth.set({ portamento: value as number });
        break;
    }
  }

  private _disposeInstance(instance: SubtractiveInstance) {
    instance.synth.releaseAll();
    instance.synth.dispose();
    instance.lfo?.dispose();
    if (instance.filter) {
      try { instance.filter.disconnect(); } catch { /* already disconnected */ }
    }
    try { instance.panner.disconnect(); } catch { /* already disconnected */ }
    try { instance.output.disconnect(); } catch { /* already disconnected */ }
  }
}

export const subtractiveEngine = new SubtractiveEngine();
