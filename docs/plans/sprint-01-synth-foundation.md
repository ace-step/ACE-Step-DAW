# Sprint 01 — Synth Foundation

## User Stories

- As a producer, I want every instrument track to expose editable synth parameters, so that I can shape sounds instead of swapping only preset names.
- As a producer, I want subtractive and FM synth building blocks to behave like real DAW instruments, so that ACE-Step can cover bread-and-butter bass, lead, pad, and keys workflows.
- As an AI agent, I want synth state to be represented in the project store instead of hidden inside Tone instances, so that I can automate instrument design through `window.__store`.

## Problem

- Issues `#942 #943 #944 #945 #946 #953 #964` all describe expected baseline synth behavior, but the current app still treats instruments as a preset string plus a fixed Tone setup.
- The backlog mixes UI asks with engine asks, yet the real blocker is missing instrument state and routing primitives.

## Root Cause

- `src/types/project.ts:7-13` models instruments as `TrackType` plus a `SynthPreset` string, which cannot represent oscillator, filter, modulation, or engine-specific state.
- `src/engine/SynthEngine.ts:10-52` hardcodes six preset branches on `Tone.PolySynth(Tone.Synth)` and never persists parameter snapshots.
- `src/engine/SynthEngine.ts:66-139` caches one synth per track keyed only by preset, so changing a single parameter would currently require replacing the whole instance.
- `src/components/pianoroll/PianoRoll.tsx:122-155` and `src/components/pianoroll/PianoRoll.tsx:224-260` expose sampler config and editor toolbar state, but there is no synth editor surface or store-backed synth parameter UI.

## Solution

### Deliverables

- Introduce a track-level `instrument` model that separates engine kind from preset label.
- Add a subtractive synth schema with oscillator, amp envelope, filter, filter envelope, LFO, and unison settings.
- Add an FM synth schema with at least carrier/modulator ratio, level, waveform, and modulation index.
- Build a synth editor panel with visual envelope sections and collapsible advanced controls.
- Add preset snapshots backed by factory JSON plus IndexedDB user presets.

### Issue Map

- `#942` synth parameter editing baseline
- `#943` filter envelope
- `#944` routeable LFO
- `#945` unison/detune
- `#946` FM instrument
- `#953` preset browser/save/load
- `#964` visual synth editor

### Proposed PR Slices

1. `feat: add track instrument state model and migration`
   - extend `src/types/project.ts`
   - add store migration/helpers in `src/store/projectStore.ts`
   - expose agent-safe actions in `src/main.tsx`
2. `feat: add subtractive synth parameter engine and editor essentials`
   - update `src/engine/SynthEngine.ts`
   - add synth editor component under `src/components/pianoroll/`
   - support `#942` and `#943`
3. `feat: add LFO, unison, and FM engine support`
   - implement `#944 #945 #946`
   - add visual status/routing previews
4. `feat: add preset browser and user preset persistence`
   - implement `#953 #964`
   - ship factory preset JSON and IndexedDB user presets

## Verification

- `npx tsc --noEmit`
- `npm run build`
- `npx vitest run src/engine/__tests__/SynthEngine.test.ts src/store/__tests__/projectStore.test.ts`
- add E2E coverage:
  - create a piano-roll track
  - change oscillator, filter, envelope, and preset in UI
  - verify the same state through `window.__store.getState().project`
- manual workflow:
  - create Bass patch
  - duplicate track
  - switch duplicate to FM Bell
  - save and reload project
  - confirm both instruments restore correctly

## Files To Touch

- `docs/plans/sprint-01-synth-foundation.md`
- `src/types/project.ts`
- `src/store/projectStore.ts`
- `src/engine/SynthEngine.ts`
- `src/components/pianoroll/PianoRoll.tsx`
- `src/components/pianoroll/`
- `src/main.tsx`
- `src/services/` preset persistence helpers
- `tests/e2e/`
- `src/engine/__tests__/`
- `src/store/__tests__/`
