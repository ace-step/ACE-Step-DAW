# Plan: MIDI Clip Export

Issue: #215

## User Story

As a user, I want to export a MIDI clip as a `.mid` file from the clip itself, so that I can reuse the pattern outside ACE-Step.

As an AI agent, I want the same export path exposed through `window.__store`, so that I can trigger the workflow programmatically and verify the download without canvas-only interaction.

## Problem

ACE-Step could import MIDI and edit MIDI clips, but it had no standard MIDI encoder and no export action for clip data. The only export surface in the product was audio-focused, so piano roll content could be rendered to audio but not downloaded as `.mid`.

## Root Cause

- The MIDI utility layer only parsed incoming files; it had no encoder or export path for note data: `src/utils/midi.ts:166`.
- The store exposed audio stem export but no MIDI clip export action for agents or UI wiring: `src/store/projectStore.ts:294`, `src/store/projectStore.ts:3554`.
- The clip context menu exposed `Open Piano Roll` for MIDI clips, but there was no export command in the clip workflow: `src/components/timeline/ClipContextMenu.tsx:63`.

## Solution

1. Add a Standard MIDI file encoder in `src/utils/midi.ts`.
   - Write SMF header + track chunk.
   - Emit track name, tempo, and time-signature meta events.
   - Convert note beats into ticks and normalize velocities from either `0..1` or `0..127`.
2. Add `exportMidiClip(clipId)` in `src/store/projectStore.ts`.
   - Resolve the clip and parent track.
   - Validate that the clip is MIDI and contains note data.
   - Encode the clip into bytes, create a blob, and trigger a `.mid` download with a sanitized filename.
3. Add `Export MIDI Clip…` to the MIDI clip context menu.
   - Keep the feature at clip level, matching the Ableton interaction model.
   - Wire the menu item to the new store action so browser automation and human UI use the same code path.
4. Add regression coverage.
   - Unit test the encoder by round-tripping exported bytes back through the parser.
   - Unit test the store download behavior.
   - E2E test the clip export download flow in Playwright.

## Verification

- `npm test`
- `npx tsc --noEmit`
- `npm run build`
- `E2E_PORT=5274 npx playwright test tests/e2e/midi-export.spec.ts`

## Files To Touch

- `src/utils/midi.ts`
- `src/store/projectStore.ts`
- `src/components/timeline/ClipContextMenu.tsx`
- `src/components/timeline/ClipBlock.tsx`
- `tests/unit/midi.test.ts`
- `tests/unit/projectStore.test.ts`
- `tests/e2e/midi-export.spec.ts`

## Notes

- `src/components/timeline/TakeLaneStrip.tsx` was added as a minimal missing component so the updated `origin/main` branch could pass TypeScript and build again; this was a branch-level build blocker unrelated to MIDI export behavior.
