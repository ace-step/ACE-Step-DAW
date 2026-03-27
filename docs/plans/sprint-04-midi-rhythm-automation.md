# Sprint 04 — MIDI, Rhythm, and Automation Editors

## User Stories

- As a composer, I want piano-roll editing tools that feel musical instead of merely technical, so that note editing stays fast.
- As a beat-maker, I want Elektron-style step detail and probability controls, so that the drum workflow moves beyond an on/off grid.
- As a producer, I want automation to support recording, drawing, and modulation tools, so that parameter movement is part of composition instead of an afterthought.

## Problem

- Issues `#967 #968 #973` are editor issues, but the shared blocker is that note, step, and automation data are all modeled too simply for advanced interactions.

## Root Cause

- `src/components/pianoroll/PianoRoll.tsx:27-120` keeps ghost-note visibility and editor mode state locally and does not derive scale-aware behavior from project harmony.
- `src/components/pianoroll/PianoRollCanvas.tsx:178-238` supports note creation and chord stamping, but the drag model is single-note focused and lacks native operations for humanize, legato, strum, and multi-note stretch.
- `src/components/pianoroll/VelocityLane.tsx:19-99` only draws velocity bars; it does not own an interactive editing model for painted velocity curves.
- `src/engine/DrumEngine.ts:11-27` keeps drum steps to `active` plus `velocity`, which cannot represent probability, micro-timing, ratchets, or per-step parameter locks.
- `src/components/timeline/AutomationLaneView.tsx:37-165` renders a simple polyline editor with draggable points but no recording modes, tool palette, curve handles, or automation-arm state.

## Solution

### Deliverables

- Extend piano-roll actions with scale highlight, lock-to-scale, velocity painting, quantize strength, legato, humanize, strum, and multi-note stretch.
- Extend step data with probability, micro-timing, pitch offset, ratchet, and step-length metadata.
- Add automation editor tool state, recording-arm state, curve handles, LFO tool generation, and copy/paste flows.

### Issue Map

- `#967` piano-roll UX
- `#968` drum machine step UX
- `#973` automation recording and toolset

### Proposed PR Slices

1. `feat: add piano-roll scale, velocity, and transform tools`
2. `feat: add drum step metadata and Elektron-style editing`
3. `feat: add automation arm, draw tools, and LFO generation`

## Verification

- `npx tsc --noEmit`
- `npm run build`
- `npx vitest run src/store/__tests__/drumMachine.test.ts src/store/__tests__/projectStore.test.ts`
- add new unit coverage:
  - quantize-strength math
  - legato and humanize transforms
  - step probability and micro-timing evaluation
  - automation curve and LFO tool generation
- browser workflows:
  - create chord notes, apply strum, paint velocity, legato them
  - build a drum pattern with step probability and ratchets
  - arm a filter parameter and record automation while transport plays

## Files To Touch

- `docs/plans/sprint-04-midi-rhythm-automation.md`
- `src/types/project.ts`
- `src/store/projectStore.ts`
- `src/components/pianoroll/PianoRoll.tsx`
- `src/components/pianoroll/PianoRollCanvas.tsx`
- `src/components/pianoroll/VelocityLane.tsx`
- `src/components/sequencer/`
- `src/engine/DrumEngine.ts`
- `src/components/timeline/AutomationLaneView.tsx`
- `src/store/__tests__/`
- `tests/e2e/`
