/**
 * Modulation Matrix Engine
 *
 * Manages Tone.js LFO and Signal nodes for flexible modulation routing.
 * Each track can have up to 8 modulation slots routing sources (LFOs,
 * envelopes, macros) to destinations (synth parameters).
 *
 * Architecture:
 * - Source nodes (LFO1, LFO2, macros) are Tone.Signal or Tone.LFO instances
 * - Each slot creates a Tone.Multiply (amount) node between source and destination
 * - Destinations are AudioParam references obtained from the synth engine
 */

import * as Tone from 'tone';
import type {
  ModulationSettings,
  ModulationSlot,
  ModulationSource,
  ModulationDestination,
} from '../types/project';

/**
 * Destination resolver: given a track's audio nodes, returns the AudioParam references to modulate.
 * Uses Tone.InputNode as the common type since Tone.js Param/Signal generics are complex.
 */
export interface ModulationTargets {
  pitch?: Tone.InputNode;
  filterCutoff?: Tone.InputNode;
  filterResonance?: Tone.InputNode;
  amp?: Tone.InputNode;
  pan?: Tone.InputNode;
  oscLevel?: Tone.InputNode;
  lfo1Rate?: Tone.InputNode;
  lfo2Rate?: Tone.InputNode;
  fmIndex?: Tone.InputNode;
  wtPosition?: Tone.InputNode;
}

interface SourceNode {
  node: Tone.LFO | Tone.Signal;
  dispose: () => void;
}

interface SlotConnection {
  scaler: Tone.Multiply;
  dispose: () => void;
}

interface TrackModulation {
  sources: Map<ModulationSource, SourceNode>;
  connections: SlotConnection[];
  settings: ModulationSettings;
}

class ModulationEngine {
  private tracks = new Map<string, TrackModulation>();

  /**
   * Set up modulation for a track given its settings and available audio targets.
   * Call this after the synth is created and connected.
   */
  applyModulation(
    trackId: string,
    settings: ModulationSettings,
    targets: ModulationTargets,
  ): void {
    // Clean up existing modulation for this track
    this.removeTrack(trackId);

    if (settings.slots.length === 0) return;

    const sources = new Map<ModulationSource, SourceNode>();
    const connections: SlotConnection[] = [];

    // Create source nodes on demand
    const getSource = (source: ModulationSource): SourceNode | null => {
      if (sources.has(source)) return sources.get(source)!;

      let sourceNode: SourceNode | null = null;

      switch (source) {
        case 'lfo1': {
          const lfo = new Tone.LFO({
            frequency: settings.lfo1.rateHz,
            type: settings.lfo1.waveform as Tone.ToneOscillatorType,
            min: -1,
            max: 1,
          });
          lfo.start();
          sourceNode = { node: lfo, dispose: () => { lfo.stop(); lfo.dispose(); } };
          break;
        }
        case 'lfo2': {
          const lfo = new Tone.LFO({
            frequency: settings.lfo2.rateHz,
            type: settings.lfo2.waveform as Tone.ToneOscillatorType,
            min: -1,
            max: 1,
          });
          lfo.start();
          sourceNode = { node: lfo, dispose: () => { lfo.stop(); lfo.dispose(); } };
          break;
        }
        case 'macro1':
        case 'macro2':
        case 'macro3':
        case 'macro4': {
          const idx = parseInt(source.replace('macro', '')) - 1;
          const sig = new Tone.Signal(settings.macros[idx] ?? 0);
          sourceNode = { node: sig, dispose: () => sig.dispose() };
          break;
        }
        // Velocity, modWheel, envelope sources need per-note triggering — defer to future
        default:
          return null;
      }

      if (sourceNode) {
        sources.set(source, sourceNode);
      }
      return sourceNode;
    };

    // Wire each slot
    for (const slot of settings.slots) {
      const source = getSource(slot.source);
      if (!source) continue;

      const target = this.resolveTarget(slot.destination, targets);
      if (!target) continue;

      // Create scaling node: source * amount → destination
      const scaler = new Tone.Multiply(slot.amount);
      source.node.connect(scaler);
      scaler.connect(target);

      connections.push({
        scaler,
        dispose: () => {
          scaler.dispose();
        },
      });
    }

    this.tracks.set(trackId, { sources, connections, settings });
  }

  /**
   * Update a macro knob value in real-time.
   */
  setMacro(trackId: string, macroIndex: 0 | 1 | 2 | 3, value: number): void {
    const track = this.tracks.get(trackId);
    if (!track) return;

    const sourceKey = `macro${macroIndex + 1}` as ModulationSource;
    const source = track.sources.get(sourceKey);
    if (source && source.node instanceof Tone.Signal) {
      source.node.value = Math.max(0, Math.min(1, value));
    }
  }

  /**
   * Update LFO rate in real-time.
   */
  setLfoRate(trackId: string, lfoIndex: 0 | 1, rateHz: number): void {
    const track = this.tracks.get(trackId);
    if (!track) return;

    const sourceKey = lfoIndex === 0 ? 'lfo1' : 'lfo2';
    const source = track.sources.get(sourceKey);
    if (source && source.node instanceof Tone.LFO) {
      source.node.frequency.value = rateHz;
    }
  }

  /**
   * Remove and dispose all modulation for a track.
   */
  removeTrack(trackId: string): void {
    const track = this.tracks.get(trackId);
    if (!track) return;

    for (const conn of track.connections) {
      conn.dispose();
    }
    for (const source of track.sources.values()) {
      source.dispose();
    }
    this.tracks.delete(trackId);
  }

  /**
   * Release all modulation across all tracks.
   */
  releaseAll(): void {
    for (const trackId of [...this.tracks.keys()]) {
      this.removeTrack(trackId);
    }
  }

  private resolveTarget(
    dest: ModulationDestination,
    targets: ModulationTargets,
  ): Tone.InputNode | null {
    switch (dest) {
      case 'pitch': return targets.pitch ?? null;
      case 'filterCutoff': return targets.filterCutoff ?? null;
      case 'filterResonance': return targets.filterResonance ?? null;
      case 'amp': return targets.amp ?? null;
      case 'pan': return targets.pan ?? null;
      case 'oscLevel': return targets.oscLevel ?? null;
      case 'lfo1Rate': return targets.lfo1Rate ?? null;
      case 'lfo2Rate': return targets.lfo2Rate ?? null;
      case 'fmIndex': return targets.fmIndex ?? null;
      case 'wtPosition': return targets.wtPosition ?? null;
      default: return null;
    }
  }
}

export const modulationEngine = new ModulationEngine();
