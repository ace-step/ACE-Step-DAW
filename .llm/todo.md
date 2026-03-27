# ACE-Step DAW — Agent Todo List

> Agents pick tasks from this list using @do-todo. Mark completed with [x].
> New tasks are added by @researcher and @refactorer agents.

---

## Priority 1: Test Coverage Foundation

- [x] Write Vitest unit tests for uiStore (panel toggles, selection state)
- [x] Write Vitest unit tests for generationStore (queue management, status)
- [x] Write Vitest unit tests for color utilities (src/utils/color.ts)
- [x] Write Vitest unit tests for WAV export utilities (src/utils/wav.ts)
- [x] Write Vitest unit tests for waveform peak calculation (src/utils/waveformPeaks.ts)
- [x] Write Vitest unit tests for audio downsample utility (src/utils/audioDownsample.ts)
- [ ] Write Vitest unit tests for generationPipeline service state machine
- [x] Write Vitest unit tests for automation types (normalizedToMixerValue, automationParamEquals)
- [x] Write Playwright E2E test: sequencer workflow (add track, toggle steps, verify pattern)
- [x] Write Playwright E2E test: piano roll workflow (add track, add notes via store API)
- [x] Write Playwright E2E test: mixer operations (volume, pan, mute, solo)
- [ ] Write Playwright E2E test: effect chain (add/remove/reorder effects)
- [ ] Write Playwright E2E test: keyboard shortcuts (Space=play, Ctrl+Z=undo)

## Priority 2: Feature Gaps (from competitive research)

### Audio Engine Architecture (from tonejs-alternatives research)

- [ ] As a developer, I want EffectsEngine to use native Web Audio API nodes and AudioWorklet instead of Tone.js wrappers, so that we can load multiple AudioWorklet modules and support WAM 2.0 plugins (P1)
- [ ] As a developer, I want all offline rendering to use native OfflineAudioContext instead of Tone.Offline(), so that we remove a Tone.js dependency and have consistent rendering across track types (P1)
- [ ] As a developer, I want an AudioWorklet-based scheduling clock replacing the Tone.js Web Worker clock, so that MIDI and audio events have sample-accurate timing without GC jitter (P2)
- [ ] As a developer, I want WAM 2.0 (Web Audio Modules) plugin hosting support, so that users can load third-party audio effects and instruments in the DAW (P2)
- [ ] As a developer, I want Faust-compiled WASM effects (convolution reverb, multiband compressor), so that CPU-intensive DSP runs at near-native speed inside AudioWorklet (P2)
- [ ] As a developer, I want Rust/WASM AudioWorklet processors for custom DSP (using dasp), so that performance-critical audio processing runs at native speed (P3)
- [ ] As a developer, I want a Tauri desktop build with native audio backend via cpal, so that the DAW can bypass browser audio limitations for desktop users (P3)

## Priority 3: Refactoring

(populated by @refactorer agent)

## Design Debt (from /plan-design-review)

- [ ] Add first-use tooltip/hint in StrudelEditor for Strudel syntax onboarding (depends on Phase 1 StrudelEditor component)

## Engineering Debt (from /plan-eng-review)

- [ ] Add lazy loading error boundary component for StrudelEditor (and future lazy-loaded features) — prevents white screen on chunk load failure, shows "Failed to load. Click to retry." (depends on React.lazy introduction in Phase 1)
- [ ] Add Strudel engine structured console logging (eval count/timing, errors, preset usage) — enables debugging and adoption tracking. Use console.debug for metrics, console.warn for errors. (P2, depends on Phase 1 StrudelEngine)
