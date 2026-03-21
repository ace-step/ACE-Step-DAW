# Fix Audio Clip Extension vs Repitch Stretch

## User Stories
- As a human user, I want ordinary audio clip edge drags to extend or trim non-destructively, so that my source audio stays stable unless I explicitly ask for stretching.
- As a human user, I want Shift+edge drag to be the dedicated repitch stretch gesture, so that time stretching is intentional and visually consistent.
- As an AI agent, I want clip extension state to be explicit in the store, so that browser tests can distinguish silent padding from audio edits.

## Problem
- Audio clip waveforms are too coarse for track-to-track alignment.
- Audio clip resize hit targets are too small to acquire reliably.
- Ordinary edge drags visually and behaviorally act like time stretching.
- Leftward extension cannot represent leading silence, and rightward extension makes waveform thumbnails drift.

## Root Cause
- Most clip creation paths persist only 200 waveform peaks.
- `src/components/timeline/ClipWaveform.tsx` stretches the visible waveform slice across the full clip box.
- `src/components/timeline/ClipBlock.tsx` only models resize in terms of `duration` and `audioOffset`.
- Playback scheduling assumes audio always begins at the clip's left edge.

## Solution
- Add `contentOffset` to audio clips to represent silent padding before audible content.
- Raise persisted waveform density to 1024 peaks via a shared constant.
- Increase edge hit targets to 16px and align hover cursor detection with the same threshold.
- Make ordinary outward resize add silent head/tail padding while keeping audible content anchored.
- Reserve Shift+edge drag for repitch stretch by updating `timeStretchRate` and `stretchMode`.
- Update waveform rendering and playback scheduling to respect silent padding versus stretched playback.
- Lazily upgrade legacy low-resolution waveform peaks for ready clips with stored audio.

## Verification
- `npx vitest run tests/unit/clipAudio.test.ts tests/unit/clipResizeModifiers.test.tsx tests/unit/clipResizeAndFadeVisuals.test.tsx`
- `npm run test:e2e -- tests/e2e/audio-clip-resize.spec.ts`
- `npx tsc --noEmit`
- `npm run build`

## Files To Touch
- `docs/plans/fix-audio-clip-extension-repitch-stretch.md`
- `src/types/project.ts`
- `src/utils/clipAudio.ts`
- `src/utils/waveformPeaks.ts`
- `src/components/timeline/ClipWaveform.tsx`
- `src/components/timeline/ClipBlock.tsx`
- `src/hooks/useTransport.ts`
- `src/engine/AudioEngine.ts`
- audio clip creation paths under `src/hooks/` and `src/services/`
- regression tests under `tests/unit/` and `tests/e2e/`
