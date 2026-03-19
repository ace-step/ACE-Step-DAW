# Plan: Capture MIDI Retroactive Recording Workflow

Issue: #336

## User Story

As a musician, I want to hit Capture after improvising, so that I can keep ideas even when I was not recording.

As an AI agent, I want to inspect the rolling MIDI buffer and trigger capture through `window.__store`, so that store-driven composition and browser automation can recover recent takes programmatically.

## Problem

ACE-Step has piano-roll editing and audio recording infrastructure, but no retroactive MIDI capture. If a user or agent plays notes before record is armed, there is no rolling buffer, no capture command, and no single-step undo path for turning those notes into a clip.

## Root Cause

- The project store has clip-editing actions, but no non-persisted MIDI capture buffer or capture action: [src/store/projectStore.ts](/tmp/daw-worktrees/agent-336/src/store/projectStore.ts).
- The transport and toolbar expose Record, Loop, and Metronome controls, but no Capture MIDI affordance or shortcut: [src/components/layout/Toolbar.tsx](/tmp/daw-worktrees/agent-336/src/components/layout/Toolbar.tsx), [src/hooks/useKeyboardShortcuts.ts](/tmp/daw-worktrees/agent-336/src/hooks/useKeyboardShortcuts.ts).
- The app exposes `window.__store`, but there is no store API for ingesting live MIDI note-on/off events or reading the current rolling buffer: [src/main.tsx](/tmp/daw-worktrees/agent-336/src/main.tsx).
- Existing tests cover direct MIDI clip editing only after a clip exists; they do not cover retroactive note capture, overdub, or one-step undo: [src/store/__tests__/projectStore.test.ts](/tmp/daw-worktrees/agent-336/src/store/__tests__/projectStore.test.ts).

## Solution

1. Add a non-persisted rolling MIDI capture buffer.
   - Create a small service that records note-on/note-off pairs per track.
   - Keep recent note spans for a bounded capture window and expose buffer snapshots.
2. Add store APIs for agent-friendly capture.
   - Add `recordMidiNoteOn`, `recordMidiNoteOff`, `getMidiCaptureBuffer`, and `captureMidi`.
   - Resolve the target track from explicit input first, then open piano-roll track, then armed or monitored piano-roll tracks.
   - Perform clip creation or overdub in one store mutation so Undo removes the whole capture result in one step.
3. Add UI wiring.
   - Add a dedicated Capture MIDI control in the main toolbar.
   - Add a keyboard shortcut for capture.
   - Surface clear success and empty-buffer feedback with toasts.
4. Add a minimal human-play path that uses the same ingestion API.
   - Route live piano-roll computer-keyboard note input through the new capture APIs.
   - Reuse the track synth/sampler engines so playback and capture share one path.
5. Add regression coverage.
   - Unit tests for rolling-buffer snapshots, new clip capture, clip overdub, and undo.

## Verification

- `npm test`
- `npx tsc --noEmit`
- `npm run build`
- Browser check: create project, add piano-roll track, play notes through the live-input path, press Capture, verify clip creation and undo

## Files To Touch

- [src/services/midiCaptureBuffer.ts](/tmp/daw-worktrees/agent-336/src/services/midiCaptureBuffer.ts)
- [src/store/projectStore.ts](/tmp/daw-worktrees/agent-336/src/store/projectStore.ts)
- [src/hooks/useKeyboardShortcuts.ts](/tmp/daw-worktrees/agent-336/src/hooks/useKeyboardShortcuts.ts)
- [src/hooks/useLiveMidiKeyboard.ts](/tmp/daw-worktrees/agent-336/src/hooks/useLiveMidiKeyboard.ts)
- [src/components/layout/Toolbar.tsx](/tmp/daw-worktrees/agent-336/src/components/layout/Toolbar.tsx)
- [src/components/layout/AppShell.tsx](/tmp/daw-worktrees/agent-336/src/components/layout/AppShell.tsx)
- [src/store/__tests__/projectStore.test.ts](/tmp/daw-worktrees/agent-336/src/store/__tests__/projectStore.test.ts)
