import type { AdditiveSettings, AdditivePartial, AdditivePreset, InstrumentEnvelope } from '../types/project';
import { getAudioEngine } from '../hooks/useAudioEngine';
import { midiToFrequency } from '../utils/pitch';

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
      amplitude: n % 2 === 1 ? 1 / n : 0,
      phase: 0,
    };
  });
}

function generateOrganPartials(count: number): AdditivePartial[] {
  const drawbarRatios = [1, 2, 3, 4, 5, 6, 8, 10, 12];
  const drawbarAmps = [1, 0.8, 0.6, 0.3, 0.2, 0.15, 0.1, 0.08, 0.05];
  // Always return exactly `count` entries — fill remainder with silent partials
  return Array.from({ length: count }, (_, i) => ({
    ratio: i < drawbarRatios.length ? drawbarRatios[i] : i + 1,
    amplitude: i < drawbarAmps.length ? drawbarAmps[i] : 0,
    phase: 0,
  }));
}

function generateBellPartials(count: number): AdditivePartial[] {
  const bellRatios = [1, 2.0, 3.0, 4.2, 5.4, 6.8, 8.1, 9.3, 10.7, 12.0, 13.5, 15.1, 16.8, 18.6, 20.5, 22.5];
  return Array.from({ length: Math.min(count, bellRatios.length) }, (_, i) => ({
    ratio: bellRatios[i],
    amplitude: Math.pow(0.7, i),
    phase: Math.random() * Math.PI * 2,
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
    outputGain: -5,
  };
}

// ─── Instance ──────────────────────────────────────────────────────────────

interface ActiveVoice {
  oscillators: OscillatorNode[];
  gains: GainNode[];
  masterGain: GainNode;
  pitch: number;
  releaseTimeoutId?: ReturnType<typeof setTimeout>;
}

interface AdditiveInstance {
  output: GainNode;
  settings: AdditiveSettings;
  activeVoices: Map<number, ActiveVoice>;
}

function dBToLinear(dB: number): number {
  return Math.pow(10, dB / 20);
}

// ─── Engine ────────────────────────────────────────────────────────────────

class AdditiveEngine {
  private instances = new Map<string, AdditiveInstance>();

  async ensureStarted() {
    const engine = getAudioEngine();
    if (engine.ctx.state !== 'running') {
      await engine.resume();
    }
  }

  ensureTrack(
    trackId: string,
    settings: AdditiveSettings,
    connectTo?: AudioNode,
  ): AdditiveInstance {
    const outputLevel = dBToLinear(settings.outputGain);

    const existing = this.instances.get(trackId);
    if (existing) {
      existing.settings = { ...settings };
      existing.output.gain.value = outputLevel;
      return existing;
    }

    const ctx = getAudioEngine().ctx;
    const output = ctx.createGain();
    output.gain.value = outputLevel;
    // Connect to the supplied track node when available; otherwise
    // route directly to ctx.destination. This bypasses Tone's
    // DestinationClass wrapper (which had its own volume/mute) —
    // no audible impact in this app because master gain is handled
    // by AudioEngine's master bus on the connectTo path, and the
    // fallback is reachable only from _lazyInit (notes triggered
    // before ensureTrack was called with a connectTo). Codex P1 on
    // PR #1733.
    output.connect(connectTo ?? ctx.destination);

    const instance: AdditiveInstance = {
      output,
      settings: { ...settings },
      activeVoices: new Map(),
    };
    this.instances.set(trackId, instance);
    return instance;
  }

  noteOn(trackId: string, pitch: number, velocity = 100) {
    this._lazyInit(trackId);
    const instance = this.instances.get(trackId);
    if (!instance) return;

    this._stopVoice(instance, pitch);

    const { partials, ampEnvelope } = instance.settings;
    const ctx = getAudioEngine().ctx;
    const now = ctx.currentTime;
    const fundamentalFreq = midiToFrequency(pitch);
    const vel = Math.max(0, Math.min(127, velocity)) / 127;

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0, now);
    masterGain.gain.linearRampToValueAtTime(vel, now + ampEnvelope.attack);
    masterGain.gain.linearRampToValueAtTime(
      vel * ampEnvelope.sustain,
      now + ampEnvelope.attack + ampEnvelope.decay,
    );
    // Route into the instance's output bus (native GainNode). The
    // `.input` fallback from the prior Tone.Gain shape is no longer
    // needed — native GainNodes connect directly.
    masterGain.connect(instance.output);

    // Pre-compute active partial count once (avoid O(n²))
    const activeCount = partials.reduce((n, p) => n + (p.amplitude > 0 ? 1 : 0), 0);
    const normFactor = activeCount > 0 ? 1 / Math.sqrt(activeCount) : 1;

    const oscillators: OscillatorNode[] = [];
    const gains: GainNode[] = [];

    for (const partial of partials) {
      if (partial.amplitude <= 0) continue;

      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = fundamentalFreq * partial.ratio;

      const gain = ctx.createGain();
      gain.gain.value = partial.amplitude * normFactor;

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

    const ctx = getAudioEngine().ctx;
    const now = ctx.currentTime;
    const release = instance.settings.ampEnvelope.release;

    voice.masterGain.gain.cancelScheduledValues(now);
    voice.masterGain.gain.setValueAtTime(voice.masterGain.gain.value, now);
    voice.masterGain.gain.linearRampToValueAtTime(0, now + release);

    const stopTime = now + release + 0.05;
    for (const osc of voice.oscillators) {
      osc.stop(stopTime);
    }

    // Schedule full cleanup after release tail
    const cleanupDelay = (release + 0.1) * 1000;
    const timeoutId = setTimeout(() => {
      this._cleanupVoice(voice);
    }, cleanupDelay);
    voice.releaseTimeoutId = timeoutId;

    instance.activeVoices.delete(pitch);
  }

  triggerAttackRelease(trackId: string, pitch: number, duration: number, velocity = 1) {
    this.noteOn(trackId, pitch, Math.round(velocity * 127));
    const timeoutId = setTimeout(() => {
      this.noteOff(trackId, pitch);
    }, duration * 1000);
    // Store timeout for cleanup
    const instance = this.instances.get(trackId);
    const voice = instance?.activeVoices.get(pitch);
    if (voice) {
      voice.releaseTimeoutId = timeoutId;
    }
  }

  setParameter(trackId: string, name: string, value: number | string | boolean) {
    const instance = this.instances.get(trackId);
    if (!instance) return;

    switch (name) {
      case 'outputGain':
        instance.output.gain.value = dBToLinear(value as number);
        break;
    }
  }

  /** Update partials. Stops active voices so new notes use updated partials. */
  updatePartials(trackId: string, partials: AdditivePartial[]) {
    const instance = this.instances.get(trackId);
    if (!instance) return;
    instance.settings.partials = [...partials];
    // Stop active voices — they were created with old partial config
    for (const pitch of [...instance.activeVoices.keys()]) {
      this._stopVoice(instance, pitch);
    }
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
    // Native GainNode has no `dispose` — `disconnect` releases the
    // graph edge; GC reclaims the node itself.
    try { instance.output.disconnect(); } catch { /* already disconnected */ }
    this.instances.delete(trackId);
  }

  dispose() {
    for (const trackId of [...this.instances.keys()]) {
      this.removeTrack(trackId);
    }
  }

  /** Lazily create instance with defaults if noteOn arrives before ensureTrack. */
  private _lazyInit(trackId: string) {
    if (!this.instances.has(trackId)) {
      this.ensureTrack(trackId, createDefaultAdditiveSettings());
    }
  }

  private _stopVoice(instance: AdditiveInstance, pitch: number) {
    const voice = instance.activeVoices.get(pitch);
    if (!voice) return;
    if (voice.releaseTimeoutId) clearTimeout(voice.releaseTimeoutId);
    this._cleanupVoice(voice);
    instance.activeVoices.delete(pitch);
  }

  /** Disconnect and release all AudioNodes for a voice. */
  private _cleanupVoice(voice: ActiveVoice) {
    for (const osc of voice.oscillators) {
      try { osc.stop(); } catch { /* already stopped */ }
      try { osc.disconnect(); } catch { /* already disconnected */ }
    }
    for (const gain of voice.gains) {
      try { gain.disconnect(); } catch { /* already disconnected */ }
    }
    try { voice.masterGain.disconnect(); } catch { /* already disconnected */ }
  }
}

export const additiveEngine = new AdditiveEngine();
