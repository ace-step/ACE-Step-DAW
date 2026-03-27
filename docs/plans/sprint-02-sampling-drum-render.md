# Sprint 02 — Sampling, Drum Rack, and Render Pipeline

## User Stories

- As a producer, I want sampler instruments to use realistic zones, slices, and warp behavior, so that browser-based playback does not feel like a toy pitch shifter.
- As a beat-maker, I want the drum machine to accept my own samples and pad-level shaping, so that I can build real kits instead of only choosing four synthesized kits.
- As a producer and AI agent, I want freeze and bounce workflows to reduce CPU while preserving reversibility, so that large projects stay stable.

## Problem

- Issues `#948 #949 #950 #951 #952 #958 #961` all sit on the same missing platform: the app has one-sample playback, synthesized drum pads, and partial bounce primitives, but not a general sample-instrument architecture.

## Root Cause

- `src/types/project.ts:57-81` only supports a single `SamplerConfig` buffer with trim and ADSR, and `src/types/project.ts:96-108` only gives each drum pad `sampleKey`, `volume`, and `pan`.
- `src/engine/SamplerEngine.ts:81-220` manages one `AudioBuffer` per track and derives pitch purely from `playbackRate`, which blocks multi-zone, velocity-layer, slice, and pitch-independent stretch workflows.
- `src/engine/DrumEngine.ts:46-220` constructs every drum sound from fixed Tone synth factories instead of per-pad instrument descriptors and effect chains.
- `src/store/projectStore.ts:2292-2385` exposes `freezeTrack`, `unfreezeTrack`, `flattenTrack`, and `bounceInPlace`, but the state model and UX stop short of a complete freeze/unfreeze workflow.
- `src/components/sequencer/DrumMachineEditor.tsx:170-260` only exposes kit selection and per-pad volume details, not sample loading, tuning, or pad processing.

## Solution

### Deliverables

- Replace the single-buffer sampler model with zone-based sampler definitions.
- Add velocity layers, round-robin, and slice maps that remain scriptable through the store.
- Add per-pad sample mode, tune, envelope, filter, drive, and send state to the drum machine.
- Add pitch-independent time stretch and warp markers for sampler clips and slices.
- Complete track freeze/unfreeze/bounce UX on top of the existing offline render hooks.

### Issue Map

- `#948` multi-sample zones
- `#949` user sample loading on pads
- `#950` per-pad effects and tuning
- `#951` velocity layers and crossfading
- `#952` audio slice mode
- `#958` warp/time-stretch
- `#961` freeze/bounce track to audio

### Proposed PR Slices

1. `feat: add sampler zone model and engine migration`
   - zone schema, velocity ranges, round-robin
2. `feat: add drum pad sample mode and per-pad shaping`
   - sample loading, choke groups, pad filter/drive/send
3. `feat: add slice mode and warp-ready sample UI`
   - transient slicing, manual slices, warp marker model
4. `feat: add freeze-unfreeze workflow and render progress`
   - full `#961` UX, store actions, browser tests

## Verification

- `npx tsc --noEmit`
- `npm run build`
- `npx vitest run src/services/__tests__/bounceInPlace.test.ts src/store/__tests__/drumMachine.test.ts`
- add new unit coverage:
  - sampler zone selection by pitch and velocity
  - slice-to-MIDI mapping
  - freeze/unfreeze persistence
- browser workflows:
  - drag a sample onto a drum pad, trigger it, reload project
  - load a sample into sampler, create slices, trigger them from piano roll
  - freeze a synth track, confirm CPU-saving audio playback, unfreeze it

## Files To Touch

- `docs/plans/sprint-02-sampling-drum-render.md`
- `src/types/project.ts`
- `src/store/projectStore.ts`
- `src/engine/SamplerEngine.ts`
- `src/engine/DrumEngine.ts`
- `src/components/pianoroll/QuickSamplerEditor.tsx`
- `src/components/sequencer/DrumMachineEditor.tsx`
- `src/components/pianoroll/`
- `src/hooks/useTransport.ts`
- `src/services/bounceInPlace.ts`
- `src/services/audioFileManager.ts`
- `tests/e2e/`
- `src/store/__tests__/`
