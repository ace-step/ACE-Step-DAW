# Sprint 05 — Arrangement and Recording Workflows

## User Stories

- As a producer, I want clip operations and take comping directly on the arrangement, so that editing audio feels like a real DAW workflow.
- As a vocalist or instrumentalist, I want punch ranges, visual count-in, latency feedback, and comp lanes, so that recording sessions are trustworthy.
- As an AI agent, I want arrangement editing and record-state transitions to be explicit store actions, so that end-to-end browser tests can validate them without canvas-only gestures.

## Problem

- Issues `#966` and `#972` both depend on a more deliberate arrangement interaction model. The code already contains pieces of take-lane and punch logic, but the user-facing flow is incomplete.

## Root Cause

- `src/components/timeline/Timeline.tsx:208-260` focuses on viewport, selection, and drag windows rather than clip-operation commands such as split, duplicate, loop, reverse, and comp actions.
- `src/hooks/useRecording.ts:64-117` and `src/hooks/useRecording.ts:119-201` already accumulate loop and punch takes, but the workflow ends at saving clips and toggling take-lane visibility.
- `src/engine/RecordingEngine.ts:25-169` captures device, monitoring, and level-meter state, but does not expose latency reporting, pre-roll, tuner state, or input clip warnings as a dedicated recording surface.
- `src/store/projectStore.ts:2292-2385` contains freeze/flatten/bounce primitives that can support arrangement clip ops, yet clip-operation shortcuts and comp editing are not organized around those primitives.

## Solution

### Deliverables

- Add arrangement clip commands for split, duplicate, loop, reverse, fade handles, and crossfade behavior.
- Build a recording panel or transport extensions for punch-in/out, pre-roll, latency display, count-in visuals, tuner, and input clip warnings.
- Complete take-lane selection and comp editing on arrangement tracks.

### Issue Map

- `#966` timeline clip operations
- `#972` recording UX

### Proposed PR Slices

1. `feat: add arrangement clip operations and shortcuts`
2. `feat: add punch, pre-roll, latency, and visual count-in`
3. `feat: add take-lane comp editing and recording polish`

## Verification

- `npx tsc --noEmit`
- `npm run build`
- `npx vitest run src/store/__tests__/toggleClipMuted.test.ts src/store/__tests__/splitClipAtZeroCrossing.test.ts`
- add new unit coverage:
  - clip split/duplicate/loop actions
  - punch-range clip placement
  - take comp selection
- browser workflows:
  - split and duplicate clips from keyboard shortcuts
  - record with punch-in/out and visual count-in
  - create loop takes and comp the best parts on take lanes

## Files To Touch

- `docs/plans/sprint-05-arrangement-recording.md`
- `src/store/projectStore.ts`
- `src/hooks/useRecording.ts`
- `src/engine/RecordingEngine.ts`
- `src/components/timeline/Timeline.tsx`
- `src/components/timeline/TrackLane.tsx`
- `src/components/timeline/ClipBlock.tsx`
- `src/components/layout/Toolbar.tsx`
- `src/components/tracks/TrackHeader.tsx`
- `src/store/__tests__/`
- `tests/e2e/`
