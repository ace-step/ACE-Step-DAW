# Fix: Wire EffectsEngine into TrackNode Audio Graph

## 1. Current Signal Chain in TrackNode (Web Audio API)

```
source → inputGain → panNode → eqLow → eqMid → eqHigh
                                                   ├→ dryGain ──────────→ sumGain → compressor → volumeGain → destination
                                                   └→ convolver → wetGain ─┘
```

All nodes are native `AudioNode` instances created from a single `AudioContext` (48 kHz,
owned by `AudioEngine`). The chain is wired once in the `TrackNode` constructor and never
re-wired.

## 2. Why EffectsEngine Nodes Are Never Heard

`EffectsEngine.rebuildChain()` creates **Tone.js** `ToneAudioNode` instances (EQ3,
Compressor, Reverb, FeedbackDelay, Distortion, Filter) and connects them to each other
internally via `nodes[i].node.connect(nodes[i+1].node)`. However:

- **No connection to TrackNode**: The first node in the Tone chain has no input from
  `eqHigh`, and the last node has no output to `dryGain`/`sumGain`. The chain floats
  disconnected.
- **AudioContext mismatch**: Tone.js creates its own `Tone.getContext()` AudioContext by
  default. TrackNode uses `AudioEngine.ctx`. Two different contexts cannot share nodes —
  `connect()` across contexts throws.
- **EffectChain.tsx** calls `effectsEngine.rebuildChain()` and `updateEffectParams()` but
  never tells `TrackNode` to splice anything into its graph.

## 3. Proposed Fix

**Principle**: Keep it minimal. Don't rewrite TrackNode in Tone.js. Instead, expose the
Tone chain's underlying native `AudioNode` endpoints and splice them into TrackNode's
existing Web Audio graph.

### 3a. Force Tone.js onto our AudioContext

In `AudioEngine` constructor (or a one-time init), call:

```ts
import * as Tone from 'tone';
Tone.setContext(this.ctx);   // before any Tone nodes are created
```

This makes all subsequent `new Tone.*()` calls use our 48 kHz context. Must happen before
the first `EffectsEngine.rebuildChain()`.

### 3b. Add splice helpers to EffectsEngine

```ts
// EffectsEngine.ts — new public methods

/** Native AudioNode input of the chain (first node's input). null = no active effects. */
getInputNode(trackId: string): AudioNode | null {
  const nodes = this.chains.get(trackId);
  if (!nodes?.length) return null;
  return (nodes[0].node as any).input ?? (nodes[0].node as any)._nativeAudioNode;
}

/** Native AudioNode output of the chain (last node's output). */
getOutputNode(trackId: string): AudioNode | null {
  const nodes = this.chains.get(trackId);
  if (!nodes?.length) return null;
  return (nodes[nodes.length - 1].node as any).output ?? (nodes[nodes.length - 1].node as any)._nativeAudioNode;
}
```

> Tone.js `ToneAudioNode` exposes `.input` and `.output` properties that are native
> `AudioNode` or `GainNode` references. These are the stable API for bridging.

### 3c. Add `spliceEffects()` to TrackNode

```ts
// TrackNode.ts — new field + method
private effectsInput: AudioNode | null = null;
private effectsOutput: AudioNode | null = null;

spliceEffects(input: AudioNode | null, output: AudioNode | null) {
  // Disconnect old splice point: eqHigh → dryGain
  this.eqHigh.disconnect(this.dryGain);
  this.eqHigh.disconnect(this.convolver);

  if (this.effectsOutput) {
    this.effectsOutput.disconnect(this.dryGain);
    this.effectsOutput.disconnect(this.convolver);
  }

  if (input && output) {
    // eqHigh → effects input ... effects output → dryGain / convolver
    this.eqHigh.connect(input);
    output.connect(this.dryGain);
    output.connect(this.convolver);
  } else {
    // No effects — restore direct path
    this.eqHigh.connect(this.dryGain);
    this.eqHigh.connect(this.convolver);
  }

  this.effectsInput = input;
  this.effectsOutput = output;
}
```

### 3d. Call spliceEffects after every rebuildChain

In `EffectChain.tsx` (or a new wiring hook), after `effectsEngine.rebuildChain()`:

```ts
const trackNode = audioEngine.getOrCreateTrackNode(track.id);
const inp = effectsEngine.getInputNode(track.id);
const out = effectsEngine.getOutputNode(track.id);
trackNode.spliceEffects(inp, out);
```

## 4. Files to Change

| File | Change |
|---|---|
| `src/engine/AudioEngine.ts` | Add `Tone.setContext(this.ctx)` in constructor (1 line + import) |
| `src/engine/EffectsEngine.ts` | Add `getInputNode()` / `getOutputNode()` methods (~16 lines) |
| `src/engine/TrackNode.ts` | Add `spliceEffects()` method + two private fields (~20 lines) |
| `src/components/mixer/EffectChain.tsx` | After `rebuildChain()`, call `spliceEffects` via audioEngine ref (~5 lines in useEffect + applyPreset) |

**Total**: ~45 lines of new code, 0 lines of deleted logic.

## 5. Tone.js → Web Audio Bridge Notes

- `Tone.setContext(ctx)` must be called **before** any `new Tone.*()`. If called late,
  existing nodes remain on the old context and are silently broken. Guard with an
  `assert` or init flag.
- `ToneAudioNode.input` / `.output` are `AudioNode | undefined`. For compound nodes
  (EQ3 has 3 internal bands), `.input` is the shared input gain and `.output` is the
  merged output — safe to use as splice points.
- Tone.js Reverb generates an IR asynchronously (`Tone.Reverb.generate()`). After
  `rebuildChain`, the reverb may be silent for ~100ms until the IR resolves. Consider
  awaiting `.ready` before splicing, or accept the brief gap.
- `dispose()` on a Tone node disconnects its underlying native nodes. The existing
  `disposeChain()` already handles this, but `spliceEffects(null, null)` must be called
  **before** dispose to restore the direct eqHigh→dryGain path.
