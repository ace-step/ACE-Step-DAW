# Fix Generated Audio Clip Fade Affordance

## User Stories
- As a human user, I want a newly generated audio clip to open without visible fade handles at both edges, so that I can immediately resize or stretch the clip without fighting extra controls.
- As an AI agent, I want zero-fade audio clips to expose only resize affordances by default, so that browser automation and `window.__store` actions do not confuse fade editing with clip-edge resizing.

## Problem
- Newly ready audio clips render fade-in and fade-out handles on both sides even when `fadeInDuration` and `fadeOutDuration` are unset or zero.
- This creates a misleading "pre-faded" look and puts fade controls in the same edge region as clip-resize interactions.

## Root Cause
- [`src/components/timeline/ClipBlock.tsx`](../../src/components/timeline/ClipBlock.tsx) always renders both fade handle sliders for every ready audio clip.
- The clip creation paths do not assign default fade durations, so the unwanted affordance is a presentation bug rather than persisted clip state.

## Solution
- Update `ClipBlock` so fade handles render only when that side already has a non-zero fade duration.
- Keep fade overlays and fade editing behavior intact for clips that actually have fades.
- Update unit and E2E coverage to assert that zero-fade clips do not expose fade sliders by default, while clips with active fades still do.

## Verification
- `npx vitest run tests/unit/clipFadeHandles.test.tsx tests/unit/clipResizeAndFadeVisuals.test.tsx`
- `npm run test:e2e -- tests/e2e/clip-fades.spec.ts`
- `npx tsc --noEmit`
- `npm run build`
- Browser workflow: create a project, generate or seed a ready audio clip, verify no fade handles appear on a zero-fade clip, then seed a fade in store state and verify the handle/overlay appear.

## Files To Touch
- `docs/plans/fix-generated-audio-clip-fade-affordance.md`
- `src/components/timeline/ClipBlock.tsx`
- `tests/unit/clipFadeHandles.test.tsx`
- `tests/unit/clipResizeAndFadeVisuals.test.tsx`
- `tests/e2e/clip-fades.spec.ts`
