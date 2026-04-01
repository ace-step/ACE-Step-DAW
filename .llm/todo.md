# ACE-Step DAW — Agent Todo List

> Last updated: 2026-03-29
> Agents pick tasks from this list using @do-todo. Mark completed with [x].
> New tasks are added by @researcher and @refactorer agents.

---

## Current: Issue #1104 — Wire RecordingEngine to UI

- [ ] Write failing tests: arm button renders, toggles, visual state
- [ ] Add arm button to TrackHeader (non-group tracks only)
- [ ] Verify toolbar record button works (no regression)
- [ ] All quality gates pass: tsc, tests, build

## Priority 1: Test Coverage Foundation

- [x] Write Vitest unit tests for uiStore (panel toggles, selection state)
- [x] Write Vitest unit tests for generationStore (queue management, status)
- [x] Write Vitest unit tests for color utilities (src/utils/color.ts)
- [x] Write Vitest unit tests for WAV export utilities (src/utils/wav.ts)
- [x] Write Vitest unit tests for waveformPeaks calculation (src/utils/waveformPeaks.ts)
- [x] Write Vitest unit tests for audio downsample utility (src/utils/audioDownsample.ts)
- [ ] Write Vitest unit tests for generationPipeline service state machine
- [x] Write Vitest unit tests for automation types (normalizedToMixerValue, automationParamEquals)
- [x] Write Playwright E2E test: sequencer workflow (add track, toggle steps, verify pattern)
- [x] Write Playwright E2E test: piano roll workflow (add track, add notes via store API)
- [x] Write Playwright E2E test: mixer operations (volume, pan, mute, solo)
- [ ] Write Playwright E2E test: effect chain (add/remove/reorder effects)
- [ ] Write Playwright E2E test: keyboard shortcuts (Space=play, Ctrl+Z=undo)

## Priority 2: Feature Gaps (from competitive research)

(populated by @researcher agent)

## Priority 3: Refactoring

> Code quality audit — 2026-04-01

### Critical: Build Failure

- [ ] fix: build fails — `wasm-pack` not found, `npm run build` broken (build script line 1) [critical]

### Critical: TypeScript Config Weakness

- [ ] refactor: enable `noUnusedLocals` and `noUnusedParameters` in tsconfig.json:15-16 — both set to `false`, allows dead code to accumulate [critical]

### High: Test Coverage Gaps — Stores (core logic)

- [ ] test: add unit tests for `src/store/generationStore.ts` (1120 lines, 0 tests) — core generation state machine [high]
- [ ] test: add unit tests for `src/store/sessionStore.ts` (243 lines, 0 tests) — session management [high]
- [ ] test: add unit tests for `src/store/shortcutsStore.ts` (140 lines, 0 tests) — keyboard shortcuts state [high]
- [ ] test: add unit tests for `src/store/collaborationStore.ts` (75 lines, 0 tests) [high]

### High: Test Coverage Gaps — Services (business logic)

- [ ] test: add unit tests for `src/services/commandPalette.ts` (1082 lines, 0 tests) — large untested service [high]
- [ ] test: add unit tests for `src/services/actionApi.ts` (576 lines, 0 tests) — public API surface [high]
- [ ] test: add unit tests for `src/services/clipConsolidation.ts` (233 lines, 0 tests) — audio editing logic [high]
- [ ] test: add unit tests for `src/services/stemSeparation.ts` (236 lines, 0 tests) — stem separation pipeline [high]
- [ ] test: add unit tests for `src/services/mcpBridge.ts` (312 lines, 0 tests) — MCP bridge communication [high]
- [ ] test: add unit tests for `src/services/sampleManager.ts` (249 lines, 0 tests) — sample file management [high]
- [ ] test: add unit tests for `src/services/videoRecorder.ts` (261 lines, 0 tests) [high]
- [ ] test: add unit tests for `src/services/webCodecsConverter.ts` (257 lines, 0 tests) [high]
- [ ] test: add unit tests for `src/services/contextAudioExtractor.ts` (189 lines, 0 tests) [high]
- [ ] test: add unit tests for `src/services/coreDawShortcuts.ts` (180 lines, 0 tests) [high]

### High: Test Coverage Gaps — Engine (audio core)

- [ ] test: add unit tests for `src/engine/AudioEngine.ts` (1235 lines, 0 tests) — main audio engine [high]
- [ ] test: add unit tests for `src/engine/EffectsEngine.ts` (1527 lines, 0 tests) — effects processing [high]
- [ ] test: add unit tests for `src/engine/RecordingEngine.ts` (522 lines, 0 tests) — recording pipeline [high]
- [ ] test: add unit tests for `src/engine/exportMix.ts` (547 lines, 0 tests) — mix export [high]
- [ ] test: add unit tests for `src/engine/SamplerEngine.ts` (366 lines, 0 tests) [high]

### High: Test Coverage Gaps — Utils (pure functions, easy to test)

- [ ] test: add unit tests for `src/utils/midi.ts` (406 lines, 0 tests) — MIDI parsing/encoding [high]
- [ ] test: add unit tests for `src/utils/midiPatternGenerator.ts` (308 lines, 0 tests) [high]
- [ ] test: add unit tests for `src/utils/effectAutomation.ts` (278 lines, 0 tests) [high]
- [ ] test: add unit tests for `src/utils/parametricEq.ts` (246 lines, 0 tests) [high]
- [ ] test: add unit tests for `src/utils/clipFade.ts` (200 lines, 0 tests) [high]
- [ ] test: add unit tests for `src/utils/midiTransforms.ts` (192 lines, 0 tests) [high]
- [ ] test: add unit tests for `src/utils/pitchDetection.ts` (212 lines, 0 tests) [high]
- [ ] test: add unit tests for `src/utils/loudnessMetering.ts` (182 lines, 0 tests) [high]
- [ ] test: add unit tests for `src/utils/audioEncoders.ts` (739 lines, 0 tests) [high]
- [ ] test: add unit tests for `src/utils/trackInstrument.ts` (369 lines, 0 tests) [high]
- [ ] test: add unit tests for `src/utils/midiEncoder.ts` (158 lines, 0 tests) [high]
- [ ] test: add unit tests for `src/utils/audioQuantize.ts` (119 lines, 0 tests) [high]
- [ ] test: add unit tests for `src/utils/groovePool.ts` (117 lines, 0 tests) [high]
- [ ] test: add unit tests for `src/utils/followActions.ts` (107 lines, 0 tests) [high]
- [ ] test: add unit tests for `src/utils/zeroCrossing.ts` (89 lines, 0 tests) [high]
- [ ] test: add unit tests for `src/utils/crossfade.ts` (83 lines, 0 tests) [high]

### High: Untyped `any` in Production Code

- [ ] refactor: replace `any` types in `src/engine/strudelEngine.ts` — 13 occurrences at lines 49,58,73-75,352,358-359,379,445,527-528 [high]
- [ ] refactor: replace `any` in `src/engine/LoopLibrary.ts:9` — `toAudioBuffer(buf: any)` needs proper typing [high]
- [ ] refactor: replace `any` in `src/services/vst3bridge/VST3BridgeClient.ts:41` — `MessageHandler = (...args: any[])` [high]
- [ ] refactor: replace `any` in `src/services/vst3bridge/VST3PluginScanner.ts:25` — handler param [high]
- [ ] refactor: replace `any` in `src/components/strudel/StrudelEditor.tsx` — 7 occurrences at lines 137-140,150,170,199,312 [high]
- [ ] refactor: improve `src/types/strudel.d.ts` — 11 `any` types in type declarations, should use `unknown` or proper Strudel types [high]
- [ ] refactor: replace `any` in `src/utils/dawStateSummary.ts:78` — `(e as any).bypass` [medium]

### Medium: Oversized Files (>600 lines, violates AGENTS.md rule)

- [ ] refactor: split `src/store/projectStore.ts` (8792 lines) — extract action groups into separate slice files [medium]
- [ ] refactor: split `src/services/generationPipeline.ts` (2847 lines) — extract pipeline stages into separate modules [medium]
- [ ] refactor: split `src/components/mixer/EffectCards.tsx` (1609 lines) — extract individual effect card components [medium]
- [ ] refactor: split `src/engine/EffectsEngine.ts` (1527 lines) — extract effect type handlers [medium]
- [ ] refactor: split `src/store/uiStore.ts` (1487 lines) — extract into UI sub-slices [medium]
- [ ] refactor: split `src/types/project.ts` (1405 lines) — separate type groups into domain files [medium]
- [ ] refactor: split `src/components/generation/EnhancePanel.tsx` (1271 lines) — extract sub-panels [medium]
- [ ] refactor: split `src/engine/AudioEngine.ts` (1235 lines) — extract playback/scheduling logic [medium]
- [ ] refactor: split `src/store/generationStore.ts` (1120 lines) — extract into generation sub-slices [medium]
- [ ] refactor: split `src/services/commandPalette.ts` (1082 lines) — extract command groups [medium]
- [ ] refactor: split `src/components/session/SessionView.tsx` (967 lines) — extract sub-views [medium]
- [ ] refactor: split `src/components/generation/AddLayerPanel.tsx` (966 lines) [medium]
- [ ] refactor: split `src/hooks/useTransport.ts` (952 lines) — extract transport sub-hooks [medium]
- [ ] refactor: split `src/components/layout/Toolbar.tsx` (933 lines) — extract toolbar sections [medium]
- [ ] refactor: split `src/components/strudel/StrudelEditor.tsx` (817 lines) [medium]
- [ ] refactor: split `src/components/pianoroll/PianoRollCanvas.tsx` (784 lines) [medium]
- [ ] refactor: split `src/components/mixer/EffectChain.tsx` (764 lines) [medium]
- [ ] refactor: split `src/utils/audioEncoders.ts` (739 lines) — extract encoder implementations [medium]
- [ ] refactor: split `src/components/tracks/TrackHeader.tsx` (734 lines) [medium]
- [ ] refactor: split `src/services/strudelConversion.ts` (720 lines) [medium]
- [ ] refactor: split `src/hooks/useKeyboardShortcuts.ts` (685 lines) [medium]
- [ ] refactor: split `src/engine/LoopLibrary.ts` (661 lines) [medium]
- [ ] refactor: split `src/components/dialogs/SettingsDialog.tsx` (652 lines) — extract settings sections [medium]
- [ ] refactor: split `src/components/timeline/Timeline.tsx` (630 lines) [medium]
- [ ] refactor: split `src/engine/strudelEngine.ts` (609 lines) [medium]
- [ ] refactor: split `src/components/mixer/MixerPanel.tsx` (608 lines) [medium]

### Low: Console.log Statements in Production Code

- [ ] refactor: remove `console.log` from `src/services/generationPipeline.ts:749` [low]
- [ ] refactor: remove `console.log` from `src/services/generationPipeline.ts:1443` [low]
- [ ] refactor: remove `console.log` from `src/services/generationPipeline.ts:1451` [low]
- [ ] refactor: remove `console.log` from `src/services/mcpBridge.ts:42` — replace with structured logger [low]

### Low: Hardcoded URL in Production Code

- [ ] refactor: extract hardcoded `http://localhost` URL in `src/services/generationPipeline.ts:2468` to a constant [low]

## Design Debt (from /plan-design-review)

- [ ] Add first-use tooltip/hint in StrudelEditor for Strudel syntax onboarding (depends on Phase 1 StrudelEditor component)

## Engineering Debt (from /plan-eng-review)

- [ ] Add lazy loading error boundary component for StrudelEditor (and future lazy-loaded features) — prevents white screen on chunk load failure, shows "Failed to load. Click to retry." (depends on React.lazy introduction in Phase 1)
- [ ] Add Strudel engine structured console logging (eval count/timing, errors, preset usage) — enables debugging and adoption tracking. Use console.debug for metrics, console.warn for errors. (P2, depends on Phase 1 StrudelEngine)
