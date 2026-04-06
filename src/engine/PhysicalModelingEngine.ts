import * as Tone from 'tone';
import type {
  PhysicalModelingSettings,
  PhysicalExciterType,
  PhysicalModelingPresetName,
} from '../types/project';

// ── Default Settings ─────────────────────────────────────────────────────────

export const DEFAULT_PHYSICAL_MODELING_SETTINGS: PhysicalModelingSettings = {
  exciter: 'pluck',
  damping: 0.4,
  brightness: 0.7,
  pluckPosition: 0.5,
  bodySize: 0.3,
  stringTension: 0.5,
  gain: 0.55,
  attack: 0.001,
  release: 0.1,
  presetName: 'acousticGuitar',
};

// ── Presets ──────────────────────────────────────────────────────────────────

export const PHYSICAL_MODELING_PRESETS: Record<
  Exclude<PhysicalModelingPresetName, 'custom'>,
  PhysicalModelingSettings
> = {
  acousticGuitar: {
    exciter: 'pluck',
    damping: 0.35,
    brightness: 0.65,
    pluckPosition: 0.4,
    bodySize: 0.45,
    stringTension: 0.5,
    gain: 0.55,
    attack: 0.001,
    release: 0.15,
    presetName: 'acousticGuitar',
  },
  harp: {
    exciter: 'pluck',
    damping: 0.2,
    brightness: 0.8,
    pluckPosition: 0.3,
    bodySize: 0.5,
    stringTension: 0.6,
    gain: 0.5,
    attack: 0.001,
    release: 0.3,
    presetName: 'harp',
  },
  kalimba: {
    exciter: 'hammer',
    damping: 0.25,
    brightness: 0.9,
    pluckPosition: 0.15,
    bodySize: 0.6,
    stringTension: 0.7,
    gain: 0.55,
    attack: 0.001,
    release: 0.05,
    presetName: 'kalimba',
  },
  marimba: {
    exciter: 'hammer',
    damping: 0.45,
    brightness: 0.5,
    pluckPosition: 0.5,
    bodySize: 0.7,
    stringTension: 0.4,
    gain: 0.6,
    attack: 0.001,
    release: 0.08,
    presetName: 'marimba',
  },
  steelDrum: {
    exciter: 'hammer',
    damping: 0.15,
    brightness: 0.85,
    pluckPosition: 0.35,
    bodySize: 0.55,
    stringTension: 0.65,
    gain: 0.5,
    attack: 0.001,
    release: 0.12,
    presetName: 'steelDrum',
  },
  bowedString: {
    exciter: 'bow',
    damping: 0.15,
    brightness: 0.55,
    pluckPosition: 0.4,
    bodySize: 0.5,
    stringTension: 0.55,
    gain: 0.5,
    attack: 0.05,
    release: 0.4,
    presetName: 'bowedString',
  },
};

export function createPhysicalModelingSettings(
  overrides?: Partial<PhysicalModelingSettings>,
): PhysicalModelingSettings {
  return { ...DEFAULT_PHYSICAL_MODELING_SETTINGS, ...overrides };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// ── Voice Types ─────────────────────────────────────────────────────────────

interface PhysicalVoice {
  pitch: number;
  output: GainNode;
  /** Handle for bow exciter's continuous scheduling. */
  bowInterval: ReturnType<typeof setInterval> | null;
  releaseTimeoutId: ReturnType<typeof setTimeout> | null;
  /** All active source nodes for cleanup. */
  activeNodes: Set<AudioBufferSourceNode>;
  /** Delay node for Karplus-Strong feedback loop. */
  delayNode: DelayNode;
  /** Lowpass filter in feedback loop. */
  filterNode: BiquadFilterNode;
  /** Feedback gain node. */
  feedbackGain: GainNode;
  /** Body resonance comb filter. */
  bodyDelay: DelayNode | null;
  bodyFeedback: GainNode | null;
}

interface PhysicalInstance {
  settings: PhysicalModelingSettings;
  output: GainNode;
  voices: Map<number, PhysicalVoice[]>;
}

// ── Exciter Buffer Generation ───────────────────────────────────────────────

/**
 * Generate exciter signal based on type.
 * Returns a short AudioBuffer containing the excitation signal.
 */
function generateExciterBuffer(
  ctx: AudioContext,
  exciter: PhysicalExciterType,
  freq: number,
  velocity: number,
  pluckPosition: number,
): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  // Exciter duration: one period of the fundamental
  const periodSamples = Math.round(sampleRate / freq);
  // Use 2-4 periods worth of excitation signal
  const exciterLength = Math.max(64, periodSamples * 3);
  const buffer = ctx.createBuffer(1, exciterLength, sampleRate);
  const data = buffer.getChannelData(0);
  const velScale = clamp(velocity / 127, 0.1, 1.0);

  switch (exciter) {
    case 'pluck': {
      // Filtered noise burst shaped by pluck position.
      // Pluck position affects which harmonics are present (notch at position).
      for (let i = 0; i < exciterLength; i++) {
        const noise = (Math.random() * 2 - 1) * velScale;
        // Simple pluck-position filter: suppress harmonics at position multiples
        const pos = clamp(pluckPosition, 0.05, 0.95);
        const notchFreq = 1 / pos;
        const phase = (i / periodSamples) * notchFreq * Math.PI;
        const notchFilter = Math.abs(Math.sin(phase));
        // Apply gentle decay envelope
        const env = 1 - i / exciterLength;
        data[i] = noise * notchFilter * env;
      }
      break;
    }
    case 'bow': {
      // Sawtooth-like signal simulating bow friction.
      // Velocity controls bow pressure.
      const bowPressure = 0.3 + velScale * 0.7;
      for (let i = 0; i < exciterLength; i++) {
        const phase = (i % periodSamples) / periodSamples;
        // Saw-like with some noise to simulate bow friction
        const saw = (phase * 2 - 1) * bowPressure;
        const friction = (Math.random() * 2 - 1) * 0.15 * bowPressure;
        data[i] = (saw + friction) * velScale * 0.7;
      }
      break;
    }
    case 'hammer': {
      // Short percussive burst. Velocity controls hardness.
      const hardness = 0.3 + velScale * 0.7;
      const burstLength = Math.max(32, Math.round(exciterLength * (0.15 + hardness * 0.2)));
      for (let i = 0; i < exciterLength; i++) {
        if (i < burstLength) {
          // Half-sine envelope for the hammer strike
          const env = Math.sin((Math.PI * i) / burstLength);
          // Mix of tuned component and noise for different hardnesses
          const tuned = Math.sin(2 * Math.PI * freq * i / sampleRate);
          const noise = Math.random() * 2 - 1;
          data[i] = (tuned * hardness + noise * (1 - hardness * 0.5)) * env * velScale;
        } else {
          data[i] = 0;
        }
      }
      break;
    }
  }

  return buffer;
}

// ── Engine ───────────────────────────────────────────────────────────────────

class PhysicalModelingEngine {
  private instances = new Map<string, PhysicalInstance>();

  private getContext(): AudioContext {
    return Tone.getContext().rawContext as AudioContext;
  }

  async ensureStarted(): Promise<void> {
    if (Tone.getContext().state !== 'running') {
      await Tone.start();
    }
  }

  ensureTrack(
    trackId: string,
    settings: PhysicalModelingSettings,
    connectTo?: AudioNode,
  ): void {
    const existing = this.instances.get(trackId);
    if (existing) {
      existing.settings = { ...settings };
      existing.output.gain.value = settings.gain;
      return;
    }

    const ctx = this.getContext();
    const output = ctx.createGain();
    output.gain.value = settings.gain;

    if (connectTo) {
      output.connect(connectTo);
    } else {
      output.connect(ctx.destination);
    }

    this.instances.set(trackId, {
      settings: { ...settings },
      output,
      voices: new Map(),
    });
  }

  updateSettings(trackId: string, settings: Partial<PhysicalModelingSettings>): void {
    const instance = this.instances.get(trackId);
    if (!instance) return;
    Object.assign(instance.settings, settings);
    if (settings.gain !== undefined) {
      instance.output.gain.value = settings.gain;
    }
  }

  // ── Note Triggering ──────────────────────────────────────────────────────

  noteOn(trackId: string, pitch: number, velocity = 100): void {
    const instance = this.instances.get(trackId);
    if (!instance) return;

    const ctx = this.getContext();
    const { settings } = instance;
    const freq = midiToFreq(pitch);
    const now = ctx.currentTime;

    // Voice output with attack envelope
    const voiceOutput = ctx.createGain();
    const attackEnd = now + Math.max(0.001, settings.attack);
    voiceOutput.gain.setValueAtTime(0.0001, now);
    voiceOutput.gain.linearRampToValueAtTime(1.0, attackEnd);
    voiceOutput.connect(instance.output);

    // ── Karplus-Strong delay line ──
    // Delay time = 1/frequency (one period of the string)
    const delayTime = 1 / freq;
    const delayNode = ctx.createDelay(1.0); // max 1 second delay
    delayNode.delayTime.value = delayTime;

    // Lowpass filter in feedback loop — brightness controls cutoff
    const filterNode = ctx.createBiquadFilter();
    filterNode.type = 'lowpass';
    // Map brightness (0–1) to frequency range. Low brightness = duller, higher damping.
    const minCutoff = freq * 1.5;
    const maxCutoff = Math.min(ctx.sampleRate / 2 - 100, freq * 12);
    filterNode.frequency.value = minCutoff + settings.brightness * (maxCutoff - minCutoff);
    filterNode.Q.value = 0.5;

    // Feedback gain — damping controls how fast the string decays
    // Higher damping = lower feedback = faster decay
    const feedbackGain = ctx.createGain();
    // String tension slightly affects sustain character
    const tensionFactor = 0.95 + settings.stringTension * 0.04;
    feedbackGain.gain.value = clamp((1 - settings.damping) * tensionFactor, 0, 0.998);

    // Wire feedback loop: delay → filter → feedback gain → delay
    delayNode.connect(filterNode);
    filterNode.connect(feedbackGain);
    feedbackGain.connect(delayNode);

    // Output from the delay line
    delayNode.connect(voiceOutput);

    // ── Body resonance via comb filter ──
    let bodyDelay: DelayNode | null = null;
    let bodyFeedback: GainNode | null = null;
    if (settings.bodySize > 0.01) {
      bodyDelay = ctx.createDelay(0.1);
      // Body delay time: maps bodySize to a resonant cavity size
      const bodyDelayTime = 0.002 + settings.bodySize * 0.015;
      bodyDelay.delayTime.value = bodyDelayTime;

      bodyFeedback = ctx.createGain();
      bodyFeedback.gain.value = clamp(settings.bodySize * 0.6, 0, 0.8);

      // Comb filter: delay output → body delay → feedback → mix back
      const bodyMix = ctx.createGain();
      bodyMix.gain.value = settings.bodySize * 0.4;

      delayNode.connect(bodyDelay);
      bodyDelay.connect(bodyFeedback);
      bodyFeedback.connect(bodyDelay);
      bodyDelay.connect(bodyMix);
      bodyMix.connect(voiceOutput);
    }

    // ── Generate and play exciter signal ──
    const exciterBuffer = generateExciterBuffer(ctx, settings.exciter, freq, velocity, settings.pluckPosition);
    const exciterSource = ctx.createBufferSource();
    exciterSource.buffer = exciterBuffer;
    // Feed exciter into the delay line to start the Karplus-Strong loop
    exciterSource.connect(delayNode);
    exciterSource.start(now);

    const voice: PhysicalVoice = {
      pitch,
      output: voiceOutput,
      bowInterval: null,
      releaseTimeoutId: null,
      activeNodes: new Set([exciterSource]),
      delayNode,
      filterNode,
      feedbackGain,
      bodyDelay,
      bodyFeedback,
    };

    // For bow exciter: continuously feed the delay line
    if (settings.exciter === 'bow') {
      const bowIntervalMs = Math.max(20, (exciterBuffer.length / ctx.sampleRate) * 1000 * 0.8);
      voice.bowInterval = globalThis.setInterval(() => {
        if (!instance.voices.has(pitch)) return;
        const bowBuffer = generateExciterBuffer(ctx, 'bow', freq, velocity * 0.3, settings.pluckPosition);
        const bowSource = ctx.createBufferSource();
        bowSource.buffer = bowBuffer;
        bowSource.connect(delayNode);
        bowSource.start();
        voice.activeNodes.add(bowSource);
        bowSource.onended = () => {
          voice.activeNodes.delete(bowSource);
          try { bowSource.disconnect(); } catch { /* already disconnected */ }
        };
      }, bowIntervalMs);
    }

    exciterSource.onended = () => {
      voice.activeNodes.delete(exciterSource);
      try { exciterSource.disconnect(); } catch { /* already disconnected */ }
    };

    const existing = instance.voices.get(pitch) ?? [];
    instance.voices.set(pitch, existing.concat(voice));
  }

  noteOff(trackId: string, pitch: number): void {
    const instance = this.instances.get(trackId);
    if (!instance) return;

    const voices = instance.voices.get(pitch) ?? [];
    for (const voice of voices) {
      this._releaseVoice(voice, instance.settings.release);
    }
    instance.voices.delete(pitch);
  }

  triggerAttackRelease(trackId: string, pitch: number, duration: number, velocity = 1): void {
    this.noteOn(trackId, pitch, Math.round(velocity * 127));
    const instance = this.instances.get(trackId);
    if (!instance) return;

    const voices = instance.voices.get(pitch);
    if (!voices || voices.length === 0) return;

    const voice = voices[voices.length - 1];
    voice.releaseTimeoutId = globalThis.setTimeout(() => {
      this._releaseVoice(voice, instance.settings.release);
      const remaining = instance.voices.get(pitch)?.filter((v) => v !== voice) ?? [];
      if (remaining.length > 0) {
        instance.voices.set(pitch, remaining);
      } else {
        instance.voices.delete(pitch);
      }
    }, Math.max(20, duration * 1000));
  }

  releaseAll(): void {
    for (const instance of this.instances.values()) {
      for (const voices of instance.voices.values()) {
        for (const voice of voices) {
          this._releaseVoice(voice, instance.settings.release);
        }
      }
      instance.voices.clear();
    }
  }

  removeTrack(trackId: string): void {
    const instance = this.instances.get(trackId);
    if (!instance) return;
    this._disposeInstance(instance);
    this.instances.delete(trackId);
  }

  setParameter(trackId: string, name: string, value: number | string | boolean): void {
    const instance = this.instances.get(trackId);
    if (!instance) return;

    if (name in instance.settings) {
      (instance.settings as unknown as Record<string, unknown>)[name] = value;
      if (name === 'gain' && typeof value === 'number') {
        instance.output.gain.value = value;
      }
    }
  }

  dispose(): void {
    for (const instance of this.instances.values()) {
      this._disposeInstance(instance);
    }
    this.instances.clear();
  }

  // ── Cleanup ──────────────────────────────────────────────────────────────

  private _releaseVoice(voice: PhysicalVoice, release: number): void {
    if (voice.bowInterval !== null) {
      globalThis.clearInterval(voice.bowInterval);
      voice.bowInterval = null;
    }

    if (voice.releaseTimeoutId !== null) {
      globalThis.clearTimeout(voice.releaseTimeoutId);
      voice.releaseTimeoutId = null;
    }

    const ctx = this.getContext();
    const now = ctx.currentTime;
    const releaseEnd = now + Math.max(0.01, release);

    // Fade out the voice output
    const gainParam = voice.output.gain;
    const holdable = gainParam as AudioParam & {
      cancelAndHoldAtTime?: (cancelTime: number) => void;
    };
    if (typeof holdable.cancelAndHoldAtTime === 'function') {
      holdable.cancelAndHoldAtTime(now);
    } else {
      gainParam.cancelScheduledValues(now);
      gainParam.setValueAtTime(Math.max(0.0001, gainParam.value), now);
    }
    gainParam.linearRampToValueAtTime(0.0001, releaseEnd);

    // Also ramp down the feedback to let the string die naturally
    voice.feedbackGain.gain.linearRampToValueAtTime(0, releaseEnd);

    // Clean up after release
    globalThis.setTimeout(() => {
      for (const source of voice.activeNodes) {
        try { source.stop(); source.disconnect(); } catch { /* already stopped */ }
      }
      voice.activeNodes.clear();
      try { voice.delayNode.disconnect(); } catch { /* */ }
      try { voice.filterNode.disconnect(); } catch { /* */ }
      try { voice.feedbackGain.disconnect(); } catch { /* */ }
      try { voice.output.disconnect(); } catch { /* */ }
      if (voice.bodyDelay) {
        try { voice.bodyDelay.disconnect(); } catch { /* */ }
      }
      if (voice.bodyFeedback) {
        try { voice.bodyFeedback.disconnect(); } catch { /* */ }
      }
    }, Math.ceil((release + 0.1) * 1000));
  }

  private _disposeInstance(instance: PhysicalInstance): void {
    for (const voices of instance.voices.values()) {
      for (const voice of voices) {
        this._releaseVoice(voice, 0.01);
      }
    }
    instance.voices.clear();
    try { instance.output.disconnect(); } catch { /* already disconnected */ }
  }
}

export const physicalModelingEngine = new PhysicalModelingEngine();
