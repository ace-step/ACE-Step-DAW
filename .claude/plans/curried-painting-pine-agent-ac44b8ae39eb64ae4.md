# Fix "Add a Layer" Context Window Generation System

## Problem Summary

Four bugs in the context window system used by Add-a-Layer generation:

1. **Edit mode visualization wrong** — context window overlay only covers the generated clip's track, not all audible tracks
2. **Clip movement invalidates contextWindow** — absolute project times become stale after clip is moved
3. **Duplicate/copy inherits stale contextWindow** — copied clip at a new position references the original's context range
4. **First generation sometimes produces silence** — possible race with audio loading during context extraction

---

## Root Cause Analysis

### Bug 1: Missing trackIds in persisted contextWindow

`ClipGenerationParams.contextWindow` (line 626 of `src/types/project.ts`) stores only `{ startTime, endTime }`. When edit mode restores the context window at `AddLayerPanel.tsx` line 308-312, it hardcodes `trackIds: [track.id]`. The `extractContextAudio` function (line 65 of `contextAudioExtractor.ts`) already renders ALL audible tracks — the trackIds only affect the visual overlay on the timeline. So the audio is correct but the visualization is wrong.

### Bug 2: Absolute times in contextWindow

`generationParams.contextWindow` stores absolute project times. `updateClip`, `batchMoveClips`, and `moveClipToTrack` in `projectStore.ts` do not adjust `generationParams.contextWindow` when `startTime` changes. After a move, regeneration extracts context from the old position.

### Bug 3: Shallow spread in duplicateClip

`duplicateClip` at line 3919 spreads `...sourceClip` which shallow-copies `generationParams` (including `contextWindow`). The new clip at `sourceClip.startTime + sourceClip.duration` inherits absolute context times that point back to the original clip's region.

### Bug 4: Possible race in extractContextAudio

`extractContextAudio` loads audio blobs via `loadAudioBlobByKey`. If a clip's `isolatedAudioKey` references a blob that hasn't been fully written to storage yet (e.g., immediately after first generation in a session), `loadAudioBlobByKey` may return undefined, causing `anyScheduled` to remain false, returning null, which triggers the `forceSilence` path.

---

## Design: Store Context Window as Relative Offsets

### Key Insight

The context window has a fixed spatial relationship to the clip it generated. If the clip was generated at position 5s with a context window of [2s, 12s], the context starts 3s before the clip and ends 2s after the clip (assuming 5s clip duration). This relationship should be preserved regardless of where the clip moves.

### Approach: Store relative offsets + trackIds

Change `ClipGenerationParams.contextWindow` from absolute times to relative offsets plus the original trackIds:

```typescript
// In src/types/project.ts, line 626
contextWindow?: {
  /** Offset from clip.startTime to context start (typically negative) */
  offsetStart: number;
  /** Offset from clip.startTime to context end (typically positive) */
  offsetEnd: number;
  /** Track IDs for visualization overlay (all audible tracks at generation time) */
  trackIds: string[];
} | null;
```

At generation time (clip at position 5s, context [2s, 12s]):
- `offsetStart = 2 - 5 = -3` (context starts 3s before clip)
- `offsetEnd = 12 - 5 = 7` (context ends 7s after clip start)
- `trackIds = [all audible track IDs at generation time]`

To reconstruct absolute times: `startTime = clip.startTime + offsetStart`, `endTime = clip.startTime + offsetEnd`.

---

## Implementation Plan

### Step 1: Update the type definition

**File: `src/types/project.ts` (line 626)**

Change the `contextWindow` field in `ClipGenerationParams`:

```typescript
contextWindow?: {
  offsetStart: number;
  offsetEnd: number;
  trackIds: string[];
} | null;
```

### Step 2: Add a helper to resolve absolute times from relative offsets

**File: `src/services/generationPipeline.ts` (new helper near top)**

Add a utility function:

```typescript
function resolveContextWindow(
  clip: { startTime: number },
  saved: { offsetStart: number; offsetEnd: number; trackIds: string[] },
): { startTime: number; endTime: number; trackIds: string[] } {
  return {
    startTime: Math.max(0, clip.startTime + saved.offsetStart),
    endTime: clip.startTime + saved.offsetEnd,
    trackIds: saved.trackIds,
  };
}
```

Also add a helper to convert from absolute times to relative offsets (used at generation time):

```typescript
function toRelativeContextWindow(
  clipStartTime: number,
  absoluteCtx: { startTime: number; endTime: number },
  trackIds: string[],
): { offsetStart: number; offsetEnd: number; trackIds: string[] } {
  return {
    offsetStart: absoluteCtx.startTime - clipStartTime,
    offsetEnd: absoluteCtx.endTime - clipStartTime,
    trackIds,
  };
}
```

Export these helpers so they can be used from AddLayerPanel and other call sites.

### Step 3: Update `generateFromAddLayer` to save relative offsets + trackIds

**File: `src/services/generationPipeline.ts` (lines 1326-1354)**

When saving `generationParams.contextWindow`, convert from the absolute context window passed in `opts.contextWindow` to relative offsets. Capture audible trackIds from the project at generation time.

The `AddLayerOptions` interface (line 1292) passes `contextWindow: { startTime, endTime } | null`. Keep this interface as-is (it receives absolute times from the UI). The conversion happens inside `generateFromAddLayer`:

```typescript
// Capture audible track IDs for visualization
const audibleTrackIds = project.tracks
  .filter(t => !t.muted && (!soloActive || t.soloed))
  .map(t => t.id);

const relativeCtx = opts.contextWindow
  ? toRelativeContextWindow(opts.startTime, opts.contextWindow, audibleTrackIds)
  : null;

// Then use relativeCtx when saving to generationParams.contextWindow
```

For the edit-mode path (line 1322, `opts.clipId` branch) and new-clip path (line 1346), both should save `relativeCtx`.

The extraction call to `extractContextAudioLazy` still uses `opts.contextWindow` (absolute times) — no change needed there.

The `generateClipInternal` call at line 1374 also receives `opts.contextWindow` in absolute form — no change needed.

### Step 4: Update all regeneration paths to resolve relative offsets

**File: `src/services/generationPipeline.ts`**

In `regenerateClip` (line 197), `generateSingleClip` (line 342), and `runVariationClip` (line 1064):

Replace the pattern:
```typescript
const ctxWindow = clip?.generationParams?.contextWindow;
// ... uses ctxWindow.startTime, ctxWindow.endTime
```

With:
```typescript
const savedCtx = clip?.generationParams?.contextWindow;
const ctxWindow = (savedCtx && clip)
  ? resolveContextWindow(clip, savedCtx)
  : null;
```

The rest of the logic remains the same — `ctxWindow` now has `{ startTime, endTime }` in absolute terms, resolved from the clip's current position.

### Step 5: Fix Edit mode context window restoration (Bug 1)

**File: `src/components/generation/AddLayerPanel.tsx` (lines 307-312)**

Currently:
```typescript
if (params?.contextWindow) {
  useUIStore.getState().setContextWindow({
    startTime: params.contextWindow.startTime,
    endTime: params.contextWindow.endTime,
    trackIds: [track.id],  // BUG: only one track
  });
}
```

Change to resolve from relative offsets and use the stored trackIds:
```typescript
if (params?.contextWindow) {
  const resolved = resolveContextWindow(editingClip, params.contextWindow);
  useUIStore.getState().setContextWindow({
    startTime: resolved.startTime,
    endTime: resolved.endTime,
    trackIds: resolved.trackIds,  // FIX: use stored audible track IDs
  });
}
```

Also restore the `selectWindow` to match the clip's current position (around line 315-320 — wherever the select window is restored for edit mode):
```typescript
useUIStore.getState().setSelectWindow({
  startTime: editingClip.startTime,
  endTime: editingClip.startTime + editingClip.duration,
  trackIds: [track.id],
});
```

### Step 6: Fix duplicate clip inheriting stale contextWindow (Bug 3)

**File: `src/store/projectStore.ts`**

In `duplicateClip` (line 3904): Since the context window is now stored as relative offsets, it is automatically valid at any clip position. No adjustment needed — the spread `...sourceClip` copies `generationParams` with relative offsets, which resolve correctly against the new clip's `startTime`.

In `duplicateClipToTrack` (line 4746): Same logic — relative offsets remain valid.

**However**, there is a subtlety: if the user explicitly does NOT want the duplicate to inherit generation context (e.g., the duplicate is placed in a completely different section), we should clear `generationParams.contextWindow` when the resolved absolute context would fall entirely outside the project. This is a minor enhancement; the relative approach at minimum makes the context window "follow" the clip, which is the correct default.

### Step 7: Fix clip movement (Bug 2 — now automatically resolved)

**File: `src/store/projectStore.ts`**

Since context window is now stored as relative offsets, `updateClip`, `batchMoveClips`, and `moveClipToTrack` do NOT need any changes. The offsets remain valid because they're relative to `clip.startTime`, which is what gets updated.

No code changes needed in:
- `updateClip` (line 3784)
- `batchMoveClips` (line 4836)
- `moveClipToTrack` (line 4710)

### Step 8: Address first-generation silence (Bug 4)

**File: `src/services/contextAudioExtractor.ts`**

Add a small guard: if a clip has `generationStatus === 'ready'` and an `isolatedAudioKey` but `loadAudioBlobByKey` returns undefined/null, log a warning and skip (don't count it as scheduled). This is already the behavior — the `if (!blob) continue` at line 87 handles it.

The likely cause is that the first generation in a fresh session hasn't populated the blob store yet. The fix is in `generateFromAddLayer`:

**File: `src/services/generationPipeline.ts` (around line 1361-1372)**

Add a retry/wait mechanism for context extraction:

```typescript
if (opts.contextWindow) {
  contextBlob = await extractContextAudioLazy(opts.contextWindow, { trimToContext: true });
  
  // If extraction returned null but there are ready clips in the range,
  // wait briefly for blob storage to settle and retry once
  if (!contextBlob) {
    const hasReadyClips = project.tracks.some(t =>
      t.clips.some(c =>
        c.generationStatus === 'ready' &&
        c.isolatedAudioKey &&
        c.startTime < opts.contextWindow!.endTime &&
        (c.startTime + c.duration) > opts.contextWindow!.startTime
      )
    );
    if (hasReadyClips) {
      await new Promise(r => setTimeout(r, 500));
      contextBlob = await extractContextAudioLazy(opts.contextWindow, { trimToContext: true });
    }
  }
}
```

This addresses the race condition where blobs may not be fully flushed to storage.

### Step 9: Migration — handle old absolute-format contextWindow

**File: `src/services/generationPipeline.ts` (in resolveContextWindow or as a separate migration helper)**

Old clips stored `{ startTime, endTime }` without `offsetStart`/`offsetEnd`/`trackIds`. Add a migration check:

```typescript
function resolveContextWindow(
  clip: { startTime: number },
  saved: any, // could be old or new format
): { startTime: number; endTime: number; trackIds: string[] } {
  // New format: has offsetStart
  if ('offsetStart' in saved) {
    return {
      startTime: Math.max(0, clip.startTime + saved.offsetStart),
      endTime: clip.startTime + saved.offsetEnd,
      trackIds: saved.trackIds ?? [],
    };
  }
  // Legacy format: absolute { startTime, endTime }
  return {
    startTime: saved.startTime,
    endTime: saved.endTime,
    trackIds: [], // no trackIds stored — fall back to all audible tracks
  };
}
```

In `AddLayerPanel.tsx` edit-mode restoration, when `trackIds` is empty (legacy), fall back to all audible track IDs:

```typescript
const resolved = resolveContextWindow(editingClip, params.contextWindow);
const trackIds = resolved.trackIds.length > 0
  ? resolved.trackIds
  : project.tracks.filter(t => !t.muted).map(t => t.id);
```

### Step 10: Update handleGenerate in AddLayerPanel

**File: `src/components/generation/AddLayerPanel.tsx` (line 620 and 648)**

The `handleGenerate` callback passes `contextWindow` to `generateFromAddLayer`. Currently it strips trackIds:
```typescript
contextWindow: hasContext ? { startTime: contextWindow!.startTime, endTime: contextWindow!.endTime } : null,
```

This can stay as-is since `AddLayerOptions.contextWindow` is `{ startTime, endTime }` (absolute). The conversion to relative offsets happens inside `generateFromAddLayer` (Step 3).

Also for the direct `updateClip` path (edit mode, line 617-621), the generationParams should use the new format. However, since `generateFromAddLayer` already handles saving in both the edit and new paths, the direct `updateClip` at line 617-621 should be removed or consolidated — let `generateFromAddLayer` be the single place that writes `generationParams`.

Wait — looking more carefully, lines 614-622 handle the "Preview" save path (saving params without generating). That code directly writes `generationParams`. It needs to convert to relative format too. Import `toRelativeContextWindow` and use it there.

---

## File Change Summary

| File | Changes |
|------|---------|
| `src/types/project.ts` | Change `contextWindow` type in `ClipGenerationParams` to `{ offsetStart, offsetEnd, trackIds }` |
| `src/services/generationPipeline.ts` | Add `resolveContextWindow` and `toRelativeContextWindow` helpers; update `regenerateClip`, `generateSingleClip`, `runVariationClip`, `generateFromAddLayer` to use them; add retry logic for context extraction |
| `src/components/generation/AddLayerPanel.tsx` | Fix edit-mode context window restoration to use `resolveContextWindow` with stored trackIds; fix direct param save path to use relative format |
| `src/services/contextAudioExtractor.ts` | No changes needed (already handles all audible tracks) |
| `src/store/projectStore.ts` | No changes needed (relative offsets make moves safe automatically) |

---

## Testing Strategy

1. **Unit tests for resolveContextWindow and toRelativeContextWindow** — round-trip: save, move clip, resolve, verify absolute times track the new position
2. **Unit test for legacy migration** — old `{ startTime, endTime }` format resolves correctly
3. **Integration: generate with context, move clip, regenerate** — verify context extraction uses new position
4. **Integration: duplicate clip, verify context follows** — duplicate at new position should extract context around its own position
5. **Integration: edit mode** — double-click generated clip, verify context overlay spans all audible tracks
6. **Regression: non-context generation** — verify clips without contextWindow still generate normally

---

## Risks and Mitigations

1. **Breaking serialized projects** — Legacy migration (Step 9) handles old format gracefully with a type guard (`'offsetStart' in saved`). Old projects continue to work with absolute fallback.

2. **TrackIds becoming stale** — Stored trackIds may reference deleted tracks. In edit-mode restoration, filter against current project tracks. This is a visualization-only concern.

3. **Context window extending past project bounds** — `resolveContextWindow` already clamps `startTime` to `Math.max(0, ...)`. Could also clamp `endTime` to project duration, though `extractContextAudio` naturally handles out-of-range by finding no overlapping clips.
