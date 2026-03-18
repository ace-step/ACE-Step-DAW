# Plan: Export WAV for MIDI + Sequencer Tracks

## User Story
As a user, I want to click Export and get a WAV file that includes my Piano Roll melodies and Sequencer drum patterns, not just AI-generated audio.

## Problem
Export WAV button disabled when `readyClips.length === 0`. MIDI/Sequencer tracks have no `isolatedAudioKey` — they only play live.

## Current Export Flow
```
ExportDialog.handleExport():
  for each track:
    for each clip with isolatedAudioKey:
      load AudioBuffer from IndexedDB
      push {startTime, buffer, volume}
  exportMixToWav(clips, totalDuration) → OfflineAudioContext → WAV blob → download
```

## Solution

### 1. Add offline rendering functions in `src/engine/offlineRender.ts` (new file)

```typescript
import * as Tone from 'tone';
import type { Track, MidiNote, SequencerPattern } from '../types/project';

export async function renderMidiTrackOffline(
  notes: MidiNote[], 
  clipStartTime: number,
  bpm: number, 
  synthPreset: string,
  totalDuration: number,
  sampleRate: number = 48000
): Promise<AudioBuffer> {
  const buffer = await Tone.Offline(({ transport }) => {
    const synth = new Tone.PolySynth(Tone.Synth).toDestination();
    // Apply preset settings...
    transport.bpm.value = bpm;
    const secondsPerBeat = 60 / bpm;
    
    for (const note of notes) {
      const startSec = clipStartTime + note.startBeat * secondsPerBeat;
      const durSec = note.durationBeats * secondsPerBeat;
      const freq = Tone.Frequency(note.pitch, 'midi').toFrequency();
      transport.schedule((time) => {
        synth.triggerAttackRelease(freq, durSec, time, note.velocity);
      }, startSec);
    }
    transport.start();
  }, totalDuration, 2, sampleRate);
  
  return buffer instanceof AudioBuffer ? buffer : buffer.get();
}

export async function renderSequencerTrackOffline(
  pattern: SequencerPattern,
  bpm: number,
  totalDuration: number,
  sampleRate: number = 48000
): Promise<AudioBuffer> {
  // Similar to renderMidiTrackOffline but uses DrumEngine-style synthesis
}
```

### 2. Update `ExportDialog.tsx`

In `handleExport`, before the existing clip collection loop, add:

```typescript
// Render MIDI tracks offline
for (const track of project.tracks) {
  if (track.muted) continue;
  if (anySoloed && !track.soloed) continue;
  
  if (track.trackType === 'pianoRoll') {
    for (const clip of track.clips) {
      const notes = clip.midiData?.notes;
      if (notes?.length) {
        const buffer = await renderMidiTrackOffline(
          notes, clip.startTime, project.bpm, 
          track.synthPreset ?? 'piano', project.totalDuration
        );
        clips.push({ startTime: 0, buffer, volume: track.volume });
      }
    }
  }
  
  if (track.trackType === 'sequencer' && track.sequencerPattern) {
    const buffer = await renderSequencerTrackOffline(
      track.sequencerPattern, project.bpm, project.totalDuration
    );
    clips.push({ startTime: 0, buffer, volume: track.volume });
  }
}
```

### 3. Change disabled condition

```diff
- disabled={exporting || readyClips.length === 0}
+ disabled={exporting || !hasExportableContent}
```

Where `hasExportableContent` is true if there are ready clips, MIDI notes, OR sequencer patterns.

## Files to Touch
1. `src/engine/offlineRender.ts` — NEW: renderMidiTrackOffline + renderSequencerTrackOffline
2. `src/components/dialogs/ExportDialog.tsx` — import and call offline renderers + fix disabled check
3. `src/engine/SynthEngine.ts` — may need createSynthForPreset to be exported as standalone

## Build Check
- `npm run build` must pass 0 errors
- No unused imports
