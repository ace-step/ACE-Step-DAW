# Plan: Fix MIDI + Sequencer Real-Time Playback

## User Stories
- As a user, I want to press Play and hear my Piano Roll melody (C-D-E-F-G-A) play through the built-in synth.
- As a user, I want to press Play and hear my drum pattern (Kick/Snare/HH) play through the built-in drum engine.
- As an agent, I want to call window.__store.getState().project.tracks and know that all tracks will make sound during playback.

## Problem
Transport plays ONLY pre-rendered audio blobs (AI-generated clips). MIDI tracks and Sequencer patterns make no sound during playback.

## Root Cause
In `src/hooks/useTransport.ts` (startPlayback function ~line 50-130):
- Only iterates over clips that have `isolatedAudioKey` or `cumulativeMixKey`
- `SynthEngine` (real-time MIDI synth) is never called during playback
- `AudioEngine.scheduleSequencer()` is defined but never called
- `DrumEngine` is only used in BeatPad UI interaction, not playback scheduling

## Architecture Gap
```
Current:  Play → AudioEngine.schedulePlayback(aiBlobs) → [no sound for MIDI/Seq]
Needed:   Play → AudioEngine.schedulePlayback(aiBlobs) 
               + SynthEngine.scheduleClip(midiNotes, bpm) [for pianoRoll tracks]
               + AudioEngine.scheduleSequencer(pattern, bpm) [for sequencer tracks]
```

## Solution

### Option A: Real-time scheduling (Recommended)
Use Tone.js Transport to schedule MIDI notes and drum steps live during playback.

**File: `src/hooks/useTransport.ts`** — in `startPlayback()` after `engine.schedulePlayback(clipBuffers, ...)`:

```typescript
// Schedule MIDI tracks
for (const track of project.tracks) {
  if (track.trackType === 'pianoRoll') {
    for (const clip of track.clips) {
      if (clip.midiData?.notes?.length) {
        synthEngine.scheduleClip(
          track.id, clip.midiData.notes, clip.startTime, 
          project.bpm, track.synthPreset ?? 'piano', track.volume ?? 0.8
        );
      }
    }
  }
  if (track.trackType === 'sequencer' && track.sequencerPattern) {
    engine.scheduleSequencer(track.id, track.sequencerPattern, project.bpm, track.volume ?? 0.8);
  }
}
```

**File: `src/engine/SynthEngine.ts`** — add `scheduleClip()` method:
```typescript
scheduleClip(trackId: string, notes: MidiNote[], clipStartTime: number, bpm: number, preset: SynthPreset, volume: number): void {
  const secondsPerBeat = 60 / bpm;
  notes.forEach(note => {
    const startSec = clipStartTime + note.startBeat * secondsPerBeat;
    const durSec = note.durationBeats * secondsPerBeat;
    Tone.Transport.schedule((time) => {
      this.playNote(trackId, note.pitch, note.velocity * 127, durSec, preset);
    }, startSec);
  });
}
```

**File: `src/engine/AudioEngine.ts`** — wire `scheduleSequencer()` to DrumEngine:
- Already has the method signature at line 151
- Implement: iterate pattern.rows, schedule each active step via DrumEngine

Also need to clear scheduled events on stop/pause:
- `Tone.Transport.cancel()` in the stop handler

### Option B: Pre-render MIDI to AudioBuffer (offline, then schedule)
Render MIDI to audio using Tone.Offline before playback. Slower but more accurate.

### Recommended: Option A (real-time scheduling)

## Files to Touch
- `src/hooks/useTransport.ts` — call MIDI + sequencer scheduling in startPlayback
- `src/engine/SynthEngine.ts` — add scheduleClip() and clearScheduled() methods
- `src/engine/AudioEngine.ts` — implement scheduleSequencer() body using DrumEngine
- `src/engine/DrumEngine.ts` — add schedulePattern() method if not present

## Verification (User Story Test)
```js
// 1. Add a melody
window.__store.getState().addMidiNote(clipId, {pitch:60, startBeat:0, durationBeats:1, velocity:0.8});
// 2. Add a drum beat  
window.__store.getState().toggleSequencerStep(trackId, kickRowId, 0);
// 3. Press Play
// Expected: hear C note + kick drum on beat 1
```

## Build Check
- `npm run build` must pass 0 errors
- No unused imports
