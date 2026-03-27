# Sprint 01 PR1 Acceptance Guide

## Scope

- Target PR: `#986`
- Branch: `feat/v0.0.x-sprint-01-instrument-state-model`
- Goal:
  - verify the canonical `track.instrument` data model
  - verify legacy field mirroring for `synthPreset`, `sampler`, and `samplerConfig`
  - verify migration of persisted tracks and saved track presets
- Out of scope:
  - synth editor UI
  - LFO controls
  - unison controls
  - FM playback engine behavior

This document is for accepting Sprint 01 PR1 only. It is not the full Sprint 01 acceptance checklist.

## Required Automated Checks

Run all commands on `feat/v0.0.x-sprint-01-instrument-state-model`.

```bash
npx tsc --noEmit
npx vitest run src/store/__tests__/projectStore.test.ts tests/unit/sessionLaunchModes.test.ts tests/unit/sessionLegato.test.ts
npm run build
```

Merge gate:

- All three commands must pass locally.
- GitHub CI must be green.
- No blocking review comments may remain unresolved.

## Manual Acceptance Steps

Use a throwaway project. The most reliable validation path for this PR is the browser console through `window.__store`.

### 1. Default piano-roll instrument

Run:

```js
const s = window.__store.getState();
s.createProject({ name: 'Sprint01 PR1 QA' });

const track = s.addTrack('keyboard', 'pianoRoll');
window.__store.getState().project.tracks.find(t => t.id === track.id);
```

Expected:

- `trackType === 'pianoRoll'`
- `instrument.kind === 'subtractive'`
- `instrument.preset === 'organ'`
- `synthPreset === 'organ'`

### 2. Sampler mirroring

Run:

```js
s.setTrackSampler(track.id, {
  audioKey: 'audio:test',
  sampleName: 'QA Sample',
  rootNote: 48,
  sampleDuration: 1.5,
});

window.__store.getState().project.tracks.find(t => t.id === track.id);
```

Expected:

- `instrument.kind === 'sampler'`
- `synthPreset === 'sampler'`
- `sampler.audioKey === 'audio:test'`
- `samplerConfig.audioKey === 'audio:test'`
- `sampler.rootNote === 48`
- `samplerConfig.rootNote === 48`

### 3. FM canonical state plus legacy fallback

Run:

```js
s.setTrackInstrument(track.id, {
  kind: 'fm',
  preset: 'fm',
  name: 'FM Bell',
  fallbackPreset: 'lead',
  settings: {
    carrier: { waveform: 'sine', ratio: 1, level: 1 },
    modulator: { waveform: 'sine', ratio: 3, level: 0.8 },
    modulationIndex: 4.5,
    feedback: 0,
    ampEnvelope: { attack: 0.01, decay: 0.2, sustain: 0.7, release: 0.5 },
    outputGain: 0,
  },
});

window.__store.getState().project.tracks.find(t => t.id === track.id);
```

Expected:

- `instrument.kind === 'fm'`
- `instrument.name === 'FM Bell'`
- `synthPreset === 'lead'`
- `sampler === undefined`
- `samplerConfig === undefined`

### 4. Track preset round-trip

Run:

```js
const preset = s.saveTrackPreset(track.id, 'FM Bell QA');
const applied = s.applyTrackPreset(preset.id);
applied;
```

Expected:

- `preset.settings.instrument.kind === 'fm'`
- `applied.instrument.kind === 'fm'`
- `applied.synthPreset === 'lead'`

### 5. Legacy migration

Run:

```js
const project = structuredClone(window.__store.getState().project);
project.tracks[0].instrument = undefined;
project.tracks[0].synthPreset = 'pad';
window.__store.getState().setProject(project);
window.__store.getState().project.tracks[0];
```

Expected:

- `instrument` is automatically backfilled
- `instrument.kind === 'subtractive'`
- `instrument.preset === 'pad'`

## Regression Smoke

- Add a new piano-roll track through the normal UI flow and confirm the app does not error.
- Confirm no unexpected console errors appear during the above manual checks.
- Confirm the session launch mode tests still pass after the PR branch is updated to the latest `main`.

## Merge Decision

Approve merge for PR `#986` only if all of the following are true:

- automated checks pass
- manual console checks pass
- regression smoke passes
- GitHub CI is green
- review feedback is resolved

## Next Step After Merge

The next implementation slice should be Sprint 01 PR2:

- move synth engine reads to `track.instrument`
- add a minimal synth editor shell in the piano roll
- keep legacy preset behavior as a compatibility fallback until PR3 lands
