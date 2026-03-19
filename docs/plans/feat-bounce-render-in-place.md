# Plan: Bounce / Render In Place

## User Stories

- As a human user, I want to right-click a track and bounce it in place, so that I can turn MIDI or processed audio into an editable audio clip without leaving the arrangement.
- As an AI agent, I want to call `window.__store.getState().bounceInPlace(trackId, options)`, so that I can render tracks programmatically without coordinate-based UI interaction.

## Problem

- The repo already supports freeze and flatten, but issue `#332` requires a creative bounce workflow with options, a keyboard shortcut, and a store API.
- Current track-header UI exposes `Freeze Track` and `Flatten Track`, but there is no `Bounce in Place` action or options dialog.
- `useKeyboardShortcuts` does not implement the design-doc shortcut for bounce.

## Root Cause

- Offline rendering exists in `src/engine/offlineRender.ts` and `src/engine/exportMix.ts`, but there is no store action that converts one track into a bounced audio result.
- Track-header actions in `src/components/tracks/TrackHeader.tsx` only call freeze/flatten services.
- Modal state in `src/store/uiStore.ts` has no bounce-dialog target, so the workflow cannot be opened from context menu or keyboard.

## Solution

- Add a dedicated bounce renderer in `src/services/bounceInPlace.ts` that:
  - computes the renderable range for one track,
  - renders MIDI, sampler, sequencer, and ready audio clips offline,
  - optionally bakes track effects,
  - optionally normalizes the result.
- Add `bounceInPlace(trackId, options)` to `src/store/projectStore.ts` so the store owns undo/redo-safe state mutation.
- Add dialog state to `src/store/uiStore.ts` and a new modal component at `src/components/dialogs/BounceInPlaceDialog.tsx`.
- Add context-menu and keyboard entry points in `src/components/tracks/TrackHeader.tsx` and `src/hooks/useKeyboardShortcuts.ts`.
- Add unit coverage for the render pipeline and store mutation plus an E2E workflow for shortcut + context-menu bounce.

## Verification

- `npx tsc --noEmit`
- `npm run build`
- `npm run test -- bounceInPlace`
- `npm run test -- TrackHeader`
- `npx playwright test tests/e2e/bounce-in-place.spec.ts`

## Files To Touch

- `src/types/project.ts`
- `src/services/bounceInPlace.ts`
- `src/store/projectStore.ts`
- `src/store/uiStore.ts`
- `src/hooks/useKeyboardShortcuts.ts`
- `src/components/dialogs/BounceInPlaceDialog.tsx`
- `src/components/dialogs/KeyboardShortcutsDialog.tsx`
- `src/components/layout/AppShell.tsx`
- `src/components/tracks/TrackHeader.tsx`
- `src/services/__tests__/bounceInPlace.test.ts`
- `src/store/__tests__/bounceInPlace.test.ts`
- `tests/e2e/bounce-in-place.spec.ts`
- `docs/research-notes/bounce-in-place-competitive-research-20260319.md`
- `docs/plans/feat-bounce-render-in-place.md`
