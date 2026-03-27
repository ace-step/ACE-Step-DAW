# Sprint 08 — Advanced Sound Design Lab

## User Stories

- As a sound designer, I want wavetable, granular, physical, additive, and spectral engines, so that ACE-Step can move beyond “browser DAW” expectations and become distinctive.
- As an expressive performer, I want MPE and a modulation matrix, so that per-note motion and controller input can shape advanced engines naturally.
- As an AI agent, I want advanced sound engines to reuse the same instrument and modulation model from earlier sprints, so that automation and preset generation remain coherent.

## Problem

- Issues `#947 #954 #955 #956 #960 #962 #963` are the most differentiated features in the backlog, but they should not land until the core synth, sampler, and routing layers are stable.

## Root Cause

- `src/engine/SynthEngine.ts:10-139` currently assumes `Tone.Synth` or simple preset playback and has no engine plug-in boundary for wavetable or physical modeling voices.
- `src/types/project.ts:9-18` and `src/types/project.ts:113-124` lack engine-specific instrument schemas and per-note expression metadata.
- `src/engine/EffectsEngine.ts:97-247` handles simple Tone node chains, but there is no AudioWorklet DSP layer for granular or spectral processors.
- `src/main.tsx:22-92` exposes store state to agents, yet there is no advanced modulation bus or per-note expression surface for those agents to target.

## Solution

### Deliverables

- Add a pluggable instrument-engine boundary on top of Sprint 01’s track instrument state.
- Add a modulation matrix and per-note expression model that can be shared by wavetable and MPE-enabled engines.
- Implement advanced DSP engines in an AudioWorklet-backed layer where real-time FFT or grain scheduling is required.

### Issue Map

- `#947` wavetable
- `#954` granular
- `#955` physical modeling
- `#956` modulation matrix
- `#960` MPE
- `#962` additive
- `#963` spectral processing

### Proposed PR Slices

1. `feat: add modulation matrix and wavetable engine`
2. `feat: add granular and physical-modeling instruments`
3. `feat: add additive and spectral processor surfaces`
4. `feat: add MPE and per-note expression UI`

## Verification

- `npx tsc --noEmit`
- `npm run build`
- add new unit coverage:
  - modulation routing math
  - wavetable frame selection
  - MPE channel allocation
  - spectral processor serialization
- browser workflows:
  - load wavetable patch and modulate position with LFO
  - play granular instrument from a loaded sample
  - record MPE gestures and verify per-note expression state

## Files To Touch

- `docs/plans/sprint-08-advanced-sound-design.md`
- `src/types/project.ts`
- `src/store/projectStore.ts`
- `src/engine/SynthEngine.ts`
- `src/engine/`
- `src/components/pianoroll/`
- `src/components/mixer/`
- `src/main.tsx`
- `src/services/`
- `src/engine/__tests__/`
- `tests/e2e/`
