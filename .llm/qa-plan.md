# QA Assessment & Refactoring Plan

## Research Findings

### Current State
- **TSC**: 0 type errors (clean)
- **Tests**: 1 failing test (`pluginSystem.test.ts:437` — "adds and removes plugins on tracks", timing out at 5241ms)
- **Build**: Clean
- **Console statements**: 28 in production code across 13 files (many raw `console.log` instead of using `debugLogger`)
- **`any` type usage**: ~104 occurrences across 26 files (biggest offender: `strudelEngine.ts` with 17)
- **React act() warnings**: EnhancePanel tests missing proper `act()` wrapping
- **Codebase size**: 128,849 LOC across 619 files

### Key Issues Identified

1. **Failing test** — pluginSystem store integration test times out
2. **Raw console statements** — 28 occurrences in 13 production files; project has a `debugLogger` utility that should be used
3. **`any` type abuse** — strudelEngine.ts (17), test files (45+), various services
4. **Test quality** — act() warnings in EnhancePanel tests, potential test isolation issues
5. **Test coverage gaps** — hooks, some components untested

## Work Units

### Unit 1: Fix Failing pluginSystem Test
- **Files**: `tests/unit/pluginSystem.test.ts`
- **Description**: Fix the "adds and removes plugins on tracks" test that times out at 5241ms. Likely a dynamic import / module isolation issue.

### Unit 2: Replace Raw Console Statements with debugLogger
- **Files**: `src/services/generationPipeline.ts`, `src/services/mcpBridge.ts`, `src/hooks/useAudioImport.ts`, `src/components/assets/LoopBrowser.tsx`, `src/components/strudel/StrudelEditor.tsx`, `src/components/dialogs/BounceInPlaceDialog.tsx`, `src/components/dialogs/ExportDialog.tsx`, `src/engine/RecordingEngine.ts`, `src/store/projectStore.ts`
- **Description**: Replace raw `console.log/warn/error` with the project's `debugLogger` utility. Exclude `src/utils/debugLogger.ts` itself, `src/engine/dsp/` (WASM bridge has legitimate low-level console usage), and `src/wasm/` (WASM init warnings).

### Unit 3: Fix `any` Types in strudelEngine.ts
- **Files**: `src/engine/strudelEngine.ts`, `src/types/strudel.d.ts`
- **Description**: Replace 17 `any` type casts with proper Strudel types. Add/improve type declarations in `strudel.d.ts` as needed.

### Unit 4: Fix `any` Types in Test Files
- **Files**: `src/engine/__tests__/ReturnTrackNode.test.ts` (13), `src/engine/__tests__/TrackNode.sends.test.ts` (12), `src/engine/__tests__/effectsEngineSidechain.test.ts` (7), `src/components/timeline/__tests__/simplifyEnhanceMenu.test.tsx` (10)
- **Description**: Replace `as any` casts in test files with proper mock types or type assertions.

### Unit 5: Fix React act() Warnings in EnhancePanel Tests
- **Files**: `src/components/generation/__tests__/EnhancePanel.test.tsx`
- **Description**: Wrap state-updating code in proper `act()` calls to eliminate React warnings.

### Unit 6: Fix `any` Types in Production Services
- **Files**: `src/services/vst3bridge/VST3BridgeClient.ts`, `src/services/vst3bridge/VST3PluginScanner.ts`, `src/services/midiCaptureService.ts`, `src/services/generationPipeline.ts`, `src/services/aceStepApi.ts`, `src/services/videoRecorder.ts`
- **Description**: Replace remaining `any` types in service files with proper types.

### Unit 7: Fix `any` Types in Engine and Hooks
- **Files**: `src/engine/LoopLibrary.ts`, `src/engine/TrackNode.ts`, `src/engine/InstrumentEngine.ts`, `src/engine/strudelEditorPlayback.ts`, `src/hooks/useTransport.ts`, `src/hooks/useEnhancePlayback.ts`, `src/utils/dawStateSummary.ts`, `src/utils/followActions.ts`, `src/utils/audioEncoders.ts`
- **Description**: Replace `any` types in engine, hooks, and utils with proper types.

## E2E Test Recipe
Skip e2e — these are code quality fixes verifiable by `npx tsc --noEmit` + `npm test` + `npm run build`.

## Worker Instructions Template
Each worker will:
1. Implement the fix for their specific unit
2. Run simplify skill
3. Run `npx tsc --noEmit` + `npm test` + `npm run build`
4. Commit and push
5. Create PR with `Closes #ISSUE` reference
