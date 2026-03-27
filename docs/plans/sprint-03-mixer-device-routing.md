# Sprint 03 — Mixer, Device Graph, and Routing

## User Stories

- As a mixer, I want channel strips and device chains to expose real routing, metering, and insert behavior, so that I can mix inside ACE-Step without treating the mixer as a placeholder.
- As a producer, I want routing-heavy effects such as convolution reverb and sidechain ducking, so that modern mix workflows are possible.
- As an AI agent, I want device parameters and routing choices to exist in store state, so that automated mix flows can modify them safely.

## Problem

- Issues `#957 #959 #965 #969` look separate, but they are all symptoms of one limitation: there is no unified device graph between the effect model, mixer surface, and audio routing layer.

## Root Cause

- `src/components/mixer/MixerPanel.tsx:12-18` caps inserts and sends at four and two, and `src/components/mixer/MixerPanel.tsx:144-247` renders fixed sections without I/O routing, dB markings, or advanced metering.
- `src/components/mixer/EffectChain.tsx:51-141` encodes effect presets inline and `src/components/mixer/EffectChain.tsx:171-279` renders a basic device card row without rack nesting, A/B states, preset library, or searchable add flow.
- `src/engine/EffectsEngine.ts:97-227` builds linear Tone node chains, ships only algorithmic reverb, and has no first-class effect-rack or sidechain input abstraction.
- `src/engine/EffectsEngine.ts:233-247` rebuilds a single linear chain per track, which is insufficient for parallel racks, convolution branches, and visual routing feedback.

## Solution

### Deliverables

- Introduce a track device graph abstraction that supports serial and parallel chains.
- Upgrade channel strips with RMS plus peak metering, dB scale, insert management, pre/post sends, solo-safe, and simple I/O routing.
- Rebuild the device chain UX with searchable add, collapse, reorder, preset persistence, and rack containers.
- Add convolution reverb and sidechain routing as first-class graph nodes.

### Issue Map

- `#957` convolution reverb
- `#959` sidechain routing UI
- `#965` pro-grade mixer panel
- `#969` device-view redesign

### Proposed PR Slices

1. `feat: add mixer meter upgrade and channel-strip state`
   - RMS/peak meters, dB scale, insert slot expansion
2. `feat: add searchable device chain UX and drag reorder`
   - searchable add menu, collapse, preset surface
3. `feat: add convolution reverb and visual processor feedback`
   - IR loading, EQ curve, gain reduction meter
4. `feat: add sidechain routing and send-state upgrades`
   - sidechain source selector, pre/post send toggle, solo-safe

## Verification

- `npx tsc --noEmit`
- `npm run build`
- `npx vitest run src/engine/__tests__/effectsEngineNativeNode.test.ts src/store/__tests__/sendsReturns.test.ts tests/unit/StatusBar.test.tsx`
- add new unit coverage:
  - device graph serialization
  - sidechain routing selection
  - convolution preset persistence
- browser workflows:
  - create a reverb rack and reorder devices
  - set kick as sidechain source for bass compressor
  - verify insert count, send toggles, and meter behavior in mixer

## Files To Touch

- `docs/plans/sprint-03-mixer-device-routing.md`
- `src/types/project.ts`
- `src/store/projectStore.ts`
- `src/engine/EffectsEngine.ts`
- `src/components/mixer/MixerPanel.tsx`
- `src/components/mixer/EffectChain.tsx`
- `src/components/mixer/EffectCards.tsx`
- `src/components/mixer/LevelMeter.tsx`
- `src/components/ui/Knob.tsx`
- `src/components/mixer/VerticalFader.tsx`
- `src/engine/__tests__/`
- `src/store/__tests__/`
- `tests/e2e/`
