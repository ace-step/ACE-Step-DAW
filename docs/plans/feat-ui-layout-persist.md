# Plan: Persist UI Layout State Across Reloads

## User Story
As a user, my panel sizes (Mixer height, Piano Roll height), panel open/close states, and zoom level should be saved when I reload the page.

## Problem
uiStore has no persist middleware. All layout state resets on reload.

## Solution
Add Zustand persist middleware to uiStore, selecting only layout-relevant keys (not ephemeral state like selected clip, cursor position).

## Keys to Persist
- showMixer, showLibrary, loopBrowserOpen, showAssetsPanel
- mixerHeight, pianoRollHeight, sequencerEditorHeight (if they exist)
- pixelsPerSecond (zoom level)
- loopBrowserCategory

## Keys NOT to Persist (ephemeral)
- showExportDialog, showSettingsDialog, showNewProjectDialog, etc. (dialogs)
- selectedClipId, contextMenu, fileDragOver (volatile UI state)

## Implementation
In src/store/uiStore.ts:
1. Import persist from 'zustand/middleware'
2. Wrap store with persist(..., { name: 'ace-step-daw-ui', partialize: (state) => ({ showMixer, loopBrowserCategory, pixelsPerSecond, ... }) })

## Files
- src/store/uiStore.ts — add persist middleware

## Build Check
- npm run build must pass 0 errors
