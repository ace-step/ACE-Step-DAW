# Integrate MIDI to Strudel Conversion

## User Stories

- As a human user, I want to convert a MIDI clip or track into editable Strudel code, so that I can move from piano-roll ideas into live coding quickly.
- As a human user, I want to import a `.mid` file directly into the Strudel workflow, so that I can study or remix external MIDI material without creating intermediate piano-roll tracks first.
- As an AI agent, I want `window.__store` actions for MIDI-to-Strudel conversion and application, so that I can automate this workflow without clicking through the UI.

## Problem

- ACE-Step can edit MIDI and live-code Strudel, but there is no bridge from one workflow to the other.
- The current Strudel editor historically defaults to the first Strudel track rather than a deterministic target track.
- MIDI file import currently routes only into piano-roll tracks.

## Root Cause

- MIDI and Strudel were developed as separate creation surfaces.
- No shared conversion service existed for DAW-native MIDI data -> Strudel code.
- Strudel panel targeting was not built around an explicit destination workflow.

## Solution

- Add a pure conversion service in `src/services/strudelConversion.ts`.
- Add store actions:
  - `convertMidiClipToStrudel`
  - `convertMidiTrackToStrudel`
  - `convertMidiFileToStrudel`
  - `applyStrudelCodeToTrack`
- Make `setOpenStrudelEditor(trackId)` open the panel on the requested track.
- Add conversion entry points in:
  - Strudel editor
  - MIDI clip context menu
  - Piano roll toolbar
  - MIDI file drop on Strudel tracks

## Verification

- `npx vitest run src/services/__tests__/strudelConversion.test.ts src/store/__tests__/strudelMidiImport.test.ts src/components/dialogs/__tests__/InstrumentPicker.test.tsx`
- Manual workflow:
  - convert a MIDI clip to Strudel
  - convert a piano-roll track to Strudel
  - import a `.mid` file from Strudel editor
  - drag a `.mid` file onto a Strudel lane

## Files To Touch

- `docs/research-notes/midi-strudel-integration.md`
- `docs/plans/integrate-midi-strudel.md`
- `src/services/strudelConversion.ts`
- `src/store/projectStore.ts`
- `src/components/strudel/StrudelEditor.tsx`
- `src/components/timeline/ClipContextMenu.tsx`
- `src/components/timeline/ClipBlock.tsx`
- `src/components/timeline/TrackLane.tsx`
- `src/components/pianoroll/PianoRoll.tsx`
- `src/store/uiStore.ts`
- `src/types/project.ts`
