# Plan: Fix Loop Browser Drag-to-Timeline

## User Story
As a user, I want to drag a loop from the Loop Browser and drop it onto a track in the timeline, so that it creates a new audio clip with that loop's rendered audio.

## Problem
Loop Browser items set `dataTransfer.setData('application/x-loop-id', def.id)` on drag start.
Timeline's `handleDrop` only processes `e.dataTransfer.files` — ignores `x-loop-id`.
TrackLane also doesn't handle loop drops.

## Architecture

### Existing pipeline (for File imports):
```
File → arrayBuffer → decodeAudioData → AudioBuffer → audioBufferToWavBlob → saveAudioBlob → addClip + updateClipStatus
```
This lives in `src/hooks/useAudioImport.ts` (`importAudioToTrack`).

### What we need for loops:
```
loopId → LOOP_DEFINITIONS.find → loadLoop(def) → AudioBuffer → (same pipeline as above)
```

## Solution

### 1. Add `importAudioBufferToTrack` to `useAudioImport.ts`
New function that takes `(audioBuffer: AudioBuffer, name: string, trackId: string, startTime: number)` and follows the same pipeline as `importAudioToTrack` but skips the File decode step.

```typescript
const importAudioBufferToTrack = useCallback(async (
  audioBuffer: AudioBuffer, name: string, trackId: string, startTime: number
) => {
  const project = useProjectStore.getState().project;
  if (!project) return;
  
  const duration = audioBuffer.duration;
  const clipDuration = Math.min(duration, project.totalDuration - startTime);
  if (clipDuration <= 0) return;
  
  const clip = addClip(trackId, {
    startTime,
    duration: clipDuration,
    prompt: `Loop: ${name}`,
    lyrics: '',
  });
  
  const wavBlob = audioBufferToWavBlob(audioBuffer);
  const isolatedKey = await saveAudioBlob(project.id, clip.id, 'isolated', wavBlob);
  const peaks = computeWaveformPeaks(audioBuffer, 200);
  
  updateClipStatus(clip.id, 'ready', {
    isolatedAudioKey: isolatedKey,
    waveformPeaks: peaks,
    audioDuration: duration,
    audioOffset: 0,
    source: 'uploaded',
  });
}, [addClip, updateClipStatus]);
```

### 2. Handle loop drop in `TrackLane.tsx`
TrackLane already has `importAudioToTrack`. Add loop-id drop handling:

```typescript
// In TrackLane's onDrop handler:
const loopId = e.dataTransfer.getData('application/x-loop-id');
if (loopId) {
  const { LOOP_DEFINITIONS, loadLoop } = await import('../../engine/LoopLibrary');
  const def = LOOP_DEFINITIONS.find(d => d.id === loopId);
  if (def) {
    const { audioBuffer } = await loadLoop(def);
    const dropX = e.clientX - laneRect.left;
    const startTime = Math.max(0, dropX / pixelsPerSecond);
    await importAudioBufferToTrack(audioBuffer, def.name, track.id, startTime);
  }
  return;
}
```

### 3. Add `onDragOver` to TrackLane
Need `e.preventDefault()` on dragOver to allow drops:
```typescript
onDragOver={(e) => {
  if (e.dataTransfer.types.includes('application/x-loop-id') || 
      e.dataTransfer.types.includes('Files')) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }
}}
```

### 4. Timeline.tsx — also handle loop-id in handleDrop
If dropped on the timeline background (not a specific track lane), create a new sample track:
```typescript
const loopId = e.dataTransfer.getData('application/x-loop-id');
if (loopId) {
  // Load loop and create new sample track + clip
  // Similar to importAudioFile which creates a new track
}
```

## Files to Touch
1. `src/hooks/useAudioImport.ts` — add `importAudioBufferToTrack`
2. `src/components/timeline/TrackLane.tsx` — add loop-id drop handler + dragOver
3. `src/components/timeline/Timeline.tsx` — add loop-id fallback in handleDrop
4. Return `importAudioBufferToTrack` from the hook

## Verification
1. Open Loop Browser (O), drag "808 Boom" to Keyboard track lane → New clip appears
2. Open Loop Browser (O), drag "Walking Bass" to empty timeline area → New sample track + clip
3. Click play — hear the loop audio
4. `npm run build` passes 0 errors

## Build Check
- `npm run build` must pass 0 errors
- No unused imports
