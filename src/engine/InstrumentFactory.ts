import type { TrackInstrument } from '../types/project';
import type { InstrumentEngine } from './InstrumentEngine';
import { synthEngine } from './SynthEngine';
import { samplerEngine } from './SamplerEngine';
import { granularEngine } from './GranularEngine';
import { additiveEngine } from './AdditiveEngine';
import { karplusStrongEngine } from './KarplusStrongEngine';

/**
 * Adapter that wraps the legacy {@link SynthEngine} singleton to conform to
 * the {@link InstrumentEngine} interface.
 */
class SynthEngineAdapter implements InstrumentEngine {
  noteOn(trackId: string, pitch: number, velocity: number): void {
    synthEngine.noteOn(trackId, pitch, velocity);
  }

  noteOff(trackId: string, pitch: number): void {
    synthEngine.noteOff(trackId, pitch);
  }

  triggerAttackRelease(trackId: string, pitch: number, duration: number, velocity: number): void {
    // Delegate to the singleton which handles MIDI-to-freq conversion and preset routing.
    void synthEngine.playNote(trackId, pitch, velocity, duration, 'piano');
  }

  setParameter(_trackId: string, _name: string, _value: number | string | boolean): void {
    // Intentional no-op: this adapter wraps the legacy synthEngine for direct
    // note triggering only. Realtime subtractive parameter changes during
    // PianoRoll playback are handled by subtractiveEngine, so forwarding
    // parameters here would mutate the wrong engine instance.
  }

  releaseAll(): void {
    synthEngine.releaseAll();
  }

  removeTrack(trackId: string): void {
    synthEngine.removeTrackSynth(trackId);
  }

  dispose(): void {
    synthEngine.dispose();
  }
}

/**
 * Adapter that wraps the {@link SamplerEngine} singleton to conform to
 * the {@link InstrumentEngine} interface.
 */
class SamplerEngineAdapter implements InstrumentEngine {
  noteOn(trackId: string, pitch: number, velocity: number): void {
    samplerEngine.noteOn(trackId, pitch, velocity);
  }

  noteOff(trackId: string, pitch: number): void {
    samplerEngine.noteOff(trackId, pitch);
  }

  triggerAttackRelease(trackId: string, pitch: number, duration: number, velocity: number): void {
    samplerEngine.triggerAttackRelease(trackId, pitch, duration, velocity);
  }

  setParameter(_trackId: string, _name: string, _value: number | string | boolean): void {
    // Sampler parameters (ADSR, root note, etc.) are set via ensureTrackSampler config.
    // A future PR will wire individual param updates here.
  }

  releaseAll(): void {
    samplerEngine.releaseAll();
  }

  removeTrack(trackId: string): void {
    samplerEngine.removeTrack(trackId);
  }

  dispose(): void {
    samplerEngine.dispose();
  }
}

/**
 * Stub adapter for FM synthesis.
 *
 * FM synthesis is not yet implemented as a standalone engine — tracks with
 * `kind: 'fm'` fall back to the subtractive synth using {@link FmTrackInstrument.fallbackPreset}.
 * Once a dedicated FM engine exists this adapter will delegate to it.
 */
class FmEngineAdapter implements InstrumentEngine {
  private readonly fallback = new SynthEngineAdapter();

  noteOn(trackId: string, pitch: number, velocity: number): void {
    this.fallback.noteOn(trackId, pitch, velocity);
  }

  noteOff(trackId: string, pitch: number): void {
    this.fallback.noteOff(trackId, pitch);
  }

  triggerAttackRelease(trackId: string, pitch: number, duration: number, velocity: number): void {
    this.fallback.triggerAttackRelease(trackId, pitch, duration, velocity);
  }

  setParameter(trackId: string, name: string, value: number | string | boolean): void {
    this.fallback.setParameter(trackId, name, value);
  }

  releaseAll(): void {
    this.fallback.releaseAll();
  }

  removeTrack(trackId: string): void {
    this.fallback.removeTrack(trackId);
  }

  dispose(): void {
    this.fallback.dispose();
  }
}

/**
 * Adapter that wraps the {@link GranularEngine} singleton to conform to
 * the {@link InstrumentEngine} interface.
 */
class GranularEngineAdapter implements InstrumentEngine {
  noteOn(trackId: string, pitch: number, velocity: number): void {
    granularEngine.noteOn(trackId, pitch, velocity);
  }

  noteOff(trackId: string, pitch: number): void {
    granularEngine.noteOff(trackId, pitch);
  }

  triggerAttackRelease(trackId: string, pitch: number, duration: number, velocity: number): void {
    granularEngine.triggerAttackRelease(trackId, pitch, duration, velocity);
  }

  setParameter(trackId: string, name: string, value: number | string | boolean): void {
    granularEngine.setParameter(trackId, name, value);
  }

  releaseAll(): void {
    granularEngine.releaseAll();
  }

  removeTrack(trackId: string): void {
    granularEngine.removeTrack(trackId);
  }

  dispose(): void {
    granularEngine.dispose();
  }
}

/**
* Adapter for additive synthesis engine.
 */
class AdditiveEngineAdapter implements InstrumentEngine {
  noteOn(trackId: string, pitch: number, velocity: number): void {
    additiveEngine.noteOn(trackId, pitch, velocity);
  }

  noteOff(trackId: string, pitch: number): void {
    additiveEngine.noteOff(trackId, pitch);
  }

  triggerAttackRelease(trackId: string, pitch: number, duration: number, velocity: number): void {
    additiveEngine.triggerAttackRelease(trackId, pitch, duration, velocity);
  }

  setParameter(trackId: string, name: string, value: number | string | boolean): void {
    additiveEngine.setParameter(trackId, name, value);
  }

  releaseAll(): void {
    additiveEngine.releaseAll();
  }

  removeTrack(trackId: string): void {
    additiveEngine.removeTrack(trackId);
  }

  dispose(): void {
    additiveEngine.dispose();
  }
}

/**
 * Adapter for Karplus-Strong physical modeling synthesis.
 */
class KarplusStrongAdapter implements InstrumentEngine {
  noteOn(trackId: string, pitch: number, velocity: number): void {
    karplusStrongEngine.noteOn(trackId, pitch, velocity);
  }

  noteOff(trackId: string, pitch: number): void {
    karplusStrongEngine.noteOff(trackId, pitch);
  }

  triggerAttackRelease(trackId: string, pitch: number, duration: number, velocity: number): void {
    karplusStrongEngine.triggerAttackRelease(trackId, pitch, duration, velocity);
  }

  setParameter(trackId: string, name: string, value: number | string | boolean): void {
    karplusStrongEngine.setParameter(trackId, name, value);
  }

  releaseAll(): void {
    karplusStrongEngine.releaseAll();
  }

  removeTrack(trackId: string): void {
    karplusStrongEngine.removeTrack(trackId);
  }

  dispose(): void {
    karplusStrongEngine.dispose();
  }
}

// ── Singletons (one adapter per kind) ──────────────────────────────────────

const subtractiveAdapter = new SynthEngineAdapter();
const samplerAdapter = new SamplerEngineAdapter();
const fmAdapter = new FmEngineAdapter();
const granularAdapter = new GranularEngineAdapter();
const additiveAdapter = new AdditiveEngineAdapter();
const physicalAdapter = new KarplusStrongAdapter();

/**
 * Return the {@link InstrumentEngine} that should handle playback for the
 * given track instrument descriptor.
 */
export function getEngineForInstrument(instrument: TrackInstrument): InstrumentEngine {
  switch (instrument.kind) {
    case 'subtractive':
      return subtractiveAdapter;
    case 'sampler':
      return samplerAdapter;
    case 'fm':
      return fmAdapter;
    case 'wavetable':
      // Wavetable falls back to subtractive adapter for now
      return subtractiveAdapter;
    case 'granular':
      return granularAdapter;
case 'additive':
      return additiveAdapter;
case 'physical':
      return physicalAdapter;
  }
}

// Re-export the adapters for direct testing.
export { SynthEngineAdapter, SamplerEngineAdapter, FmEngineAdapter, GranularEngineAdapter, AdditiveEngineAdapter, KarplusStrongAdapter };
