# Plan: Piano Roll Power Tools

Issue: #341

## User Story

As a composer, I want explicit pencil, paint, erase, resize, and slide-note tools in the piano roll, so that I can edit MIDI quickly without modal friction.

As an AI agent, I want the note model and store API to support the same slide-note concept used in the UI, so that browser automation and store-driven composition can verify identical behavior.

## Problem

ACE-Step's piano roll already supports note creation, velocity editing, quantize, and basic selection, but the fast-edit workflow is still incomplete. The editor relies on a single draw toggle, only exposes right-edge resize, and has no durable note model for slide or portamento notes. That leaves the product short of the "power tools" bar defined in the design docs and issue scope.

## Root Cause

- The toolbar exposes only a draw toggle, so tool intent is not modeled explicitly in UI state: `src/components/pianoroll/PianoRoll.tsx`.
- Canvas hit-testing only distinguishes note body vs right edge; there is no left-edge resize path or explicit paint/erase tool handling: `src/components/pianoroll/PianoRollCanvas.tsx`.
- `MidiNote` has no field for slide/portamento semantics, so playback and rendering cannot distinguish normal notes from slide notes: `src/types/project.ts`.
- Existing tests cover note creation and quantize, but not tool switching, slide-note data, or the new edit affordances: `tests/e2e/piano-roll.spec.ts`, `tests/unit/pianoRollContextMenu.test.tsx`.

## Solution

1. Extend the MIDI note model with slide metadata and keep the store actions compatible with agent usage.
   - Add a boolean slide flag to `MidiNote`.
   - Ensure add/update flows preserve the field.
2. Replace the binary draw toggle with explicit piano roll tools.
   - Add `select`, `pencil`, `paint`, `erase`, and `slide` tools.
   - Wire number-key shortcuts and visible toolbar state.
3. Upgrade the canvas interactions.
   - Support left and right resize handles with snap behavior.
   - Support paint drag creation and erase drag deletion.
   - Support slide-note creation and a distinct visual treatment.
   - Preserve current velocity-lane editing and keyboard workflows.
4. Add regression coverage.
   - Unit tests for slide-note store behavior.
   - Component tests for the new tool UI.
   - E2E coverage for agent-visible slide metadata and tool-driven editing flows.

## Verification

- `npm test`
- `npx tsc --noEmit`
- `npm run build`
- `npx playwright test tests/e2e/piano-roll.spec.ts`

## Files To Touch

- `src/types/project.ts`
- `src/store/projectStore.ts`
- `src/components/pianoroll/PianoRoll.tsx`
- `src/components/pianoroll/PianoRollCanvas.tsx`
- `src/components/pianoroll/PianoRollConstants.ts`
- `src/components/pianoroll/VelocityLane.tsx`
- `src/store/__tests__/projectStore.test.ts`
- `tests/unit/pianoRollContextMenu.test.tsx`
- `tests/e2e/piano-roll.spec.ts`
