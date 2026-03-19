# Feature Plan: Consolidate / Glue Clips

## User stories

- As a user, I want to select multiple clips on one track and press `Cmd+J`, so that I can turn fragmented edits into one clip.
- As a user, I want to use a clip context menu action for consolidation, so that the workflow is discoverable without memorizing shortcuts.
- As an agent, I want `window.__store.getState().consolidateClips(trackId, clipIds)`, so that I can automate clip-merging workflows end-to-end.

## Problem

Issue #330 reports that ACE-Step DAW supports splitting, dragging, and duplicating clips but has no inverse action to merge them back into a single clip. This leaves arrangement edits fragmented and makes later editing cumbersome.

## Root Cause

- [src/store/projectStore.ts](/tmp/daw-worktrees/agent-330/src/store/projectStore.ts) includes `splitClip`, `duplicateClip`, and batch move/duplicate actions, but no track-local consolidate action.
- [src/hooks/useKeyboardShortcuts.ts](/tmp/daw-worktrees/agent-330/src/hooks/useKeyboardShortcuts.ts) has clip shortcuts for duplicate, split, edit, and generate, but no `Cmd+J` binding.
- [src/components/timeline/ClipContextMenu.tsx](/tmp/daw-worktrees/agent-330/src/components/timeline/ClipContextMenu.tsx) exposes clip editing actions but no consolidate entry.
- The codebase has no helper that merges MIDI note timing across clips or renders selected audio clips plus silence into one new source buffer.

## Solution

- Add `consolidateClips(trackId, clipIds)` to the project store.
- Add a clip consolidation service/helper that:
  - validates same-track, same-media-type selections;
  - merges MIDI notes into one clip spanning the selected time range;
  - renders audio clips into a new WAV blob with silence in gaps, honoring clip offsets, fades, and gain envelopes;
  - returns a replacement clip plus updated persisted audio metadata.
- Wire `Cmd+J` / `Ctrl+J` in keyboard shortcuts.
- Add `Consolidate` to the clip context menu and keep the new clip selected after the action from UI surfaces.
- Add unit tests for MIDI merge, audio merge, and undo restoration.
- Add an E2E workflow that creates clips through the store API, consolidates through the shortcut or menu, and verifies the visible timeline result plus store state.

## Verification

- `npm run test -- tests/unit/projectStore.test.ts tests/unit/undoRedo.test.ts`
- `npm run test:e2e -- tests/e2e/consolidate-clips.spec.ts`
- `npx tsc --noEmit`
- `npm run build`

## Files to touch

- `docs/research-notes/consolidate-clips-competitive-research-20260319.md`
- `docs/plans/feat-consolidate-clips.md`
- `src/store/projectStore.ts`
- `src/components/timeline/ClipContextMenu.tsx`
- `src/components/timeline/ClipBlock.tsx`
- `src/hooks/useKeyboardShortcuts.ts`
- `src/components/dialogs/KeyboardShortcutsDialog.tsx`
- `src/types/project.ts`
- `src/services/clipConsolidation.ts`
- `tests/unit/projectStore.test.ts`
- `tests/unit/undoRedo.test.ts`
- `tests/e2e/consolidate-clips.spec.ts`
