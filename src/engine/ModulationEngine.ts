/**
 * Modulation Matrix Engine — routes LFO / macro sources to synth
 * parameters. Each track has up to 8 modulation slots.
 *
 * Phase 5I migration: replaced Tone.LFO / Signal / Multiply / Scale
 * with native Web Audio primitives. Mapping:
 *   Tone.LFO       → OscillatorNode (native sine/square/triangle/sawtooth)
 *   Tone.Signal(v) → ConstantSourceNode with offset.value = v
 *   Tone.Multiply  → GainNode (gain = factor)
 *   Tone.Scale(0,1)→ WaveShaperNode with curve [0, 0.5, 1]
 *                    (linear remap from [-1,1] to [0,1])
 */

import { getAudioEngine } from '../hooks/useAudioEngine';
import type {
  ModulationSettings,
  ModulationSource,
  ModulationDestination,
} from '../types/project';

/**
 * Destination: native AudioParam / AudioNode, or — transitionally —
 * any object with a `connect` method. During the Tone migration some
 * upstream engines (Subtractive/Synth/etc.) still hand back Tone
 * wrappers; once those land on native-only, this union can shrink to
 * just `AudioParam | AudioNode`. We intentionally don't import
 * `tone`'s types here, even as a `type`-only import, so removing the
 * `tone` package doesn't depend on finishing every engine first. At
 * runtime the `.connect()` call is wrapped in try/catch, so any
 * target that isn't compatible with native `AudioNode.connect`
 * degrades silently.
 */
// `any`-typed params so Tone's `ToneAudioNode.connect(destination: InputNode, …)`
// structurally matches without dragging in Tone's `InputNode` type.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ModulationTarget = AudioParam | AudioNode | { connect: (target: any, ...rest: any[]) => any };

export interface ModulationTargets {
  pitch?: ModulationTarget;
  filterCutoff?: ModulationTarget;
  filterResonance?: ModulationTarget;
  amp?: ModulationTarget;
  pan?: ModulationTarget;
  oscLevel?: ModulationTarget;
  lfo1Rate?: ModulationTarget;
  lfo2Rate?: ModulationTarget;
  fmIndex?: ModulationTarget;
  wtPosition?: ModulationTarget;
}

type LfoSourceNode = {
  kind: 'lfo';
  osc: OscillatorNode;
  output: AudioNode;
};

type SignalSourceNode = {
  kind: 'signal';
  constant: ConstantSourceNode;
  output: AudioNode;
};

type SourceNode = LfoSourceNode | SignalSourceNode;

interface SlotConnection {
  dispose: () => void;
}

interface TrackModulation {
  sources: Map<ModulationSource, SourceNode>;
  connections: SlotConnection[];
  settings: ModulationSettings;
}

/**
 * WaveShaper curve that linearly remaps its [-1, 1] input range to
 * [0, 1] — the unipolar fold Tone.Scale(0, 1) used to do.
 *
 * Hoisted to a module-level constant so `applyModulation` doesn't
 * allocate a fresh 3-element Float32Array per unipolar LFO slot.
 * The same curve buffer is safe to assign to many WaveShaperNodes —
 * each node reads the values at assignment time.
 *
 * Typed as `Float32Array<ArrayBuffer>` to satisfy TS 5.7's strict
 * generic TypedArray typings for `WaveShaperNode.curve`.
 */
const UNIPOLAR_CURVE: Float32Array<ArrayBuffer> = (() => {
  const curve = new Float32Array(3);
  curve[0] = 0;
  curve[1] = 0.5;
  curve[2] = 1;
  return curve;
})();

/**
 * Connect a native AudioNode to `target`. The target can be a native
 * AudioParam / AudioNode, or — during the Tone migration — a Tone
 * wrapper that native `.connect()` doesn't understand. We `try` the
 * connection and silently drop it on failure so an unmigrated engine
 * doesn't crash the audio graph; the scaler node still gets created,
 * just with no downstream. Returns `true` iff the connect succeeded.
 */
function connectToTarget(output: AudioNode, target: ModulationTarget): boolean {
  try {
    // The union type defeats TS's overload resolution here; cast to
    // `never` to let the runtime's overload handling pick the right
    // signature (AudioParam vs AudioNode).
    output.connect(target as never);
    return true;
  } catch {
    return false;
  }
}

function disconnectFromTarget(output: AudioNode, target: ModulationTarget): void {
  try {
    output.disconnect(target as never);
  } catch { /* already disconnected or never connected */ }
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

    const ctx = getAudioEngine().ctx;
    const sources = new Map<ModulationSource, SourceNode>();
    const connections: SlotConnection[] = [];

    const getSource = (source: ModulationSource): SourceNode | null => {
      const cached = sources.get(source);
      if (cached) return cached;

      let sourceNode: SourceNode | null = null;

      switch (source) {
        case 'lfo1': {
          const osc = ctx.createOscillator();
          osc.type = settings.lfo1.waveform as OscillatorType;
          osc.frequency.value = settings.lfo1.rateHz;
          osc.start();
          sourceNode = { kind: 'lfo', osc, output: osc };
          break;
        }
        case 'lfo2': {
          const osc = ctx.createOscillator();
          osc.type = settings.lfo2.waveform as OscillatorType;
          osc.frequency.value = settings.lfo2.rateHz;
          osc.start();
          sourceNode = { kind: 'lfo', osc, output: osc };
          break;
        }
        case 'macro1':
        case 'macro2':
        case 'macro3':
        case 'macro4': {
          const idx = parseInt(source.replace('macro', '')) - 1;
          const constant = ctx.createConstantSource();
          constant.offset.value = settings.macros[idx] ?? 0;
          constant.start();
          sourceNode = { kind: 'signal', constant, output: constant };
          break;
        }
        // Velocity, modWheel, envelope sources need per-note triggering — defer to future
        default:
          return null;
      }

      sources.set(source, sourceNode);
      return sourceNode;
    };

    // Wire each slot
    for (const slot of settings.slots) {
      const source = getSource(slot.source);
      if (!source) continue;

      const target = this.resolveTarget(slot.destination, targets);
      if (!target) continue;

      // Try the downstream connection first — if the target is a
      // still-Tone-wrapped value from an unmigrated engine, native
      // `.connect()` will throw. In that case we bail before
      // allocating the scaler / shaper and leaking nodes into the
      // track's dispose queue.
      const scaler = ctx.createGain();
      scaler.gain.value = slot.amount;
      const connected = connectToTarget(scaler, target);
      if (!connected) {
        try { scaler.disconnect(); } catch { /* already disconnected */ }
        continue;
      }

      // For unipolar (bipolar=false) LFO sources, fold output from
      // [-1, 1] to [0, 1] via a WaveShaper before the amount scaler.
      const isLfoSource = source.kind === 'lfo';
      let upstream: AudioNode = source.output;

      if (!slot.bipolar && isLfoSource) {
        const shaper = ctx.createWaveShaper();
        shaper.curve = UNIPOLAR_CURVE;
        source.output.connect(shaper);
        upstream = shaper;
        connections.push({
          dispose: () => {
            try { source.output.disconnect(shaper); } catch { /* already disconnected */ }
            try { shaper.disconnect(); } catch { /* already disconnected */ }
          },
        });
      }

      // Scaling node: upstream × amount → destination.
      const slotUpstream = upstream;
      slotUpstream.connect(scaler);

      connections.push({
        dispose: () => {
          try { slotUpstream.disconnect(scaler); } catch { /* already disconnected */ }
          disconnectFromTarget(scaler, target);
          try { scaler.disconnect(); } catch { /* already disconnected */ }
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
    if (source && source.kind === 'signal') {
      source.constant.offset.value = Math.max(0, Math.min(1, value));
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
    if (source && source.kind === 'lfo') {
      source.osc.frequency.value = rateHz;
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
      if (source.kind === 'lfo') {
        try { source.osc.stop(); } catch { /* already stopped */ }
        try { source.osc.disconnect(); } catch { /* already disconnected */ }
      } else {
        try { source.constant.stop(); } catch { /* already stopped */ }
        try { source.constant.disconnect(); } catch { /* already disconnected */ }
      }
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
  ): ModulationTarget | null {
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
