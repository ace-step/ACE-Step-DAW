---
name: refer_opendaw_design
version: 0.2.0
description: |
  Comprehensive reference guide for openDAW (github.com/andremichelle/openDAW) design patterns,
  architecture, and interaction design — adapted for ACE-Step-DAW's React + Zustand + Tone.js stack.
  Use when designing new features, improving interactions, or building DAW-specific systems.
  Invoke with /refer_opendaw_design when you need proven DAW design patterns as a reference.
  Supports direct source code reading from the local openDAW clone.
---

# openDAW Design Reference for ACE-Step-DAW

> Source: [github.com/andremichelle/openDAW](https://github.com/andremichelle/openDAW)
> openDAW is a TypeScript monorepo (~30 packages) built with custom JSX, a graph-based Box data model,
> and raw Web Audio API. We share the **DAWProject** protocol. This document maps their proven patterns
> to our React 19 + Zustand 5 + Tone.js + Tailwind CSS v4 stack.

When implementing any DAW feature, check the relevant section below before writing code.
Each section includes the openDAW approach, our equivalent, and concrete adaptation guidance.

---

## How to Use This Skill

### Text Reference
Each section below provides a summary of the openDAW pattern and how to adapt it.

### Direct Source Code Reading
The openDAW source code is cloned locally at:
```
.claude/references/openDAW/
```

**Every section lists key source files under `Source Files`.** When the text summary is not enough,
**read the actual source files** using the Read tool to study the real implementation.

Example workflow:
1. Read this skill for the relevant section's summary
2. If you need more implementation detail, use the Read tool on the listed source files
3. Adapt the patterns to our React + Zustand + Tone.js stack

### Keeping the Reference Up to Date
If the local clone is missing or outdated, run:
```bash
cd .claude/references/openDAW && git pull
# or re-clone:
rm -rf .claude/references/openDAW && git clone --depth=1 https://github.com/andremichelle/openDAW.git .claude/references/openDAW
```

### Shorthand
`$OPENDAW` = `.claude/references/openDAW` throughout this document.

---

## 1. Architecture & Data Model

### Source Files (`$OPENDAW/`)
- `packages/lib/box/src/graph.ts` — BoxGraph core: manages boxes, vertices, edges
- `packages/lib/box/src/editing.ts` — Transaction system, undo/redo history
- `packages/lib/box/src/updates.ts` — Update types (New, Delete, Pointer, Primitive)
- `packages/lib/box/src/vertex.ts` — Vertex abstraction for graph nodes
- `packages/lib/box/src/box.ts` — Box base class and container logic
- `packages/lib/box/src/serializer.ts` — Binary serialization/deserialization
- `packages/lib/box/src/graph-edges.ts` — Graph edge management

### openDAW Pattern
**Box Graph** (`@opendaw/lib-box`): All project data lives in a typed graph of "Box" nodes with fields (primitives, pointers, arrays, objects). Every mutation is wrapped in a **transaction** — a list of `Modification` objects (NewUpdate, DeleteUpdate, PrimitiveUpdate, PointerUpdate). Undo/redo replays or inverts these modification lists. The graph is serialized to binary `ArrayBuffer`, not JSON.

**Three-layer architecture**:
1. **Boxes** — raw data containers (like database rows)
2. **Adapters** — domain logic wrappers (like view models). `AudioUnitBoxAdapter`, `TrackBoxAdapter`, `RegionBoxAdapter` provide reactive read-only views with methods like `copyTo()`, `flatten()`, `consolidate()`
3. **Engine** — audio worklet processing, communicates via `MessagePort`

**Key design**: Editing class tracks `#pending` modifications, `#marked` history stack, `#historyIndex` for undo position, and `#savedHistoryIndex` for dirty detection.

### ACE-Step-DAW Mapping
- **Store**: `src/store/projectStore.ts` (Zustand) — single source of truth
- **Undo**: `_pushHistory()` snapshots project state before mutations
- **Types**: `src/types/project.ts` — flat TypeScript interfaces

### How to Apply

**Always batch related mutations into a single `_pushHistory()` call**:
```typescript
// BAD: Two separate history entries for one logical action
addTrack(track);
addClipToTrack(track.id, clip);

// GOOD: One history entry (parallel to openDAW transactions)
set(state => {
  state._pushHistory();
  const tracks = [...state.project.tracks, newTrack];
  const clips = [...state.project.clips, newClip];
  return { project: { ...state.project, tracks, clips } };
});
```

**Use custom hooks as "adapters"** — derived/computed state stays out of the store:
```typescript
function useTrackAdapter(trackId: string) {
  const track = useProjectStore(s => s.project.tracks.find(t => t.id === trackId));
  const clips = useProjectStore(s => s.project.clips.filter(c => c.trackId === trackId));
  const isAudible = useProjectStore(s => {
    const anySoloed = s.project.tracks.some(t => t.soloed);
    return !anySoloed || track?.soloed;
  });
  return { track, clips, isAudible };
}
```

**Dirty detection**: Track `savedHistoryIndex` alongside `historyIndex` to show unsaved indicator.

---

## 2. Timeline & PPQN Time System

### Source Files (`$OPENDAW/`)
- `packages/lib/dsp/src/ppqn.ts` — PPQN utilities (960 per quarter, conversions)
- `packages/lib/dsp/src/tempo.ts` — Tempo and BPM utilities
- `packages/lib/dsp/src/time-base.ts` — Time base conversions
- `packages/lib/dsp/src/constants.ts` — DAW-wide constants
- `packages/studio/core/src/ui/timeline/TimeGrid.ts` — Grid snapping (bar/beat/tick)
- `packages/studio/core/src/ui/timeline/TimelineRange.ts` — Viewport range and zoom
- `packages/lib/dsp/src/smpte.ts` — SMPTE timecode

### openDAW Pattern
**PPQN = 960 per quarter note** (factors: 3 x 5 x 2^6 — cleanly divides into triplets, quintuplets, and all standard subdivisions down to 1/128 notes).

**Time conversions** (`@opendaw/lib-dsp`):
- `PPQN.secondsToPulses(seconds, bpm)` / `PPQN.pulsesToSeconds(ppqn, bpm)`
- `PPQN.samplesToPulses(samples, sampleRate, bpm)`
- Display format: `bar.beat.semiquaver:tick`

**Snapping** (`Snapping.ts`): 12 modes — Smart, Bar, 1/2, 1/4, 1/8, 1/8T (triplet), 1/16, 1/16T, 1/32, 1/64, 1/128, Off. **Smart snap** dynamically chooses the finest resolution where grid lines are at least 16px apart at current zoom.

**TimelineRange**: Single object encapsulating `{ startUnit, endUnit, pixelWidth }` with methods `unitToPixel(unit)`, `pixelToUnit(px)`, `unitsPerPixel`. All timeline components share one instance.

**Region model**: `{ position, duration, complete, loopDuration?, loopOffset? }`. `complete = position + duration` for non-looped; for looped regions, the visual length can exceed the source audio.

### ACE-Step-DAW Mapping
- Time: beat-based (`startBeat`, `durationBeats` on MidiNote), seconds-based for clips
- Grid: `PianoRollGrid = '1/4' | '1/8' | '1/16' | '1/32'`
- Layout: `src/components/timeline/timelineLayout.ts`, `GridOverlay.tsx`

### How to Apply

**Smart snap algorithm**:
```typescript
function getSmartSnapResolution(pixelsPerBeat: number): number {
  // Start fine, double until grid lines are visible (>= 8px apart)
  const divisions = [1/32, 1/16, 1/8, 1/4, 1/2, 1, 4]; // in beats
  for (const div of divisions) {
    if (div * pixelsPerBeat >= 8) return div;
  }
  return 4; // bar-level snap at extreme zoom-out
}
```

**TimelineRange encapsulation**:
```typescript
interface TimelineRange {
  startBeat: number;
  endBeat: number;
  pixelWidth: number;
  beatToPixel(beat: number): number;
  pixelToBeat(px: number): number;
  beatsPerPixel: number;
}
```

**Extend Clip for looping**: Add `loopDuration?: number` and `loopOffset?: number` to enable looped clip rendering where visual length exceeds source content length.

---

## 3. Piano Roll & MIDI Editor

### Source Files (`$OPENDAW/`)
- `packages/app/studio/src/ui/timeline/editors/notes/pitch/PianoRoll.tsx` — Piano roll UI
- `packages/app/studio/src/ui/timeline/editors/notes/pitch/PitchEditor.tsx` — Pitch/note editor
- `packages/app/studio/src/ui/timeline/editors/notes/pitch/PitchPainter.ts` — Canvas note rendering
- `packages/app/studio/src/ui/timeline/editors/notes/pitch/PitchPositioner.ts` — Note position math
- `packages/app/studio/src/ui/timeline/editors/notes/NoteEditor.tsx` — Note editing container
- `packages/app/studio/src/ui/timeline/editors/notes/UINoteEvent.ts` — UI note event model
- `packages/app/studio/src/ui/piano-panel/PianoRoll.tsx` — Standalone piano keyboard panel

### openDAW Pattern
**Canvas rendering**: `CanvasPainter` class handles DPI scaling automatically — `canvas.width = clientWidth * devicePixelRatio`, then `ctx.scale(dpr, dpr)`. Separate painters for grid, notes, and selection overlays.

**NoteEvent fields**: `pitch` (0-127), `velocity` (0-1 float), `duration` (PPQN), `position` (PPQN), `centOffset` (microtonal detune), `chance` (0-100%, generative probability — note only plays X% of the time).

**Interaction modifiers** — separate stateful classes for each edit mode:
- `NoteCreateModifier` — click to place, drag to set duration
- `NoteMoveModifier` — drag to move pitch and position, with snap
- `NoteDurationModifier` — drag right edge to resize
- `SelectionRectangle` — rubber-band selection with enclosed-item detection

**Scale-aware positioning**: `ScaleConfig` + `PitchPositioner` map pitch to Y coordinate, optionally filtering to scale degrees.

**SVG piano keyboard**: Each key is an SVG `<rect>` with `data-key` attribute. Active notes during playback get highlighted class.

### ACE-Step-DAW Mapping
- `src/components/pianoroll/PianoRoll.tsx`, `PianoRollCanvas.tsx`, `PianoRollKeyboard.tsx`
- `MidiNote: { id, pitch, startBeat, durationBeats, velocity, isSlide? }`
- `VelocityLane.tsx` for velocity editing
- Constants: `PianoRollConstants.ts`

### How to Apply

**DPI-safe canvas rendering**:
```typescript
function setupCanvas(canvas: HTMLCanvasElement) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  return ctx;
}
```

**Note edit mode state machine**:
```typescript
type NoteEditMode = 'select' | 'draw' | 'move' | 'resize';
// Cursor at right 6px of note → 'resize'
// Cursor on note body → 'move' (or 'select' if not dragging)
// Cursor on empty space → 'draw' (when pencil tool active)
```

**Future extensions to MidiNote**:
- `centOffset?: number` — microtonal detune (-100 to +100 cents)
- `chance?: number` — 0-100, probability of note playing (generative music)
- `muted?: boolean` — per-note mute without deleting

**Selection rectangle**: Track `mousedown` origin + current mouse position. On release, find notes whose bounding box intersects the selection rect. Hold Shift for additive selection.

---

## 4. Mixer & Signal Routing

### Source Files (`$OPENDAW/`)
- `packages/studio/core/src/Mixer.ts` — Solo/mute logic, channel routing
- `packages/studio/core/src/Engine.ts` — Engine with mixer integration
- `packages/studio/core/src/project/audio/AudioContentModifier.ts` — Audio unit modifications
- `packages/app/studio/src/ui/timeline/tracks/audio-unit/AudioUnitTracks.tsx` — Audio unit track rendering
- `packages/app/studio/src/ui/timeline/tracks/audio-unit/headers/TrackHeader.tsx` — Track header (solo/mute)
- `packages/app/studio/src/ui/timeline/tracks/audio-unit/AudioUnitChannelControls.tsx` — Channel strip UI

### openDAW Pattern
**Hierarchical AudioUnits**: Each AudioUnit has an instrument slot, MIDI effect chain, audio effect chain, aux sends, and channel strip (volume, pan, mute, solo, meter). AudioBus groups multiple AudioUnits.

**Solo propagation** (`Mixer.ts`):
- **Explicit solo**: User clicks solo button
- **Virtual solo**: If a group/bus is soloed, all its children are audible even if not explicitly soloed
- **Rule**: If ANY channel is soloed, all non-soloed (and non-virtually-soloed) channels are silenced

**Aux sends**: `AuxSendProcessor` with pre/post fader option. Send level is a separate gain node tapped before (pre) or after (post) the channel strip volume.

**Topological sort** (`@opendaw/lib-dsp/graph.ts`): Audio units form a directed graph. Before processing, sort topologically to ensure sends are processed before their return buses. Detects feedback loops.

**Dynamic wiring**: `AudioDeviceChain` sets `#needsWiring = true` on effect add/remove/reorder. Actual Web Audio node reconnection happens lazily in `ProcessPhase.Before`, batching multiple changes.

### ACE-Step-DAW Mapping
- `src/components/mixer/MixerPanel.tsx`, `LevelMeter.tsx`, `EffectChain.tsx`
- Track: `volume`, `pan`, `muted`, `soloed`, `effects: TrackEffect[]`
- Engine: `AudioEngine.ts`, `TrackNode.ts`, `EffectsEngine.ts`
- Returns: `ReturnTrack[]` with `Send[]`
- Groups: `parentTrackId?`, `isGroup?`

### How to Apply

**Solo propagation algorithm**:
```typescript
function getAudibleTracks(tracks: Track[]): Set<string> {
  const anySoloed = tracks.some(t => t.soloed);
  if (!anySoloed) return new Set(tracks.filter(t => !t.muted).map(t => t.id));

  const audible = new Set<string>();
  const soloedIds = new Set(tracks.filter(t => t.soloed).map(t => t.id));

  for (const track of tracks) {
    if (track.muted) continue;
    if (soloedIds.has(track.id)) { audible.add(track.id); continue; }
    // Virtual solo: check if any ancestor group is soloed
    let parent = track.parentTrackId;
    while (parent) {
      if (soloedIds.has(parent)) { audible.add(track.id); break; }
      parent = tracks.find(t => t.id === parent)?.parentTrackId;
    }
  }
  return audible;
}
```

**Pre/post fader sends**: Extend `Send` interface:
```typescript
interface Send {
  returnTrackId: string;
  amount: number; // 0-1
  preFader?: boolean; // tap before volume/pan if true
}
```

**dB display**:
```typescript
const toDB = (v: number) => v === 0 ? -Infinity : 20 * Math.log10(v);
const fromDB = (dB: number) => dB === -Infinity ? 0 : Math.pow(10, dB / 20);
const formatDB = (dB: number) => dB === -Infinity ? '-inf' : `${dB.toFixed(1)} dB`;
```

---

## 5. Interaction Design Patterns

### Source Files (`$OPENDAW/`)
- `packages/app/studio/src/ui/DragAndDrop.ts` — Two-phase DnD system
- `packages/app/studio/src/ui/Cursors.ts` — Cursor state management
- `packages/app/studio/src/ui/wrapper/RelativeUnitValueDragging.tsx` — Value dragging with pointer lock
- `packages/app/studio/src/ui/timeline/tracks/audio-unit/clips/ClipDragAndDrop.ts` — Clip drag mechanics
- `packages/app/studio/src/ui/timeline/tracks/audio-unit/regions/RegionDragAndDrop.ts` — Region drag
- `packages/app/studio/src/ui/timeline/editors/notes/pitch/PitchEventCapturing.ts` — Note drag capture
- `packages/app/studio/src/ui/timeline/editors/value/ValueEventCapturing.ts` — Automation drag capture

### openDAW Pattern

**Two-phase drag-and-drop** (`DragAndDrop.ts`):
1. `installSource(element, config)` — makes element draggable, provides drag data
2. `installTarget(element, config)` — registers drop zone, defines `enter()`, `leave()`, `drop()` handlers
3. Alt key during drag = **copy** instead of move
4. `data-drag` attributes on elements for programmatic drop-point detection
5. `findInsertLocation()` calculates cursor-relative insertion index

**Value dragging** (`hooks/dragging.ts`):
- **Pointer lock**: `element.requestPointerLock()` on mousedown, prevents cursor hitting screen edge
- **Shift**: Toggle value guide (snap to nice values like 0, 0.25, 0.5, 0.75, 1)
- **Alt**: Fine control — multiply mouse delta by 0.25x
- **Default ratio**: 1.5x (pixels to value units)
- **Double-click**: Reset to default value
- **Right-click**: Open text input for exact value entry
- **Scroll wheel**: Fine increment/decrement with debounce

**Auto-scroll**: During drag, if mouse is within 16px of container edge, scroll in that direction at 0.25x speed per animation frame.

**Ghost preview**: Render semi-transparent (opacity 0.4) clone at the snap-to position during drag, before drop.

**Selection rectangle** (`SelectionRectangle.tsx`): SVG overlay tracking mousedown origin → current mouse position. On release, collect all items whose bounding boxes are **fully enclosed** in the rectangle.

**Custom cursors**: SVG cursor images with hotspot coordinates for modes — pencil, scissors, resize handles, loop start/end markers.

### ACE-Step-DAW Mapping
- CLAUDE.md specifies these patterns as standards (snap-to-grid, ghost preview, cross-track drag, etc.)
- `data-track-id`, `data-clip-id` attributes required on all drag targets

### How to Apply

**Pointer lock for knobs/sliders**:
```typescript
const onPointerDown = (e: React.PointerEvent) => {
  e.currentTarget.requestPointerLock();
  const startValue = value;
  let cumDelta = 0;

  const onMove = (e: MouseEvent) => {
    const sensitivity = e.altKey ? 0.25 : 1.0; // Alt = fine control
    cumDelta += -e.movementY * sensitivity; // UP = increase
    const newValue = clamp(startValue + cumDelta * 0.005, 0, 1);
    onChange(newValue);
  };

  const onUp = () => {
    document.exitPointerLock();
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  };

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
};
```

**Auto-scroll during drag**:
```typescript
function autoScroll(container: HTMLElement, mouseY: number) {
  const rect = container.getBoundingClientRect();
  const padding = 40; // px from edge
  const speed = 4; // px per frame

  if (mouseY < rect.top + padding) {
    container.scrollTop -= speed;
  } else if (mouseY > rect.bottom - padding) {
    container.scrollTop += speed;
  }
}
```

**Ghost preview**: During drag, render a fixed-position div at the snapped location:
```tsx
{isDragging && (
  <div
    className="absolute pointer-events-none opacity-40 border border-blue-400 bg-blue-400/20 rounded"
    style={{ left: snapX, top: snapY, width: ghostWidth, height: ghostHeight }}
  />
)}
```

---

## 6. Control Components (Knobs, Sliders, Meters)

### Source Files (`$OPENDAW/`)
- `packages/app/studio/src/ui/components/Knob.tsx` — Rotary knob control
- `packages/app/studio/src/ui/components/VolumeSlider.tsx` — Volume slider with dB marks
- `packages/app/studio/src/ui/components/PeakMeter.tsx` — Peak meter base
- `packages/app/studio/src/ui/components/HorizontalPeakMeter.tsx` — Horizontal peak meter
- `packages/app/studio/src/ui/components/Button.tsx` — Base button component
- `packages/app/studio/src/ui/components/NumberInput.tsx` — Numeric input field
- `packages/app/studio/src/ui/composite/LabelKnob.tsx` — Labeled knob composite

### openDAW Pattern
**Knob**: SVG-based with configurable arc (270 degrees default). Value change via vertical mouse drag with pointer lock. Visual: filled arc from min to current value.

**VolumeSlider**: Vertical orientation. dB tick marks at: -inf, -48, -24, -12, -6, 0, +6. Thumb position maps logarithmically.

**PeakMeter**: Dual-channel (L/R) SVG with linear gradient:
- Green: below -12 dB
- Yellow: -12 dB to -6 dB
- Red: above -6 dB
- Peak hold indicator: holds peak for 2 seconds, then decays

**ValueMapping abstraction**: Every control uses a mapping between unit value [0,1] and display value:
```typescript
interface ValueMapping {
  unitToDisplay(unit: number): number;
  displayToUnit(display: number): number;
  format(display: number): string;
  isFloating(): boolean; // smooth vs stepped
}
```

**Universal control behaviors**: ALL controls share:
- Double-click → reset to default
- Right-click → open text input for precise value
- Scroll wheel → fine adjustment
- Pointer lock on drag

### ACE-Step-DAW Mapping
- `src/components/controls/` — control components
- `src/components/mixer/LevelMeter.tsx` — peak meter

### How to Apply

**ValueMapping implementations**:
```typescript
// Volume: 0-1 → dB scale
const volumeMapping: ValueMapping = {
  unitToDisplay: (u) => u === 0 ? -Infinity : 20 * Math.log10(u),
  displayToUnit: (dB) => dB === -Infinity ? 0 : Math.pow(10, dB / 20),
  format: (dB) => dB === -Infinity ? '-inf dB' : `${dB.toFixed(1)} dB`,
};

// Pan: 0-1 → -1 to +1 display
const panMapping: ValueMapping = {
  unitToDisplay: (u) => u * 2 - 1,
  displayToUnit: (d) => (d + 1) / 2,
  format: (d) => d === 0 ? 'C' : d < 0 ? `L${Math.abs(Math.round(d * 100))}` : `R${Math.round(d * 100)}`,
};

// Frequency: 0-1 → 20Hz-20kHz (logarithmic)
const freqMapping: ValueMapping = {
  unitToDisplay: (u) => 20 * Math.pow(1000, u),
  displayToUnit: (f) => Math.log(f / 20) / Math.log(1000),
  format: (f) => f >= 1000 ? `${(f / 1000).toFixed(1)} kHz` : `${Math.round(f)} Hz`,
};
```

**All numeric displays**: Add `tabular-nums` class (Tailwind: `font-[tabular-nums]` or `font-variant-numeric: tabular-nums`) for aligned digits.

**PeakMeter gradient stops**: `[{offset: 0%, color: #22c55e}, {offset: 75%, color: #eab308}, {offset: 90%, color: #ef4444}]`

---

## 7. Automation System

### Source Files (`$OPENDAW/`)
- `packages/studio/core/src/capture/RecordAutomation.ts` — Automation recording logic
- `packages/app/studio/src/ui/timeline/editors/value/ValueEventsEditor.tsx` — Curve editor UI
- `packages/app/studio/src/ui/timeline/editors/value/ValueEventEditing.ts` — Value event operations
- `packages/app/studio/src/ui/timeline/editors/value/ValuePainter.ts` — Automation curve rendering
- `packages/app/studio/src/ui/timeline/editors/value/ValueModifier.ts` — Value event modification
- `packages/app/studio/src/ui/timeline/editors/value/ValueMoveModifier.ts` — Point move operations
- `packages/app/studio/src/ui/timeline/editors/value/ValueModifyStrategies.ts` — Edit strategies

### openDAW Pattern
**Data model**: `ValueRegion` contains `ValueEventCollection` — an ordered list of `{position, value, interpolation}` events. Two interpolation modes: `None` (step function) and `Linear`.

**Real-time recording** (`RecordAutomation.ts`):
1. Listen to `ParameterWriteEvent` containing previous and new unit values
2. Create `ValueRegion` at quantized position (1/16th note grid)
3. Append `ValueEvent` for each parameter change
4. On loop boundary: finalize current region, start new region at loop start
5. **Point simplification**: After recording, remove redundant points where deviation from line-between-neighbors is < epsilon (0.01)

**AutomatableParameter**: Stores unit value [0,1] internally. Maps to device-specific range at the engine level. `isFloating()` determines if automation should use Linear (smooth) or None (stepped) interpolation.

### ACE-Step-DAW Mapping
- `AutomationLane`, `AutomationPoint` in `src/types/project.ts`
- `AutomationEngine.ts` uses requestAnimationFrame loop
- `AutomationLaneView.tsx` for visual editing

### How to Apply

**Point simplification (Ramer-Douglas-Peucker lite)**:
```typescript
function simplifyAutomation(points: AutomationPoint[], epsilon = 0.01): AutomationPoint[] {
  if (points.length <= 2) return points;
  const result = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = result[result.length - 1];
    const next = points[i + 1];
    // Linear interpolation at current point's time
    const t = (points[i].time - prev.time) / (next.time - prev.time);
    const expected = prev.value + t * (next.value - prev.value);
    if (Math.abs(points[i].value - expected) > epsilon) {
      result.push(points[i]);
    }
  }
  result.push(points[points.length - 1]);
  return result;
}
```

**Automation recording modes** (standard DAW modes to consider):
- **Touch**: Write while parameter is being touched; release returns to existing curve
- **Latch**: Like Touch, but holds last written value after release
- **Write**: Overwrite entire pass — destructive

**All automatable parameters normalize to [0,1]** internally. Use `ValueMapping` (Section 6) for display.

---

## 8. Transport & Playback Engine

### Source Files (`$OPENDAW/`)
- `packages/studio/core/src/Engine.ts` — Core playback engine interface
- `packages/studio/core/src/EngineWorklet.ts` — Audio worklet for real-time processing
- `packages/studio/core/src/RenderQuantum.ts` — Audio buffer quantum renderer
- `packages/studio/core/src/OfflineEngineRenderer.ts` — Offline bounce/export
- `packages/studio/core/src/HRClockWorker.ts` — High-resolution clock
- `packages/lib/dsp/src/bpm-tools.ts` — BPM and tempo utilities
- `packages/app/studio/src/service/StudioService.ts` — High-level playback control

### openDAW Pattern
**Engine facade** (`EngineFacade.ts`): Clean API on main thread that sends commands to AudioWorklet via `MessagePort`. Methods: `play()`, `stop()`, `setPosition(ppqn)`, `record()`. Observable values: `position`, `isPlaying`, `isRecording`, `cpuLoad`.

**Two-process architecture**:
- **Main thread**: UI rendering, state management, sample loading, MIDI device I/O
- **Audio worklet** (`EngineProcessor.ts`): Real-time audio processing in 128-sample quantums. Receives commands via MessagePort. Sends state updates back via `SyncStream` (circular buffer in SharedArrayBuffer).

**BlockRenderer**: Processes one render quantum at a time. Handles:
- Tempo changes via automation track
- Loop boundary detection (position wrap)
- Marker tracking
- Deferred callbacks at specific PPQN positions

**Loop handling**: On each block, check `if (position >= loopEnd && loopEnabled)` → wrap to `loopStart + (position - loopEnd)`.

**Count-in**: Schedule N metronome clicks before playback starts. Engine reports `countInBeatsRemaining` as observable.

**MIDI transport clock**: `MIDITransportClock` generates MIDI clock messages (24 ppqn) for external sync.

### ACE-Step-DAW Mapping
- `src/store/transportStore.ts` — transport state
- `src/engine/AudioEngine.ts` — uses Tone.js (`Tone.Transport`)
- No audio worklet separation currently

### How to Apply

**Engine facade pattern**: Wrap Tone.js in a controller:
```typescript
class TransportController {
  play() { Tone.Transport.start(); }
  stop() { Tone.Transport.stop(); Tone.Transport.position = 0; }
  pause() { Tone.Transport.pause(); }
  seek(beat: number) { Tone.Transport.seconds = beat * 60 / this.bpm; }
  get positionBeats() { return Tone.Transport.seconds * this.bpm / 60; }
}
```

**Loop handling in scheduling**:
```typescript
Tone.Transport.loop = true;
Tone.Transport.loopStart = beatsToSeconds(loopStart);
Tone.Transport.loopEnd = beatsToSeconds(loopEnd);
```

**Count-in**: Schedule metronome clicks at negative time (before position 0), offset actual playback start:
```typescript
function startWithCountIn(beats: number, bpm: number) {
  const countInDuration = beats * 60 / bpm;
  // Play metronome clicks during count-in
  for (let i = 0; i < beats; i++) {
    Tone.Transport.schedule((time) => metronomeClick(time), i * 60 / bpm);
  }
  // Actual playback starts after count-in
  Tone.Transport.start(`+${countInDuration}`);
}
```

**Future consideration**: AudioWorklet for custom DSP (synthesis, effects) to avoid main-thread jank during complex processing.

---

## 9. Recording System

### Source Files (`$OPENDAW/`)
- `packages/studio/core/src/capture/Capture.ts` — Main capture coordinator
- `packages/studio/core/src/capture/RecordAudio.ts` — Audio recording implementation
- `packages/studio/core/src/capture/RecordMidi.ts` — MIDI recording (note-on/off tracking)
- `packages/studio/core/src/capture/RecordTrack.ts` — Track-level recording management
- `packages/studio/core/src/capture/CaptureAudio.ts` — Audio capture device handling
- `packages/studio/core/src/capture/CaptureMidi.ts` — MIDI device capture setup
- `packages/studio/core/src/RecordingWorklet.ts` — Audio worklet for recording

### openDAW Pattern
**Audio recording** (`RecordAudio.ts`):
- Pre-allocate circular buffer sized to maximum expected recording length
- Write pointer wraps at buffer boundary
- Apply 10ms fadeout at recording stop to prevent clicks
- **Take management**: Each loop pass creates a new take (buffer segment)
- On stop, create `AudioRegionBox` referencing captured audio

**MIDI recording** (`RecordMidi.ts`):
- Track active notes: `Map<pitch, NoteEventBox>` for pending note-on events
- On note-on: create `NoteEventBox` with position, store in active map
- On note-off: look up active note, set duration = currentPosition - noteStartPosition
- **On stop/loop boundary**: Force note-off for ALL active notes (prevents stuck notes)
- Loop-aware: Finalize current take at loop boundary, start new take

**Automation recording** (`RecordAutomation.ts`):
- Listen to parameter write events
- Create `ValueRegion` at quantized position
- Append value events with timestamp
- Simplify after recording (remove redundant points)

### ACE-Step-DAW Mapping
- `src/engine/RecordingEngine.ts`
- Takes: `Take[]` on `Clip`, `showTakeLanes` on `Track`
- `TakeLaneStrip.tsx` in timeline

### How to Apply

**MIDI stuck-note prevention**:
```typescript
class MidiRecorder {
  private activeNotes = new Map<number, { noteId: string; startBeat: number }>();

  onNoteOn(pitch: number, velocity: number, beat: number) {
    this.activeNotes.set(pitch, { noteId: generateId(), startBeat: beat });
  }

  onNoteOff(pitch: number, beat: number) {
    const active = this.activeNotes.get(pitch);
    if (!active) return;
    this.activeNotes.delete(pitch);
    return { ...active, pitch, durationBeats: beat - active.startBeat, velocity: 0.8 };
  }

  forceAllNotesOff(beat: number): MidiNote[] {
    const notes: MidiNote[] = [];
    for (const [pitch, active] of this.activeNotes) {
      notes.push({ ...active, pitch, durationBeats: beat - active.startBeat, velocity: 0.8 });
    }
    this.activeNotes.clear();
    return notes;
  }
}
```

**Take management on loop pass**:
```typescript
// On loop boundary:
// 1. Freeze current buffer as a take
// 2. Start fresh buffer for next pass
function onLoopBoundary(clip: Clip, currentTake: MidiNote[]) {
  clip.takes.push({ id: generateId(), notes: currentTake });
  return []; // fresh buffer for next take
}
```

**Audio fadeout at boundary**: Apply 10ms linear gain ramp from 1.0 to 0.0 at recording stop point.

---

## 10. DAWProject Format (Shared Protocol)

### Source Files (`$OPENDAW/`)
- `packages/studio/core/src/dawproject/DawProject.ts` — DAWProject encode/decode
- `packages/studio/core/src/dawproject/DawProjectExporter.ts` — Export to DAWProject format
- `packages/studio/core/src/dawproject/DawProjectImporter.ts` — Import from DAWProject format
- `packages/studio/core/src/dawproject/DawProjectService.ts` — High-level DAWProject service
- `packages/lib/dawproject/src/defaults.ts` — Default schema values
- `packages/lib/dawproject/src/utils.ts` — DAWProject utilities
- `packages/lib/xml/src/index.ts` — XML parsing/serialization

### openDAW Pattern
**ZIP-based bundle** (`@opendaw/lib-dawproject`):
```
project.dawproject (ZIP)
├── metadata.xml    — BPM, time signature, markers, project info
├── project.xml     — Full track/clip/device structure
└── resources/      — Audio files, soundfonts, other media
```

**Schema validation**: Uses Zod schemas to validate imported XML structure before hydrating the box graph. Safe import with graceful error reporting.

**Cross-DAW interop**: DAWProject is an open standard supported by Bitwig, PreSonus Studio One, and others. Enables round-trip between DAWs.

**Metadata fields**: Project name, author, BPM (constant or tempo automation track), time signatures, markers with names and positions.

### ACE-Step-DAW Mapping
- `Project` interface in `src/types/project.ts`
- `TempoEvent[]`, `TimeSignatureEvent[]`, `Marker[]`
- `src/services/projectStorage.ts` — IndexedDB storage

### How to Apply

**Zod validation on project load**:
```typescript
import { z } from 'zod';

const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  bpm: z.number().min(20).max(999),
  tracks: z.array(TrackSchema),
  clips: z.array(ClipSchema),
  // ... etc
});

function loadProject(data: unknown): Project {
  return ProjectSchema.parse(data); // throws on invalid
}
```

**Future DAWProject export**: Bundle project JSON + audio blobs from IndexedDB into a downloadable `.dawproject` ZIP using JSZip. This enables interop with desktop DAWs.

---

## 11. Plugin/Device Architecture

### Source Files (`$OPENDAW/`)
- `packages/studio/core/src/EffectFactory.ts` — Effect plugin instantiation
- `packages/studio/core/src/EffectFactories.ts` — Multiple effect factory implementations
- `packages/studio/core/src/EffectBox.ts` — Effect box abstraction
- `packages/studio/core/src/AudioUnitFreeze.ts` — Effect freezing for CPU optimization
- `packages/studio/core/src/EffectParameterDefaults.ts` — Built-in effect parameter defaults
- `packages/lib/box/src/field.ts` — Field definitions for device parameters
- `packages/app/studio/src/ui/defaults/DefaultInstrumentFactory.ts` — Default instrument creation

### openDAW Pattern
**Unified device system**: All instruments, audio effects, and MIDI effects are "devices" with a common interface. Each has a `DeviceBox` in the project graph and a `DeviceProcessor` in the audio worklet.

**Built-in instruments**:
- **Vaporisateur**: Subtractive synth (oscillators, filter, envelopes, LFO)
- **Playfield**: Drum machine (per-pad samples, per-pad effects)
- **Nano**: Single-sample sampler with time-stretch/pitch
- **Soundfont**: SF2 player

**Built-in audio effects**: Delay, Reverb (Dattorro), Crusher, EQ (Revamp), Fold (wavefolder), Compressor (CTAG DRC), Stereo Tool

**Built-in MIDI effects**: Arpeggio, Pitch (transpose), Velocity (modify)

**AutomatableParameter**: Every device parameter stores unit value [0,1]. The device descriptor maps to real range. `isFloating()` determines smooth vs stepped automation.

**Device chain**: Ordered list. Drag to reorder. Each device has bypass toggle. Chain applies input → device1 → device2 → ... → output.

### ACE-Step-DAW Mapping
- `TrackEffect` discriminated union, `MidiEffect` union in `src/types/project.ts`
- `EffectsEngine.ts`, `SynthEngine.ts`, `DrumEngine.ts`, `SamplerEngine.ts`
- VST3: `PluginEngine.ts`, `PluginRegistry.ts`, `vst3Store.ts`

### How to Apply

**Unified device descriptor**:
```typescript
interface DeviceDescriptor {
  id: string;
  name: string;
  type: 'instrument' | 'audioEffect' | 'midiEffect';
  parameters: ParameterDescriptor[];
}

interface ParameterDescriptor {
  id: string;
  name: string;
  defaultValue: number; // unit [0,1]
  mapping: ValueMapping;
  automatable: boolean;
}
```

**All device params stored as [0,1]**, mapped to real range by descriptor. This simplifies automation (always record/play 0-1 values) and UI (controls always work in 0-1 space).

**Consider WAM (Web Audio Modules)** standard for third-party plugin interop alongside VST3.

---

## 12. Layout & Workspace

### Source Files (`$OPENDAW/`)
- `packages/app/studio/src/ui/workspace/WorkspaceBuilder.tsx` — Dynamic layout builder
- `packages/app/studio/src/ui/workspace/PanelResizer.tsx` — Panel resize drag handle
- `packages/app/studio/src/ui/workspace/PanelContents.tsx` — Panel content rendering
- `packages/app/studio/src/ui/workspace/Workspace.ts` — Workspace state model
- `packages/app/studio/src/ui/workspace/PanelFactory.tsx` — Panel creation factory
- `packages/app/studio/src/ui/workspace/ContentGlue.ts` — Layout glue logic

### openDAW Pattern
**Workspace hierarchy**: `Workspace > Screen > Content > Panel`. Each panel has a `PanelType` determining its content and a `PanelState` for persistence.

**PanelResizer**: Drag handle between adjacent panels. On drag, adjusts sibling flex ratios while clamping to `minSize`/`maxSize` constraints. CSS flexbox-based layout.

**Orientation**: Each split can be horizontal or vertical.

**Styling**:
- CSS custom properties: `--color-panel-background`, `--color-gray`, `--color-bright`, etc.
- Dark color scheme as default
- `font-variant-numeric: tabular-nums` on all numeric displays
- `image-rendering: pixelated` on canvases for crisp integer scaling
- `touch-action: pan-x pan-y` for mobile support
- No user-select by default (DAWs are not documents)

**Mixins** (reusable patterns):
- `controllable` — blue dashed outline on automatable parameters
- `dragging` — 10% opacity on dragged source
- `floating` — flyout panels with backdrop blur
- `unit-type-colors` — green (audio), purple (MIDI), orange (automation), blue (bus)

### ACE-Step-DAW Mapping
- `src/components/layout/` — layout components
- Tailwind CSS v4 for styling

### How to Apply

**Panel resizer pattern**:
```typescript
function PanelResizer({ onResize }: { onResize: (delta: number) => void }) {
  return (
    <div
      className="w-1 cursor-col-resize hover:bg-blue-500/50 active:bg-blue-500"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        const startX = e.clientX;
        const onMove = (e: PointerEvent) => onResize(e.clientX - startX);
        const onUp = () => {
          document.removeEventListener('pointermove', onMove);
          document.removeEventListener('pointerup', onUp);
        };
        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
      }}
    />
  );
}
```

**Track type colors** (Tailwind classes):
- Audio/stems: `text-green-400 bg-green-400/20`
- MIDI/pianoRoll: `text-purple-400 bg-purple-400/20`
- Automation: `text-orange-400 bg-orange-400/20`
- Bus/group: `text-blue-400 bg-blue-400/20`
- Sequencer/drums: `text-yellow-400 bg-yellow-400/20`

**Global CSS resets for DAW**:
```css
* { user-select: none; }
input, textarea { user-select: text; }
canvas { image-rendering: pixelated; }
```

---

## 13. Keyboard Shortcuts & Modifiers

### Source Files (`$OPENDAW/`)
- `packages/app/studio/src/ui/shortcuts/GlobalShortcuts.ts` — Global keyboard shortcuts
- `packages/app/studio/src/ui/shortcuts/CommonShortcuts.ts` — Common/shared shortcuts
- `packages/app/studio/src/ui/shortcuts/ContentEditorShortcuts.ts` — Timeline editor shortcuts
- `packages/app/studio/src/ui/shortcuts/NoteEditorShortcuts.ts` — Note editor shortcuts
- `packages/app/studio/src/ui/shortcuts/PianoPanelShortcuts.ts` — Piano panel shortcuts
- `packages/app/studio/src/service/StudioShortcutManager.ts` — Shortcut manager service

### openDAW Pattern
**Priority-based dispatch**: Global key listener with priority ordering: focused element > panel shortcuts > global shortcuts. Escape blurs active element.

**Standard shortcuts** (`GlobalShortcuts.ts`):
| Key | Action |
|-----|--------|
| Space | Play / Pause |
| . (period) | Stop (return to start) |
| R | Toggle record |
| Ctrl+Z | Undo |
| Ctrl+Shift+Z | Redo |
| Shift+D | Toggle device panel |
| Shift+E | Toggle editor panel |
| Ctrl+K | Toggle keyboard |
| F | Toggle follow cursor |

**Modifier conventions**:
| Modifier | Meaning |
|----------|---------|
| Cmd/Ctrl | Primary action |
| Shift | Additive / extend selection |
| Alt | Bypass snap / free mode / fine control |
| Cmd+Shift | Alternative variant |

### ACE-Step-DAW Mapping
- `src/store/shortcutsStore.ts`, `src/types/shortcuts.ts`
- `KeyboardShortcutsDialog.tsx` — conflict checker

### How to Apply

**Always check `KeyboardShortcutsDialog.tsx` before adding new shortcuts** — prevent conflicts.

**Priority dispatch**: Transport shortcuts (Space, Enter) work regardless of focus unless a text input is focused:
```typescript
if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
  return; // don't intercept typing
}
```

**Modifier consistency**: Follow the table above for ALL new interactions. If a feature has a mouse action, document the modifier convention.

---

## 14. Key Design Principles Summary

### Source Files (`$OPENDAW/`)
- `packages/lib/std/src/observables.ts` — Observable value pattern
- `packages/lib/std/src/option.ts` — Option monad (null safety)
- `packages/lib/std/src/listeners.ts` — Event listener management
- `packages/lib/std/src/notifier.ts` — Notification system
- `packages/lib/std/src/terminable.ts` — Resource lifecycle (Terminator)
- `packages/lib/std/src/lang.ts` — Language extensions and utilities
- `packages/lib/dsp/src/graph.ts` — Topological sort for signal routing

Quick-reference checklist when building any DAW feature:

| Principle | openDAW Approach | ACE-Step-DAW Equivalent |
|-----------|-----------------|------------------------|
| **Atomic undo** | Transaction-based box editing | Batch mutations in single `_pushHistory()` |
| **Reactive state** | Observable/subscription pattern | Zustand selectors + `useEffect` |
| **Resource cleanup** | Lifecycle/Terminator hierarchy | React `useEffect` cleanup returns |
| **Lazy init** | `@Lazy` decorator, deferred creation | `React.lazy()`, dynamic imports |
| **Null safety** | `Option<T>` / `Result<T>` monads | Strict null checks, `??`, `?.` |
| **Subsystem facades** | `EngineFacade` wraps worklet | Controller classes wrap Tone.js/IndexedDB |
| **Data→UI adapters** | BoxAdapter layer | Custom hooks as adapters |
| **Signal routing** | Topological sort for audio graph | Sort before connecting Tone.js nodes |
| **Two-phase DnD** | Source registration + target registration | Drag context + drop zone components |
| **Sub-beat precision** | PPQN (960 per quarter) | Consider for advanced MIDI features |
| **All params [0,1]** | Unit value + ValueMapping | Normalize, map at display/engine layer |
| **Canvas DPI** | `devicePixelRatio` scaling | Always scale canvas for Retina |
| **Pointer lock** | On all drag-value controls | Knobs, sliders, timeline scrub |
| **Double-click reset** | Universal on all controls | Every adjustable value |
| **Keyboard-first** | Every mouse action has key equivalent | Check shortcut registry before adding |

---

## Quick Reference: openDAW Package Map

| Package | Purpose | Our Equivalent |
|---------|---------|---------------|
| `lib-box` | Graph data model, serialization | Zustand store + types |
| `lib-dsp` | PPQN, tempo map, audio math, topo sort | `src/utils/`, Tone.js |
| `lib-dom` | DOM utilities, animation frames | React hooks |
| `lib-jsx` | Custom JSX rendering | React 19 |
| `lib-midi` | MIDI data structures, SMF I/O | Tone.js MIDI, WebMIDI |
| `lib-runtime` | Worker/worklet communication | Future AudioWorklet |
| `lib-xml` | XML parsing (DAWProject) | Future DAWProject export |
| `studio-core` | Engine, Project, Mixer | `AudioEngine.ts`, stores |
| `studio-boxes` | Box schemas (Track, Region, Device) | `src/types/project.ts` |
| `studio-adapters` | Box → adapter layer | Custom hooks |
| `studio-core-processors` | Audio worklet processors | `src/engine/*.ts` |
| `app-studio` | Web UI | `src/components/` |

---

## When to Reference This Skill

Use `/refer_opendaw_design` when:
- Building a new timeline/arrangement feature → Sections 2, 5
- Implementing or improving the piano roll → Section 3
- Working on the mixer or audio routing → Section 4
- Adding/improving any interactive control → Sections 5, 6
- Implementing automation → Section 7
- Working on transport/playback/recording → Sections 8, 9
- Adding plugin/device support → Section 11
- Designing layout/panels → Section 12
- Adding keyboard shortcuts → Section 13
- Making any architectural decision → Sections 1, 14
