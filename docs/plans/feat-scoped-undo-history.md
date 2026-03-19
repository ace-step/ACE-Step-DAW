# Feature Plan: Scoped Undo History With Focus-Aware Stacks

Issue: #334
Date: 2026-03-19

## User Stories

- As a producer, I want `Cmd/Ctrl+Z` to target the panel I am actively editing, so that I can undo MIDI or mixer work without feeling like the whole song state is at risk.
- As an AI agent, I want readable scoped history entries and jump APIs, so that scripted edits are reversible and easy to inspect.

## Problem

- `src/store/projectStore.ts` uses one hidden undo stack for the whole project.
- `src/hooks/useKeyboardShortcuts.ts` always routes `Cmd/Ctrl+Z` to that single stack.
- There is no visible history panel or store API for reading named entries.

## Root Cause

- History entries are stored as unlabelled project snapshots in module-level arrays, so scope and action meaning are lost.
- UI state does not track which editing surface currently owns undo focus.
- The app exposes project state to agents, but not a readable undo history model.

## Solution

- Replace the single history arrays in `src/store/projectStore.ts` with named per-scope stacks for `arrangement`, `track`, `pianoRoll`, and `mixer`.
- Extend store APIs with `undo(scope?)`, `redo(scope?)`, `getUndoHistory(scope?)`, `getRedoHistory(scope?)`, and `jumpToHistoryEntry(...)`.
- Tag high-value mutations with explicit labels and scopes, especially piano-roll note edits, track edits, sequencer/drum-machine edits, and mixer/effect/mastering changes.
- Add `historyFocusScope` plus `showUndoHistoryPanel` to `src/store/uiStore.ts`.
- Route keyboard undo/redo in `src/hooks/useKeyboardShortcuts.ts` through the active focus scope and add a toggle for the history panel.
- Add a visible history panel component that shows named steps and timestamps and allows jumping to a previous entry.

## Verification

- `npx tsc --noEmit`
- `npm run test`
- `npm run build`
- Manual user story test:
  - Create a piano-roll track, add MIDI notes, undo in piano-roll focus, and confirm the track/arrangement remains intact.
  - Open the mixer, adjust a channel parameter, undo from mixer focus, and confirm unrelated piano-roll edits remain available in their own stack.
  - Open the history panel and jump to a prior MIDI checkpoint.

## Files To Touch

- `src/store/projectStore.ts`
- `src/store/uiStore.ts`
- `src/hooks/useKeyboardShortcuts.ts`
- `src/components/layout/AppShell.tsx`
- `src/components/layout/Toolbar.tsx`
- `src/components/layout/UndoHistoryPanel.tsx`
- `src/components/pianoroll/PianoRoll.tsx`
- `src/components/sequencer/SequencerEditor.tsx`
- `src/components/sequencer/DrumMachineEditor.tsx`
- `src/components/mixer/MixerPanel.tsx`
- `src/components/mixer/EffectChain.tsx`
- `tests/unit/undoRedo.test.ts`
