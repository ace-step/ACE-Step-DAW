# Feature Plan: Wire RecordingEngine to UI

## Status: PLAN ONLY — Do not implement yet

---

## 1. Current State

### Record Button (disabled)
- **File:** `src/components/layout/Toolbar.tsx:163-166`
- Currently a placeholder: `<ControlBarButton onClick={() => {}} title="Record (R)" disabled>`
- Renders a red circle icon with `opacity-60`

### RecordingEngine (fully implemented, not connected)
- **File:** `src/engine/RecordingEngine.ts`
- Exported singleton: `export const recordingEngine = new RecordingEngine();` (line 522)
- Not imported anywhere in the codebase

### No recording state exists
- `transportStore.ts` has no `isRecording`, `isArmed`, etc.
- `Track` interface (`src/types/project.ts:174-205`) has no `armed` property
- `useKeyboardShortcuts.ts` has no `R` key handler

---

## 2. RecordingEngine API Summary

### Key Methods
| Method | Signature | Purpose |
|--------|-----------|---------|
| `requestPermission` | `(deviceId?: string) => Promise<boolean>` | Request mic access, set up audio input chain |
| `enumerateDevices` | `() => Promise<AudioInputDevice[]>` | List audio input devices |
| `selectDevice` | `(deviceId: string) => Promise<boolean>` | Switch input device |
| `startRecording` | `(trackId: string, regionId: string, transportTime: number) => Promise<boolean>` | Begin recording on a track |
| `stopRecording` | `(trackId: string) => Promise<{ audioBuffer: AudioBuffer; waveformData: number[]; duration: number } \| null>` | Stop and return audio + waveform |
| `stopAllRecordings` | `() => Promise<Map<string, { audioBuffer; waveformData; duration }>>` | Stop all active recordings |
| `getRecordingWaveform` | `(trackId: string) => number[]` | Real-time waveform during recording |
| `setMonitoring` | `(trackId: string, enabled: boolean) => void` | Enable/disable input thru |
| `getInputLevel` | `() => number` | Current input level (dB) |
| `getInputLevelLinear` | `() => number` | Normalized 0-1 level |
| `playCountIn` | `(bpm, beatsPerBar, onBeat) => Promise<void>` | Count-in before recording |
| `setCountInLength` | `(length: CountInLength) => void` | `'off' \| '1bar' \| '2bars'` |
| `startMetronome` | `(bpm, beatsPerBar) => () => void` | Returns cleanup fn |
| `dispose` | `() => void` | Tear down everything |

### Getters (polling-based, no events)
- `recording: boolean` — any active recording
- `hasPermission: boolean` — mic granted
- `denied: boolean` — mic denied
- `countingIn: boolean` — count-in playing

### Exported Types
```ts
AudioInputDevice { deviceId: string; label: string; isDefault: boolean }
RecordingSession  { trackId: string; regionId: string; startTime: number; chunks: Blob[]; waveformSamples: number[] }
CountInLength     = 'off' | '1bar' | '2bars'
MetronomeMode     = 'always' | 'recording-only' | 'off'
```

---

## 3. Implementation Plan

### Step 1: Add `armed` to Track type

**File:** `src/types/project.ts:174-205`

Add to `Track` interface:
```ts
armed?: boolean;  // true = record-enabled, receives mic input
```

### Step 2: Add recording state to transportStore

**File:** `src/store/transportStore.ts`

Add to `TransportState` interface (after line 9):
```ts
isRecording: boolean;
armedTrackIds: Set<string>;
```

Add actions:
```ts
startRecording: () => void;    // set({ isRecording: true })
stopRecording: () => void;     // set({ isRecording: false })
toggleArmTrack: (trackId: string) => void;  // toggle in armedTrackIds set
disarmAllTracks: () => void;
```

Initial values: `isRecording: false`, `armedTrackIds: new Set()`.

### Step 3: Create `useRecording` hook

**New file:** `src/hooks/useRecording.ts`

This is the central integration layer. Pattern follows `useTransport.ts`.

```ts
import { useCallback, useRef, useEffect } from 'react';
import { recordingEngine } from '../engine/RecordingEngine';
import { useTransportStore } from '../store/transportStore';
import { useProjectStore } from '../store/projectStore';
import { saveAudioBlob } from '../services/audioFileManager';
import { audioBufferToWavBlob } from '../utils/wav';
import { computeWaveformPeaks } from '../utils/waveformPeaks';

export function useRecording() { ... }
```

**Responsibilities:**

#### `toggleRecord()`
1. If not recording:
   - Check `armedTrackIds` is non-empty; toast warning if empty
   - Call `recordingEngine.requestPermission()` if not already granted
   - If count-in enabled, `await recordingEngine.playCountIn(bpm, beatsPerBar, onBeat)`
   - For each armed track: `recordingEngine.startRecording(trackId, newRegionId, transportTime)`
   - Start transport playback (reuse `play()` from `useTransport`)
   - Set `isRecording: true` in store
2. If recording:
   - Call `stopRecording()` (below)

#### `stopRecording()`
1. `const results = await recordingEngine.stopAllRecordings()`
2. For each `(trackId, { audioBuffer, waveformData, duration })`:
   - `const wavBlob = audioBufferToWavBlob(audioBuffer)`
   - `const key = await saveAudioBlob(projectId, clipId, 'isolated', wavBlob)`
   - `const peaks = computeWaveformPeaks(audioBuffer, 200)`
   - `addClip(trackId, { startTime, duration, prompt: 'Recording', source: 'uploaded' })`
   - `updateClipStatus(clipId, 'ready', { isolatedAudioKey: key, waveformPeaks: peaks, source: 'uploaded' })`
3. Set `isRecording: false` in store

#### `toggleArm(trackId)`
- Toggle `trackId` in `armedTrackIds`
- Call `recordingEngine.setMonitoring(trackId, armed)` for input thru

#### `getInputLevel()` / `getRecordingWaveform(trackId)`
- Thin wrappers for UI metering / live waveform display

**Key patterns to follow (from `useTransport.ts`):**
- Use `useProjectStore.getState()` for non-reactive reads (line 63 pattern)
- Use `useTransportStore.getState()` for store mutations
- Utility references via `useAudioEngine`

### Step 4: Wire Record button in Toolbar

**File:** `src/components/layout/Toolbar.tsx:163-166`

Replace the disabled placeholder:
```tsx
<ControlBarButton
  onClick={toggleRecord}
  title="Record (R)"
  active={isRecording}
>
  <div className={`w-3.5 h-3.5 rounded-full ${
    isRecording ? 'bg-red-500 animate-pulse' : 'bg-red-500 opacity-60'
  }`} />
</ControlBarButton>
```

- Import `useRecording` or subscribe to `useTransportStore` for `isRecording`
- When `isRecording` is true: button shows active state, red dot pulses
- The existing `ControlBarButton` component already supports `active` prop (line 26-53)

### Step 5: Add arm button to TrackHeader

**File:** `src/components/tracks/TrackHeader.tsx`

Add a small circular record-arm button next to the existing mute/solo controls. When armed:
- Red dot / filled circle
- Sets `armed: true` on the track via `updateTrack()`
- Adds trackId to `armedTrackIds` in transportStore

Location: Insert after the mute/solo buttons in TrackHeader's button row. Look at existing M/S button patterns in that file for styling consistency.

### Step 6: Add keyboard shortcut `R`

**File:** `src/hooks/useKeyboardShortcuts.ts`

Add to the keyboard handler (inside the `useEffect` handler, around line 24+):
```ts
if (e.code === 'KeyR' && !mod) {
  e.preventDefault();
  toggleRecord();
}
```

This requires importing `useRecording` or passing `toggleRecord` into the shortcuts hook.

### Step 7: Integrate with transport stop

**File:** `src/hooks/useTransport.ts`

Modify `stop()` (lines 254-259) and `pause()` (lines 245-252):
- If `isRecording`, call `stopRecording()` from `useRecording` before stopping transport
- This ensures recordings are finalized when the user hits Stop or Space

**Alternative:** Have `useRecording` subscribe to `isPlaying` changes and auto-stop recording when playback stops. This avoids coupling useTransport → useRecording.

### Step 8: Recording indicator in toolbar

**File:** `src/components/layout/Toolbar.tsx`

Add a recording indicator near the LCD display (around line 172):
- Show elapsed recording time
- Pulsing red dot
- Only visible when `isRecording === true`

### Step 9: Live waveform during recording (optional, stretch)

**File:** `src/components/timeline/TrackLane.tsx` or `ClipBlock.tsx`

While recording, show a growing waveform in the armed track's lane:
- Poll `recordingEngine.getRecordingWaveform(trackId)` on RAF
- Render as a temporary clip block that extends in real-time
- On stop, replace with the final clip created in Step 3

---

## 4. File Change Summary

| File | Change |
|------|--------|
| `src/types/project.ts:174` | Add `armed?: boolean` to Track interface |
| `src/store/transportStore.ts` | Add `isRecording`, `armedTrackIds`, recording actions |
| `src/hooks/useRecording.ts` | **NEW** — core integration hook |
| `src/hooks/useTransport.ts:245-259` | Stop recording on pause/stop |
| `src/hooks/useKeyboardShortcuts.ts` | Add `R` shortcut |
| `src/components/layout/Toolbar.tsx:163-166` | Enable Record button, add indicator |
| `src/components/tracks/TrackHeader.tsx` | Add arm button |
| `src/components/timeline/TrackLane.tsx` | Live waveform (stretch goal) |

## 5. Existing Utilities to Reuse

| Utility | File | Usage |
|---------|------|-------|
| `audioBufferToWavBlob` | `src/utils/wav.ts` | Encode AudioBuffer → WAV Blob |
| `computeWaveformPeaks` | `src/utils/waveformPeaks.ts` | Generate 200-point peaks for clip display |
| `saveAudioBlob` | `src/services/audioFileManager.ts:11-21` | Persist to IndexedDB with versioned key |
| `addClip` | `src/store/projectStore.ts:533-573` | Create clip on track |
| `updateClipStatus` | `src/store/projectStore.ts` | Mark clip as 'ready' with audio keys |
| `showToast` / `toastError` | `src/hooks/useToast.ts` | User feedback (no armed tracks, mic denied) |

## 6. Edge Cases & Open Questions

1. **Multi-track recording:** RecordingEngine supports it (`startRecording` per track, `stopAllRecordings`), but the single mic input means all armed tracks get the same audio. Is this the intended behavior, or should only one track be armed at a time?

2. **Transport integration order:** Should `toggleRecord` call `play()` itself, or should the Record button set a flag and let the next Play press start recording? DAW convention is: arm tracks first, then hit Record (which also starts playback).

3. **Punch-in recording:** Not supported by RecordingEngine currently. Future consideration.

4. **Undo support:** Recording creates clips via `addClip`. The existing undo system (`_pushHistory`) should capture this automatically, but verify that `stopRecording` → clip creation pushes a single history entry, not one per clip.

5. **Loop recording:** If loop is enabled during recording, should each pass create a new take/clip? RecordingEngine doesn't handle this — would need extension.
