# QA Audit — GitHub Issues to File

> Generated from systematic QA audit on 2026-04-08 against commit `33defc00` (latest main).
> All findings verified via code review, `npx tsc --noEmit` (0 errors), and `vitest --run --pool=forks` (6965/6965 pass).

---

## Issue 1: fix: duplicate keyboard shortcut handlers create dead code

**Labels:** `bug`, `priority: P2`

### Description

Three transport keyboard shortcuts are registered **twice** in the same handler function, creating unreachable dead code.

**File:** `src/hooks/useKeyboardShortcuts.ts`

| Shortcut | First registration | Duplicate (unreachable) |
|---|---|---|
| `transport.stop` | line 546 | line 558 |
| `transport.loop` | lines 547-551 | lines 559-563 |
| `transport.metronome` | line 552 | line 564 |

Since each first handler calls `return`, the second set (lines 558-564) is **unreachable dead code**. This is not a runtime bug, but indicates a copy-paste error and creates maintenance confusion — a developer might edit the wrong copy.

### Acceptance Criteria

- [ ] Remove the duplicate block at lines 558-564
- [ ] Unit test confirms transport shortcuts still work (stop, loop toggle, metronome toggle)
- [ ] No other duplicate shortcut registrations exist in the file

### Suggested Fix

Delete lines 558-564 (the duplicate `transport.stop`, `transport.loop`, `transport.metronome` block).

---

## Issue 2: fix: cross-model variation generation silently swallows individual errors

**Labels:** `bug`, `priority: P1`

### Description

In cross-model variation generation mode, when `generateClip()` throws an exception, the error is caught but **no user-facing feedback is provided** and the variation's status is never updated to `'error'`.

**File:** `src/services/generationPipeline.ts`

**The bug (lines 495-498):**
```typescript
try {
  const outcome = await generateClip(clipId, null, { ... });
  outcomes.push({ status: 'fulfilled', value: outcome });
} catch (err) {
  outcomes.push({ status: 'rejected', reason: err });  // No updateVariation call!
}
```

**Contrast with the model-switch error path (lines 469-477)** which correctly calls:
```typescript
useGenerationStore.getState().updateVariation(index, {
  status: 'error',
  error: `Model switch failed: ${errorMsg}`,
  completedAt: Date.now(),
});
```

**Impact:**
1. The variation stays in `'generating'` or `'pending'` state forever in the UI
2. No error toast is shown to the user for that specific variation
3. Line 550 checks `result.status === 'fulfilled'` — rejected results silently cause overall `false` return with no granular feedback

### Acceptance Criteria

- [ ] When `generateClip()` throws in cross-model mode, the variation is marked `status: 'error'` with the error message
- [ ] User sees per-variation error feedback in the UI
- [ ] Unit test: cross-model generation with a failing clip shows error status on the failed variation

### Suggested Fix

In the catch block at line 496, add before the `outcomes.push`:
```typescript
const errorMsg = err instanceof Error ? err.message : String(err);
useGenerationStore.getState().updateVariation(index, {
  status: 'error',
  error: errorMsg,
  completedAt: Date.now(),
});
```

---

## Issue 3: fix: variation session completion reads stale Zustand state in forEach loop

**Labels:** `bug`, `priority: P2`

### Description

After all variations complete, the code reads `currentSession` from Zustand `getState()` and iterates its `variations` array while calling `updateVariation()` inside the loop. Each `updateVariation()` call triggers a `set()` that replaces the session object, but the `forEach` loop continues iterating the **stale** `currentSession` reference.

**File:** `src/services/generationPipeline.ts`, lines 535-548

```typescript
const currentSession = useGenerationStore.getState().variationSession;  // snapshot
if (currentSession?.id === sessionId && currentSession.status === 'generating') {
  const allTerminal = currentSession.variations.every(...);
  if (allTerminal) {
    currentSession.variations.forEach((variation) => {  // iterating stale snapshot
      if ((variation.status === 'done' || variation.status === 'error') && variation.completedAt) return;
      if (variation.status === 'done' || variation.status === 'error') {
        useGenerationStore.getState().updateVariation(variation.index, { completedAt: Date.now() });
        // ^^^ This set() replaces the session, but forEach still reads old variation objects
      }
    });
  }
}
```

**Impact:** The `completedAt` check on line 542 reads from the stale snapshot, so if `updateVariation` for variation 0 sets `completedAt`, variation 1's check still sees the old data. This causes redundant `updateVariation` calls but not data loss.

### Acceptance Criteria

- [ ] Completion timestamp logic doesn't issue redundant store updates
- [ ] Either batch all updates or re-read state each iteration

### Suggested Fix

Collect indices that need `completedAt`, then batch-update:
```typescript
const needsTimestamp = currentSession.variations
  .filter(v => (v.status === 'done' || v.status === 'error') && !v.completedAt)
  .map(v => v.index);
for (const idx of needsTimestamp) {
  useGenerationStore.getState().updateVariation(idx, { completedAt: Date.now() });
}
```

---

## Issue 4: fix: unsafe history rollback in consolidateClips error handler

**Labels:** `bug`, `priority: P2`

### Description

In the `consolidateClips` error handler, the code attempts to undo a previously pushed history entry by directly popping the module-level history array. This mutation is fragile and can leave history out of sync with project state.

**File:** `src/store/projectStore.ts`, line 5171

```typescript
} catch (error) {
  _history.arrangement[GLOBAL_HISTORY_BUCKET]?.pop();  // Direct mutation + optional chaining
  toastError(error instanceof Error ? error.message : 'Unable to consolidate the selected audio clips');
  return undefined;
}
```

**Issues:**
1. Uses optional chaining `?.pop()` — if the bucket is undefined, the rollback silently fails
2. If `_pushHistory` succeeded but `set()` hasn't been called yet (the error occurs mid-consolidation), popping leaves history in sync. But if the error occurs after a partial `set()`, history may be out of sync
3. No validation that the popped entry matches what was pushed

### Acceptance Criteria

- [ ] Error in consolidateClips correctly rolls back the history entry
- [ ] History state is consistent after a failed consolidation
- [ ] Unit test: consolidation failure doesn't corrupt undo history

### Suggested Fix

Store a reference to the pushed entry and validate before popping:
```typescript
const bucket = _history.arrangement[GLOBAL_HISTORY_BUCKET];
if (bucket && bucket.length > 0 && bucket[bucket.length - 1].label === 'Consolidate clips') {
  bucket.pop();
}
```

---

## Issue 5: fix: setActiveVariation doesn't verify clip existence before muting

**Labels:** `bug`, `priority: P2`

### Description

`setActiveVariation()` iterates all variation clips and calls `projState.updateClip(variation.clipId, { muted: shouldMute })` without checking if the clip still exists in the project. If a user deletes a variation clip while a session is active, the mute state becomes inconsistent.

**File:** `src/store/generationStore.ts`, lines 1087-1095

```typescript
for (const variation of s.variationSession.variations) {
  if (!variation.clipId) continue;
  const shouldMute = variation.index !== clamped;
  projState.updateClip(variation.clipId, { muted: shouldMute });
  // ^^^ No check if clipId still exists in the project
}
```

**Impact:**
- If a clip was deleted, `updateClip` is a no-op (the track.clips.map won't find it)
- But the variation still references a non-existent clip, and other variations may not be properly unmuted
- Edge case: user deletes active variation clip, then switches to another — the deleted clip's mute state is never applied, but the new active one IS unmuted correctly. Not catastrophic, but inconsistent.

### Acceptance Criteria

- [ ] Add existence check before calling `updateClip`
- [ ] Handle the case where a variation's clip has been deleted (mark variation as invalid or skip gracefully)

### Suggested Fix

```typescript
for (const variation of s.variationSession.variations) {
  if (!variation.clipId) continue;
  if (!projState.getClipById(variation.clipId)) continue;  // Skip deleted clips
  const shouldMute = variation.index !== clamped;
  projState.updateClip(variation.clipId, { muted: shouldMute });
}
```

---

## Issue 6: refactor: migrate from deprecated ScriptProcessorNode to AudioWorkletNode

**Labels:** `enhancement`, `priority: P3`

### Description

The native DSP adapter uses the deprecated `createScriptProcessor()` Web Audio API. This API is marked for removal from browsers, has worse performance (runs on the main thread), and higher latency than AudioWorkletNode.

**File:** `src/engine/dsp/NativeAdapter.ts`, line 285-296

The existing TODO comment at line 285 acknowledges this:
> "TODO: Migrate from deprecated ScriptProcessorNode to AudioWorkletNode once AudioWorklet pipeline is fully wired (Phase 5 DspWorkerHost)."

**Affected effects:** NativeReverb, NativeChorus, and any other effects using `createScriptProcessor`.

### Acceptance Criteria

- [ ] All `createScriptProcessor` calls replaced with AudioWorkletNode
- [ ] DSP processing runs off the main thread
- [ ] Audio quality and latency are equivalent or better
- [ ] Existing effect parameters (decay, wet/dry, etc.) continue to work

---

## Issue 7: fix: NativeSynths parseDuration defaults to BPM=120 ignoring project tempo

**Labels:** `bug`, `priority: P2`

### Description

The `parseDuration()` function in NativeSynths defaults to `bpm = 120` when parsing Tone.js-style duration notation ('8n', '4n', '2n'). It does not read the actual project BPM from the transport store.

**File:** `src/engine/dsp/NativeSynths.ts`, lines 97-107

```typescript
// TODO: Thread actual project BPM from transport store into synth callers
function parseDuration(dur: number | string, _ctx: AudioContext, bpm = 120): number {
  if (typeof dur === 'number') return dur;
  const match = dur.match(/^(\d+)n$/);
  if (match) {
    return 60 / bpm * (4 / parseInt(match[1], 10));
  }
  return parseFloat(dur) || 0.25;
}
```

**Impact:** When project BPM is anything other than 120, synth note durations ('8n' = eighth note, '4n' = quarter note) will be calculated at 120 BPM instead of the actual tempo. At BPM 60, an eighth note should be 0.5s but will be 0.25s. At BPM 180, it should be 0.167s but will be 0.25s.

### Acceptance Criteria

- [ ] `parseDuration` receives the actual project BPM
- [ ] Synth note durations match the project tempo
- [ ] Unit test: parseDuration at different BPMs produces correct durations

### Suggested Fix

Thread BPM from the transport store through the synth callers. Update call sites to pass `useTransportStore.getState().bpm` (or the project BPM from the project store).

---

## Issue 8: fix: test suite hangs with default Vitest thread pool

**Labels:** `bug`, `dx`, `priority: P1`

### Description

Running `npm test` (which uses `npx vitest --run`) hangs indefinitely with the default thread pool. Tests only complete successfully when using the `--pool=forks` flag.

**Observed behavior:**
- Default pool: hangs after 300+ seconds, no test results
- `--pool=forks`: all 6965 tests pass in ~258 seconds across 601 test files

This affects developer experience and CI reliability. The hang likely indicates a shared-state issue or unresolved async operation in one or more test files that prevents worker thread cleanup.

### Acceptance Criteria

- [ ] `npm test` completes reliably without hanging
- [ ] Either add `pool: 'forks'` to `vitest.config.ts` or identify and fix the hanging tests
- [ ] CI pipeline runs tests reliably

### Suggested Fix

**Quick fix:** Add `pool: 'forks'` to `vitest.config.ts`:
```typescript
export default defineConfig({
  test: {
    pool: 'forks',
    // ...existing config
  },
});
```

**Better fix:** Identify which test file(s) cause the hang by running tests in batches with the default pool, then fix the underlying async cleanup issue.

---

## Issue 9: fix: large production bundle chunks exceed 500KB warning threshold

**Labels:** `enhancement`, `performance`, `priority: P3`

### Description

Two production chunks are significantly oversized, impacting initial page load time:

| Chunk | Size | Gzipped |
|---|---|---|
| `index-BIANE09c.js` | 1,255 KB | 302 KB |
| `index-Dpv_VUVj.js` | 1,904 KB | 526 KB |

Vite's default warning threshold is 500 KB. Total uncompressed JS: ~4.6 MB.

### Acceptance Criteria

- [ ] No chunk exceeds 500 KB after minification
- [ ] Heavy dependencies (Tone.js, xterm, etc.) are in separate chunks
- [ ] Lazy-loaded features use `React.lazy()` + dynamic `import()`
- [ ] Initial page load time is not degraded

### Suggested Fix

1. Configure `build.rollupOptions.output.manualChunks` in `vite.config.ts` to split Tone.js, xterm, and other large libs
2. Add `React.lazy()` for heavy feature panels (PianoRoll, VideoExport, etc.)
3. Consider using `import()` for the WASM module

---

## Issue 10: fix: ModelLibraryPanel tests produce React act() warnings

**Labels:** `bug`, `test`, `priority: P3`

### Description

The ModelLibraryPanel test file produces multiple React `act()` warnings during test execution:

```
An update to ModelLibraryPanel inside a test was not wrapped in act(...).
```

**File:** `src/components/models/__tests__/ModelLibraryPanel.test.tsx`

While all tests pass, these warnings indicate asynchronous state updates are happening outside the test's synchronous flow. This can lead to flaky tests and masks potential timing issues.

### Acceptance Criteria

- [ ] No `act()` warnings during ModelLibraryPanel test execution
- [ ] Tests still pass and cover the same scenarios
- [ ] Use `waitFor()` or `act()` wrappers for async state updates

### Suggested Fix

Wrap state-triggering operations in `act()` blocks or use `waitFor()` from `@testing-library/react`:
```typescript
await waitFor(() => {
  expect(screen.getByText('Model Name')).toBeInTheDocument();
});
```

---

## Summary

| # | Title | Severity | Label |
|---|-------|----------|-------|
| 1 | Duplicate keyboard shortcut handlers (dead code) | P2 | bug |
| 2 | Cross-model variation errors silently swallowed | P1 | bug |
| 3 | Variation session completion reads stale state | P2 | bug |
| 4 | Unsafe history rollback in consolidateClips | P2 | bug |
| 5 | setActiveVariation doesn't verify clip existence | P2 | bug |
| 6 | Deprecated ScriptProcessorNode usage | P3 | enhancement |
| 7 | parseDuration ignores project BPM | P2 | bug |
| 8 | Test suite hangs without --pool=forks | P1 | bug, dx |
| 9 | Large production bundle chunks | P3 | enhancement |
| 10 | ModelLibraryPanel act() warnings | P3 | bug, test |
