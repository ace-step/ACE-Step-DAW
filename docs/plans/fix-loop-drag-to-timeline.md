# Plan: Fix Loop Browser Drag-to-Timeline

## User Story
As a user, I want to drag a loop from the Loop Browser and drop it onto a track in the timeline, so that it creates a new Sample clip with that loop's audio.

## Problem
Loop Browser items set `dataTransfer.setData('application/x-loop-id', def.id)` on drag start.
Timeline's `handleDrop` only processes `e.dataTransfer.files` (audio file imports) — it ignores `x-loop-id`.

## Root Cause
`src/components/timeline/Timeline.tsx` handleDrop (~line 98):
```typescript
const handleDrop = useCallback(async (e: React.DragEvent) => {
  const files = e.dataTransfer.files;
  if (files.length > 0) {
    await importMultipleFiles(files);  // only handles files
  }
}, [importMultipleFiles]);
// MISSING: no handler for 'application/x-loop-id'
```

## Solution

**File: `src/components/timeline/Timeline.tsx`**

In `handleDrop`, add loop-id handling before the file check:

```typescript
const handleDrop = useCallback(async (e: React.DragEvent) => {
  e.preventDefault();
  dragCounterRef.current = 0;
  setFileDragOver(false);
  
  // Handle loop drag from Loop Browser
  const loopId = e.dataTransfer.getData('application/x-loop-id');
  if (loopId) {
    // Find which track was dropped on via y position
    const dropY = e.clientY;
    // Find track from sorted tracks by y position... OR just add to first sample track
    // Simple approach: load the loop and add as Sample clip to the track under cursor
    const { LOOP_DEFINITIONS, loadLoop } = await import('../../engine/LoopLibrary');
    const def = LOOP_DEFINITIONS.find(d => d.id === loopId);
    if (def && project) {
      try {
        const { audioBuffer } = await loadLoop(def);
        // Convert AudioBuffer to Blob for storage
        // ... store as sample clip on nearest track
      } catch (err) {
        console.error('Failed to load loop:', err);
      }
    }
    return;
  }
  
  // Handle file drop (existing behavior)
  const files = e.dataTransfer.files;
  if (files.length > 0) {
    await importMultipleFiles(files);
  }
}, [importMultipleFiles, project]);
```

**Also: Add dragOver visual feedback** on track lanes when a loop is being dragged over them.

## Files to Touch
- `src/components/timeline/Timeline.tsx` — add loop-id drop handler
- May need `src/services/audioFileManager.ts` — for saving AudioBuffer as blob

## Verification
1. Open Loop Browser, drag "808 Boom" to Keyboard track lane
2. Expected: New "Sample" clip appears on that track
3. Click play — should hear the loop

## Note
This is lower priority than fix-midi-sequencer-playback.md
