# ACE-Step DAW — Top 5 Next Priorities

> Analysis date: 2025-03-18
> Scope: `src/` directory, offline/local-only improvements
> Goal: highest user-impact items that complete or polish existing features

---

## 1. Wire MIDI + Sequencer Real-Time Playback

**Problem:** Users can draw MIDI notes in the Piano Roll and program drum patterns in the Step Sequencer, but pressing Play produces **no sound** for those tracks. Only pre-rendered audio clips (AI stems, imported samples) are audible. `SynthEngine.scheduleClip()` exists but is never called; `AudioEngine.scheduleSequencer()` has scheduling logic but is not invoked from the transport hook.

**User impact:** HIGH — This is the single biggest broken promise in the DAW. Every creative workflow that starts with "draw some notes" dead-ends at silence.

**Estimated complexity:** Medium (2–3 days). The engines are already built; the gap is wiring them into the playback loop.

**Files to touch:**
| File | Change |
|------|--------|
| `src/hooks/useTransport.ts` | Call `synthEngine.scheduleClip()` for piano-roll tracks and `audioEngine.scheduleSequencer()` for sequencer tracks inside the play handler, before/alongside `engine.schedulePlayback()` |
| `src/engine/SynthEngine.ts` | Verify `scheduleClip()` handles seek offset and loop boundaries correctly |
| `src/engine/AudioEngine.ts` | Verify `scheduleSequencer()` tiles patterns across the full transport range and respects mute/solo |

**Existing plan:** `docs/plans/fix-midi-sequencer-playback.md`

---

## 2. Fix Loop Browser Visibility + Drag-to-Timeline

**Problem (two linked bugs):**
1. The **Loop Browser** button (`O` shortcut) toggles the wrong panel (`AssetsPanel`, which is empty) instead of the `LoopBrowser` component that holds 15 built-in loops.
2. Even if the browser were visible, **dropping a loop onto the timeline does nothing** — drop handlers only check for `Files`, not `application/x-loop-id`.

**User impact:** HIGH — The loop library is a marquee feature for quick song sketching. Both discovery and insertion are broken.

**Estimated complexity:** Low (< 1 day). Toolbar toggle fix is a one-liner; drop handling requires adding a branch in two event handlers.

**Files to touch:**
| File | Change |
|------|--------|
| `src/components/layout/Toolbar.tsx` | Change the "Loop Browser" button to toggle `loopBrowserOpen` (uiStore) instead of `showAssetsPanel` |
| `src/components/layout/AppShell.tsx` | Render `<LoopBrowser>` when `loopBrowserOpen` is true (may already be partially wired) |
| `src/components/timeline/TrackLane.tsx` | In `onDrop`, check for `application/x-loop-id`; resolve the loop, decode audio, and call `importAudioBufferToTrack` |
| `src/components/timeline/Timeline.tsx` | Mirror the same loop-id drop handling in `handleDrop` for drops on empty space |

**Existing plans:** `docs/plans/fix-loop-browser.md`, `docs/plans/fix-loop-drag-to-timeline.md`

---

## 3. Add a Toast / Notification System

**Problem:** The app gives **zero user-visible feedback** for operations that succeed, fail, or take a long time:
- AI generation completes → no notification
- WAV export finishes → no "saved!" confirmation
- Network/API error during generation → silent `console.error`
- Microphone permission denied → silent failure
- Project saved → no acknowledgement

Users are left guessing whether actions worked, especially during background generation.

**User impact:** HIGH — Every user hits this on every session. It erodes trust in the app and causes redundant retries.

**Estimated complexity:** Low–Medium (1–2 days). Add a lightweight toast component (or a dependency like `sonner` / `react-hot-toast`), then sprinkle `toast()` calls at key points.

**Files to touch:**
| File | Change |
|------|--------|
| `src/components/ui/Toast.tsx` (new) | Minimal toast container + hook, or integrate a library |
| `src/components/layout/AppShell.tsx` | Mount the toast container |
| `src/store/generationStore.ts` / `generationPipeline.ts` | Toast on generation start, success, error |
| `src/components/dialogs/ExportDialog.tsx` | Toast on export success/failure |
| `src/engine/RecordingEngine.ts` | Toast on mic permission denied |
| `src/store/projectStore.ts` | Toast on project save/load |

---

## 4. Wire Automation Playback

**Problem:** The `AutomationEngine` class exists with full breakpoint interpolation logic, and users can draw automation lanes (volume, pan) on the timeline. But the engine is **never called during playback** — automation data is stored and displayed but has no audible effect.

**User impact:** MEDIUM — Automation is an intermediate-to-advanced feature, but the fact that the UI exists and "works" visually while doing nothing audibly is a confusing UX trap.

**Estimated complexity:** Medium (1–2 days). The engine is complete; the work is scheduling parameter updates during the playback RAF loop and ensuring automation values are applied to TrackNode gain/pan.

**Files to touch:**
| File | Change |
|------|--------|
| `src/hooks/useTransport.ts` | In the RAF playback loop, call `automationEngine.getValueAtTime(trackId, param, currentBeat)` and apply to the corresponding TrackNode |
| `src/engine/AutomationEngine.ts` | Ensure `getValueAtTime` handles edge cases (no points, single point, extrapolation) |
| `src/engine/AudioEngine.ts` | Expose a method to set track gain/pan at runtime (e.g., `setTrackParam(trackId, param, value)`) if one doesn't exist |
| `src/components/timeline/AutomationLane.tsx` | (Optional) Add a visual playhead indicator showing current automation value |

---

## 5. Persist UI Layout State Across Reloads

**Problem:** Panel sizes (mixer height, piano roll height, sequencer editor height), scroll positions, selected tracks, and editor open/close states all reset to defaults on page reload. The `uiStore` has no `persist` middleware, unlike `projectStore` which uses IndexedDB.

**User impact:** MEDIUM — Power users who arrange their workspace lose their layout every reload or browser restart, causing repeated friction.

**Estimated complexity:** Low (< 1 day). Add Zustand `persist` middleware to `uiStore` with a localStorage or IndexedDB backend, selecting only layout-related keys (not ephemeral selection state).

**Files to touch:**
| File | Change |
|------|--------|
| `src/store/uiStore.ts` | Wrap the store with `persist(...)` middleware; pick keys like `mixerHeight`, `pianoRollHeight`, `sequencerEditorHeight`, `showMixer`, `showEffects`, `editorMode` |
| (No other files needed) | |

---

## Priority Matrix

| # | Improvement | User Impact | Complexity | Blocking? |
|---|-------------|-------------|------------|-----------|
| 1 | MIDI + Sequencer playback | HIGH | Medium | Yes — core feature broken |
| 2 | Loop Browser + drag-to-timeline | HIGH | Low | Yes — feature invisible |
| 3 | Toast / notification system | HIGH | Low–Med | No, but affects all flows |
| 4 | Automation playback | MEDIUM | Medium | No — advanced feature |
| 5 | Persist UI layout | MEDIUM | Low | No — QoL polish |

**Recommended order:** 2 → 1 → 3 → 5 → 4
(Start with the quickest high-impact fix, then tackle the critical playback gap, then layer on feedback and polish.)

---

## Honorable Mentions (Not Top 5)

- **Undo/redo efficiency:** Works but uses `structuredClone` of full state; delta-based storage would be faster for large projects.
- **AudioContext leak in RecordingEngine:** New context created on each `requestPermission()` call; should reuse or dispose.
- **Component splitting:** PianoRoll.tsx (600+ lines) and projectStore.ts (1000+ lines) are large and would benefit from decomposition for maintainability.
- **Test coverage:** Zero test files — any refactoring is risky without regression protection.
- **Console.log cleanup:** 20+ `[GenerationPipeline]` logs pollute DevTools.
