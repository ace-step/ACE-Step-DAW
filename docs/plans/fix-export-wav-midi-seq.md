# Plan: Export WAV for MIDI + Sequencer Tracks

## User Story
As a user, I want to click Export and get a WAV file that includes my Piano Roll melodies and Sequencer drum patterns, not just AI-generated audio.

## Problem
Export WAV button is disabled when there are no AI-generated audio blobs (`isolatedAudioKey`). MIDI and Sequencer tracks have no audio blobs — they only play in real-time via SynthEngine/DrumEngine.

## Current Export Flow
`src/engine/exportMix.ts` (or similar):
- Collects clips with `isolatedAudioKey` or `cumulativeMixKey`
- Loads AudioBuffers from IndexedDB
- Mixes them into a stereo WAV at 48kHz
- Downloads the WAV file

## Solution: Offline Render MIDI + Sequencer to AudioBuffer

### Approach: Use Tone.Offline to render each track
```typescript
// For pianoRoll tracks:
const buffer = await Tone.Offline(async ({ transport }) => {
  const synth = new Tone.PolySynth(Tone.Synth).toDestination();
  // configure synth preset...
  for (const note of clip.midiData.notes) {
    const startSec = note.startBeat * (60 / bpm);
    const durSec = note.durationBeats * (60 / bpm);
    const freq = Tone.Frequency(note.pitch, 'midi').toFrequency();
    transport.schedule((time) => {
      synth.triggerAttackRelease(freq, durSec, time, note.velocity);
    }, startSec);
  }
  transport.start();
}, totalDuration, 2, 48000);

// For sequencer tracks:
// Similar approach with DrumEngine sounds in Tone.Offline
```

### Integration Points:
1. **Export dialog** — Remove the `disabled` check (or make it check for ANY content, not just audio blobs)
2. **Export function** — Before mixing, render MIDI/Seq tracks to AudioBuffers via Tone.Offline
3. **Mix** — Combine rendered MIDI/Seq buffers with any AI audio blobs

### Alternative simpler approach:
Before export, render each MIDI/Seq track to an AudioBuffer, store it temporarily, then proceed with existing export pipeline.

## Files to Touch
- `src/engine/exportMix.ts` or wherever export logic lives
- `src/components/dialogs/ExportDialog.tsx` or similar — remove disabled condition
- May need utility functions for MIDI→AudioBuffer and Seq→AudioBuffer offline rendering

## Verification
1. Create Piano Roll track with notes
2. Create Sequencer track with drum pattern
3. Click Export → WAV file downloads
4. Open WAV in audio player → hear both melody and drums
5. `npm run build` passes 0 errors
