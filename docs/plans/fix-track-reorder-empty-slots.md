# Plan: Fix Track Reordering Into Empty Arrangement Slots

## User Stories

- As a human user, I want to drag a track header into an empty arrangement row, so that I can place the track exactly where I want instead of only swapping against another visible track.
- As an AI agent, I want empty arrangement rows to expose a real drop target and stable ordering API, so that browser automation and `window.__store`-driven workflows can reorder tracks into arbitrary slots without pixel-perfect hacks.

## Problem

Track reordering currently works only when the dragged header is dropped on top of another existing track header. When the user drags a track into an empty row between tracks, nothing happens because that placeholder row is not a valid drop target.

This breaks the arrangement workflow shown in the bug report: the user can see a clear destination lane, but the UI ignores the drop.

## Root Cause

1. `TrackList` wires drag-and-drop handlers only into `TrackHeader` rows. Empty placeholder rows are rendered by `EmptyTrackHeaderRow`, which has no `onDragOver`, `onDrop`, or insertion affordance. As a result, the drag never resolves when the pointer is over an empty slot.
2. The store exposes `reorderTrack(draggedId, targetId, position)`, which only supports placing a track relative to another track id. There is no store API for dropping into an explicit arrangement slot / order index.
3. The arrangement UI is already slot-based via `buildArrangementTrackSlots()`, so the visual model supports empty insertion points, but the interaction model does not.

## Solution

1. Add a store action that moves a track to a target arrangement order slot, not just relative to another track.
2. Teach `TrackList` to treat empty placeholder rows as valid drag targets with visible insertion feedback.
3. Reuse the arrangement slot index to compute the destination order so dropping into gaps and after the final visible track behaves predictably.
4. Add regression tests that cover:
   - dropping onto an empty placeholder row inserts the track into that slot
   - dropping onto an existing track still works
   - the rendered order stays aligned with arrangement slots

## Verification

1. Manual user-story test:
   - Create at least two tracks with an empty gap between their order values.
   - Drag the upper track into the empty row between them.
   - Confirm the header and timeline lane move into that position.
2. Agent workflow test:
   - Use browser automation to drag a track header over an empty arrangement row.
   - Verify the rendered order changes and the drop target exposes accessible feedback.
3. Build checks:
   - `npx tsc --noEmit`
   - `npm run build`
   - targeted unit tests for track list / store reorder logic

## Files to Touch

1. `src/store/projectStore.ts`
2. `src/components/tracks/TrackList.tsx`
3. `src/components/tracks/__tests__/...` (new or updated regression tests)
