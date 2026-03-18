# Recording UX Gap Analysis: ACE-Step DAW vs Ableton Live 12

Source: [Ableton Live 12 Manual — Recording New Clips](https://www.ableton.com/en/live-manual/12/recording-new-clips/)
Date: 2026-03-18

---

## Top 5 Gaps

### Gap 1: No Exclusive Arm / Multi-Arm Modifier (HIGH VALUE)

**Ableton behavior:** Click arm = exclusive (disarms all others). Cmd/Ctrl+click = additive multi-arm. Multi-select tracks then click arm = arm all selected. Arming auto-selects the track (opens its device chain).
**Our behavior:** `toggleArmTrack` is always additive. No exclusive-arm default, no modifier key handling, no track auto-selection on arm.
**Edge cases:** Ableton's exclusive arm prevents accidentally recording to forgotten tracks — a common source of wasted takes.

### Gap 2: Count-In Not Wired to Record Flow (HIGH VALUE)

**Ableton behavior:** Count-in (None / 1 bar / 2 bars) fires before recording starts. LCD shows negative bars-beats-sixteenths in blue (e.g., `-2.1.1` → `1.1.1`). Metronome always audible during count-in regardless of "only while recording" setting. Transport does NOT advance during count-in.
**Our behavior:** `RecordingEngine.playCountIn()` exists with click sounds, but `useRecording.toggleRecord()` never calls it. Count-in is effectively dead code. No LCD visual feedback for count-in state.
**Parameters:** CountInLength type supports `'off' | '1bar' | '2bars'` — matches Ableton's range. Missing: UI to select count-in length, integration into record flow.

### Gap 3: No Punch-In / Punch-Out Recording (MEDIUM VALUE)

**Ableton behavior:** Punch-in/out switches tie to the loop brace positions. Punch-in prevents recording before loop start; punch-out stops recording at loop end. Enables "warm-up" pre-roll. Loop recording retains all passes — double-click clip to access earlier takes in Sample Editor.
**Our behavior:** No punch-in/out concept. Loop toggle exists in transport but has no relationship to recording boundaries. Recording runs from press-to-stop with no positional constraints.
**Visual feedback:** Ableton shows distinct punch regions on the timeline with shaded non-record zones.

### Gap 4: No Recording Undo / Take Management (MEDIUM VALUE)

**Ableton behavior:** Undo removes the last recording take as a single action. Record quantization is a separate undo step (undo quantize without losing the take). During MIDI overdub, undo removes the last pass while keeping earlier layers. "Capture MIDI" retroactively saves played notes even when not recording.
**Our behavior:** `stopRecording` creates a clip via `addClip` + `updateClipStatus`. No undo integration — once saved, the only option is manual clip deletion. No take stacking or capture-after-the-fact.

### Gap 5: No Audio Monitoring Mode Selection (LOWER VALUE)

**Ableton behavior:** Three modes per track: **Auto** (monitor when armed + not playing), **In** (always monitor input), **Off** (never monitor). Auto is the default and prevents feedback loops during playback.
**Our behavior:** `setMonitoring(trackId, boolean)` is binary on/off, set to `true` whenever a track is armed. No Auto mode that silences monitoring during playback. Risk of feedback when playing back a track while armed.

---

## Implementation Recommendations (Top 3)

### 1. Exclusive Arm with Modifier Keys

**Files:** `useRecording.ts`, `TrackHeader.tsx`, `transportStore.ts`

**Changes:**
- `toggleArmTrack(id, exclusive?: boolean)` — when `exclusive=true` (default), disarm all other tracks first
- `TrackHeader` arm button: pass `e.metaKey || e.ctrlKey` to toggle additive mode
  ```tsx
  onClick={(e) => toggleArmTrack(track.id, !(e.metaKey || e.ctrlKey))}
  ```
- Add `disarmAll()` to transportStore for batch disarm
- On arm, auto-select the track (set `selectedTrackId` in uiStore)
- Keyboard shortcut: number keys 1-9 to arm track by index (Ableton convention)

**Effort:** Small. Mostly plumbing a boolean through existing functions.

### 2. Wire Count-In into Record Flow

**Files:** `useRecording.ts`, `Toolbar.tsx` (or new CountInSelector), `RecordingEngine.ts`

**Changes:**
- In `toggleRecord()`, before `startRecording()`, call `await recordingEngine.playCountIn(bpm, beatsPerBar, onBeat)`
- `onBeat` callback updates a new `countInRemaining` field in transportStore
- LCD display shows count-in state: negative bar position in accent color (e.g., blue/cyan text)
- Add count-in length selector near metronome button (dropdown: Off / 1 Bar / 2 Bars)
- During count-in: disable stop button, show pulsing indicator on record button
- Transport position must NOT advance during count-in (count-in is pre-transport)

**Visual spec:**
- LCD text color changes to `text-cyan-400` during count-in
- Record button pulses at beat rate during count-in
- Count-in beats shown as `-1.1`, `-1.2`, `-1.3`, `-1.4` → recording starts at `1.1.1`

**Effort:** Medium. Engine support exists; need UI integration + transport store fields.

### 3. Recording Undo (Single-Action Take Removal)

**Files:** `useRecording.ts`, `projectStore.ts` (undo system)

**Changes:**
- After `stopRecording` creates clips, push a single undo entry that groups all created clip IDs
- Undo action: remove all clips from that recording pass + delete their audio files
- Store `lastRecordingClipIds: string[]` in transportStore for quick "undo last take"
- Keyboard shortcut: Cmd+Z already works if projectStore has undo — just ensure `addClip` is wrapped in an undo group
- If projectStore lacks undo: implement a minimal undo stack (action + inverse action pairs)

**Effort:** Medium-Large depending on existing undo infrastructure. Check if projectStore already has undo support; if not, this becomes the prerequisite.

---

## Priority Matrix

| Gap | User Impact | Effort | Priority |
|-----|-----------|--------|----------|
| Exclusive arm | Prevents wasted takes, matches muscle memory | S | **P0** |
| Count-in wiring | Critical for timing; code 80% exists | M | **P0** |
| Punch-in/out | Pro feature, needs loop-region work | L | P2 |
| Recording undo | Safety net, depends on undo infra | M-L | **P1** |
| Monitor modes | Prevents feedback, niche until multi-track | S-M | P2 |
