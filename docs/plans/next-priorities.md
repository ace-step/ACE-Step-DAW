# ACE-Step DAW — Next Priorities

> Analysis-only. Top 5 highest-value improvements that work fully offline/locally.
> Ranked by overall value (user impact × feasibility).

---

## Priority 1: Wire Up the Record Button (Audio Recording)

### Problem
`RecordingEngine` (`src/engine/RecordingEngine.ts`) is a fully-implemented, production-quality engine:
- Microphone permission flow
- Multi-track recording sessions
- Real-time waveform capture
- Count-in with metronome clicks
- Input-level metering
- Device selection

But the Record button in `Toolbar.tsx` is literally a disabled placeholder:

```tsx
{/* Record placeholder */}
<ControlBarButton onClick={() => {}} title="Record (R)" disabled>
  <div className="w-3.5 h-3.5 rounded-full bg-red-500 opacity-60" />
</ControlBarButton>
```

`recordingEngine` is exported as a singleton but **never imported anywhere except its own file**. The entire recording system is built but completely dark — no UI, no integration with transport, no clip creation.

### What's Missing
1. A `useRecording` hook wiring `recordingEngine` to transport play/stop
2. Track "arm" (record-enable) button in `TrackHeader.tsx`
3. Enable the Record button in `Toolbar.tsx` to toggle record-ready state
4. On stop, call `recordingEngine.stopAllRecordings()`, encode to WAV (via existing `wav.ts` util), store via `audioFileManager`, and call `addClip()` + `updateClipStatus('ready')`
5. Optionally: a live waveform preview while recording (RecordingEngine already provides `getRecordingWaveform()`)

### User Impact: **HIGH**
Recording audio is a fundamental DAW workflow. A fully-built engine sitting idle is wasted value. Users with microphones, line inputs, or re-amping setups are completely blocked right now.

### Complexity: **Medium**
The hard part (RecordingEngine) is done. This is plumbing work:
- Hook: ~80 lines
- Track arm UI: ~20 lines per track header
- Toolbar integration: ~30 lines
- Clip creation on stop: ~50 lines

### Files to Touch
- `src/components/layout/Toolbar.tsx` — enable record button
- `src/components/tracks/TrackHeader.tsx` — add arm (record-enable) button
- `src/hooks/useRecording.ts` *(new)* — glue RecordingEngine ↔ transport ↔ store
- `src/hooks/useTransport.ts` — trigger recording sessions on play-while-armed
- `src/store/uiStore.ts` — `recordArmedTracks: Set<string>` state

---

## Priority 2: Mix Effects Not Applied to WAV Export

### Problem
The export pipeline (`src/engine/exportMix.ts` and `src/components/dialogs/ExportDialog.tsx`) renders a bare mix with **no per-track effects applied**:

```ts
// exportMix.ts — just gain nodes, nothing else
const gain = offlineCtx.createGain();
gain.gain.value = clip.volume;
source.connect(gain);
gain.connect(offlineCtx.destination);
```

Meanwhile users can set per-track:
- Pan
- 3-band EQ (`eqLowGain`, `eqMidGain`, `eqHighGain`)
- Compressor
- Reverb/room size
- The full `TrackEffect` chain (EQ3, compressor, reverb, delay, distortion, filter) via `EffectChain.tsx` + `EffectsEngine`

None of this appears in the exported WAV. The live playback (via `TrackNode`) does apply effects — so there's a jarring gap between what users hear during playback and what they get when they export.

### What's Missing
The `exportMixToWav()` function needs to:
1. Create a `TrackNode`-equivalent signal chain per track inside the `OfflineAudioContext`
2. Apply pan, EQ gains (as `BiquadFilterNode`), compressor (as `DynamicsCompressorNode`), and reverb (as `ConvolverNode`) — mirroring `TrackNode`'s signal chain
3. Apply the `track.effects[]` array (mirror `EffectsEngine.rebuildChain` logic inside offline ctx — this is harder because `EffectsEngine` uses Tone.js nodes which don't run in native `OfflineAudioContext`)

The minimal high-value fix (covers most users): apply pan + EQ + compressor + basic reverb in the offline render, using native Web Audio nodes (matching `TrackNode.ts`'s existing logic).

### User Impact: **HIGH**
Every user who exports will get a worse result than what they heard. Pan and EQ differences are very audible. This is a professional-credibility issue.

### Complexity: **Medium**
`TrackNode.ts` already contains the full signal chain with native Web Audio nodes. The export just needs to re-instantiate equivalent nodes inside an `OfflineAudioContext`. The trickier part is the `track.effects[]` array (Tone.js-based), but that can be deferred or handled separately.

### Files to Touch
- `src/engine/exportMix.ts` — rebuild signal chain per-track in offline context
- `src/components/dialogs/ExportDialog.tsx` — pass full `Track[]` to export fn
- `src/engine/TrackNode.ts` — potentially extract a factory fn usable in offline ctx

---

## Priority 3: Piano Roll — Quantize & Select-All Polish

### Problem
The Piano Roll (`src/components/pianoroll/PianoRoll.tsx`, 919 lines) is largely functional but missing two high-frequency editing operations:

**A) Quantize**  
No "Quantize to Grid" button. Users must manually snap every note. `snapBeat()` already implements the grid-snap math; it's just not exposed as a batch operation.

**B) Select All (Ctrl+A) is blocked**  
Ctrl+A is wired (`// Ctrl+A = select all` at line 714), but the implementation selects notes fine yet **has no visual distinction between "note selected" and "note not selected"** in the canvas draw loop. Selection state exists (`selectedNoteIds: Set<string>`) but isn't always clearly rendered.

**C) Delete selected notes**  
There's no "Delete/Backspace to remove selected notes" handler for bulk deletion.

**D) Transpose selected (Shift+Up/Down)**  
No keyboard shortcut for transposing selected notes by semitone — a standard feature in every DAW piano roll.

### What's Missing
1. A "Quantize" button in the PianoRoll toolbar that snaps all selected (or all) note start times to the current grid
2. Visual highlight for selected notes in canvas draw loop (different fill color)
3. Backspace/Delete handler to remove selected notes in batch
4. Shift+Up/Down to transpose selected notes by ±1 semitone (±12 for octave)

### User Impact: **HIGH**
These are daily-use operations. Any composer using the piano roll hits these missing features immediately. Quantize is especially critical for the target use case (AI-generated music correction).

### Complexity: **Low-Medium**
All the building blocks exist:
- `snapBeat()` for quantize math
- `selectedNoteIds` state for batch ops
- `updateMidiNote` / `removeMidiNote` store actions
- Canvas draw loop for rendering changes

Estimate: ~100–150 lines total spread across toolbar UI + keyboard handlers + canvas render.

### Files to Touch
- `src/components/pianoroll/PianoRoll.tsx` — quantize btn, keyboard handlers, canvas selection rendering

---

## Priority 4: Project Archive (.acedaw) Import — Complete the Round-Trip

### Problem
`projectStorage.ts` has a complete `exportProjectArchive()` function that packs the project + all audio blobs into a binary `.acedaw` file. But **`importProjectArchive()` is not wired to any UI**.

```ts
// projectStorage.ts — these exist but are UI-orphaned:
export async function exportProjectArchive(project: Project): Promise<void>
export async function importProjectArchive(file: File): Promise<Project>
```

The `ProjectListDialog.tsx` has an "Export Archive" button but no "Import Archive" button. The feature is ~80% done but users have no way to import `.acedaw` files — making the export feature less useful (you can make a backup you can never restore).

Also: the export currently triggers a download but doesn't show progress or handle the potentially large file (many audio blobs) gracefully.

### What's Missing
1. "Import Archive" button in `ProjectListDialog.tsx` (file input → `importProjectArchive()` → `setProject()`)
2. Wire all audio blobs back into IDB after import
3. Handle the case where a project with the same ID already exists (confirm overwrite or fork)
4. Progress/spinner during import (can be large)
5. Error toast if archive is corrupt

### User Impact: **HIGH**
Without import, the archive export is a write-only backup. Users can't share projects, restore from backup, or move between machines. This makes the entire archive feature useless in practice.

### Complexity: **Low**
`importProjectArchive()` in `projectStorage.ts` already does the parsing. The UI wiring is:
- File input button: ~30 lines
- Error handling: ~20 lines
- Store dispatch: ~10 lines

### Files to Touch
- `src/components/dialogs/ProjectListDialog.tsx` — add import button + file input
- `src/services/projectStorage.ts` — verify/complete `importProjectArchive()` handles audio blob re-insertion into IDB
- `src/services/audioFileManager.ts` — ensure `storeAudioBlob` is called per imported file

---

## Priority 5: Track Effects Chain Not Connected to Live Playback

### Problem
The `EffectsEngine` manages Tone.js effect chains per track (`rebuildChain`, `updateEffectParams`), and `EffectChain.tsx` lets users add/configure effects (EQ3, compressor, reverb, delay, distortion, filter with LFO).

However, the `EffectsEngine` chains are **never connected to the audio output**. `AudioEngine.ts` and `TrackNode.ts` have no knowledge of `effectsEngine`. When a user adds an effect in the Mixer, `effectsEngine.rebuildChain()` builds Tone.js nodes that are disconnected floating graphs — nothing routes audio through them.

The `TrackNode` class has its own separate EQ3 / compressor / reverb (baked in, using native Web Audio nodes), but the richer per-effect chain (`track.effects[]`) is only visual — it affects no sound.

Confirmation: searching `AudioEngine.ts` and `useTransport.ts` for any `effectsEngine` reference returns zero results.

### What's Missing
The Tone.js `effectsEngine` chains need to be connected into the signal path. Two approaches:

**Option A (minimal):** After `TrackNode` builds its internal chain, insert Tone.js effect nodes between `trackNode.volumeGain` and `masterGain` by calling `effectsEngine.rebuildChain()` and connecting `trackNode.volumeGain → effectChain[0] → ... → effectChain[N] → masterGain`. Requires converting Tone nodes ↔ Web Audio nodes.

**Option B (recommended):** Rewrite `EffectsEngine` to use native Web Audio nodes (matching `TrackNode` style) instead of Tone.js nodes, so they slot naturally into the existing `AudioContext`. This also solves the offline-render problem from Priority 2.

Also need: call `effectsEngine.rebuildChain(trackId, effects)` whenever `track.effects` changes (subscribe in `useTransport.ts` or `projectStore` subscriber).

### User Impact: **HIGH**
The Effects panel is prominently featured in the Mixer. Users adding effects expect to hear them. Discovering that effects are purely cosmetic is a significant trust-breaking bug.

### Complexity: **High**
Requires careful audio graph re-wiring. The Tone.js ↔ native Web Audio bridge is the main complication. Option B (native nodes) is cleaner but more code. Either way requires careful lifecycle management to avoid node leaks.

### Files to Touch
- `src/engine/EffectsEngine.ts` — refactor to native Web Audio or add bridge
- `src/engine/AudioEngine.ts` — integrate effect chain per track
- `src/engine/TrackNode.ts` — expose connection point for effect insertion
- `src/hooks/useTransport.ts` — trigger `rebuildChain` when effects change
- `src/store/projectStore.ts` — subscriber/side-effect to rebuild on effect mutations

---

## Summary Table

| # | Improvement | User Impact | Complexity | Offline? |
|---|-------------|-------------|------------|---------|
| 1 | Wire up Recording (RecordingEngine orphaned) | **High** | Medium | ✅ |
| 2 | Apply mixer effects in WAV export | **High** | Medium | ✅ |
| 3 | Piano Roll: quantize, delete-selected, transpose | **High** | Low–Med | ✅ |
| 4 | Project Archive import UI (export-only right now) | **High** | Low | ✅ |
| 5 | Connect EffectsEngine to live audio path | **High** | High | ✅ |

All five work fully offline/locally with no backend dependency.
