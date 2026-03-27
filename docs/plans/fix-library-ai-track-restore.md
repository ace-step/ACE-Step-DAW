## User stories

- As a human user, I want dragging a generated Library asset back into the arrangement to recreate its original AI audio track, so that deleting the source track does not break my workflow.
- As an AI agent, I want generated Library assets to preserve enough origin metadata to restore the original track shape programmatically, so that drag-and-drop and `window.__store` flows remain deterministic.

## Problem

- Dragging a generated asset from Library into an empty timeline area currently creates a Quick Sampler / piano roll track instead of a generated audio track.
- After the original generated track is deleted, the Library asset no longer has enough persisted metadata to recreate the original AI track type or clip metadata.

## Root cause

- Empty-timeline asset drops in `src/components/timeline/Timeline.tsx` unconditionally call `importAssetAsQuickSampler(assetId)`.
- `AssetClip` in `src/types/project.ts` only stores a shallow audio summary, and the asset upsert logic in `src/store/projectStore.ts` only persists prompt/audio keys/waveform/duration, not the originating track/clip metadata.
- `importAssetToTrack` in `src/hooks/useAudioImport.ts` can recreate audio on an existing track, but there is no helper for recreating a new generated track from persisted asset metadata.

## Solution

1. Extend `AssetClip` with optional origin snapshots for the source track and source clip.
2. Capture those snapshots whenever a clip reaches `ready`, preserving generated-track metadata needed for later restoration.
3. Backfill missing origin snapshots during project load when the source track/clip still exists, so older projects can recover without re-generating audio.
4. Add a project-store restoration helper that creates a new track from the persisted snapshot and rehydrates the generated clip at the drop position.
5. Route empty-timeline Library asset drops through the new restoration helper for generated assets, while keeping the existing Quick Sampler fallback for uploaded assets and older assets with no snapshot.

## Verification

- `npx tsc --noEmit`
- Targeted Vitest coverage for:
  - asset snapshot persistence when generated clips become ready
  - restoring a generated Library asset into a new track after deleting the original track
  - empty-timeline asset drops using the restoration path instead of Quick Sampler for generated assets

## Files to touch

- `docs/plans/fix-library-ai-track-restore.md`
- `src/types/project.ts`
- `src/store/projectStore.ts`
- `src/hooks/useAudioImport.ts`
- `src/components/timeline/Timeline.tsx`
- `src/store/__tests__/projectStore.test.ts`
- `src/components/timeline/__tests__/TimelineAssetDrop.test.tsx`
