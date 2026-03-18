# ACE-Step DAW — User Test Guide

> For human testers. Each test has a clear user story, step-by-step flow, and expected result.
> After each test, record a short GIF (screen recording) and note PASS/FAIL.

---

## How to Test

1. Start the app: `npm run dev` → open http://127.0.0.1:5174
2. Follow each test flow below step by step
3. Record a screen GIF for each test section (use any screen recorder)
4. Mark each step PASS ✅ or FAIL ❌
5. For audio tests (marked 🔊): **listen** and note what you hear

---

## Test A: Project Lifecycle

### A1: Create New Project
1. Open the app (should see "New Project" dialog)
2. Set name: "Test Project", BPM: 128, Key: "D minor", Time Sig: 4/4
3. Click "Create"
4. **Expected**: Empty project with toolbar showing "128 bpm", timeline with measure grid
5. 📸 Screenshot

### A2: Save and Reload
1. Add any track and make a change
2. Close browser tab
3. Reopen the app
4. **Expected**: Your project is still there (persisted in IndexedDB)

### A3: Project List
1. Click "Projects" in toolbar
2. **Expected**: See your saved project(s) in the list
3. Create a second project
4. Switch between projects
5. Delete one

---

## Test B: Track Types

### B1: Add Stems Track (AI Generation)
1. Click "+ Track"
2. Select "Stems" → pick any instrument (e.g., Drums)
3. **Expected**: New track appears in track list with correct icon and color
4. 📸 Screenshot of track list

### B2: Add Sample Track (Audio Import)
1. Click "+ Track" → "Sample"
2. **Expected**: Empty sample track appears
3. Drag an audio file (MP3/WAV) onto the track lane
4. **Expected**: Clip appears with waveform visualization
5. Press Play → 🔊 **Listen**: Does the audio play correctly?

### B3: Add Sequencer Track (Drum Pattern)
1. Click "+ Track" → "Sequencer" → pick "Drums"
2. **Expected**: Track appears with "SEQ" indicator
3. Double-click the track lane to open sequencer
4. **Expected**: Step sequencer editor opens in bottom panel
5. Click some steps to create a pattern
6. Press Play → 🔊 **Listen**: Does the drum pattern play?
7. Try the Beat Pad (if visible) — click pads, use keyboard (QWER/ASDF rows)
8. 📸 Screenshot of sequencer + beat pads

### B4: Add Piano Roll Track (MIDI)
1. Click "+ Track" → "Piano Roll" → pick any instrument
2. **Expected**: Track appears with piano icon
3. Double-click track lane to create/open MIDI clip
4. **Expected**: Piano Roll editor opens in bottom panel
5. 📸 Screenshot of Piano Roll

### B5: Track Controls
For each track type, test:
1. Adjust volume slider → 🔊 volume changes?
2. Click Mute (M) → 🔊 track silenced?
3. Click Solo (S) → 🔊 only this track plays?
4. Drag to reorder tracks → order changes?
5. Rename track → name updates?
6. Delete track → removed cleanly?

---

## Test C: Piano Roll (MIDI Editing)

### C1: Draw Notes
1. Open Piano Roll (double-click a MIDI clip)
2. Double-click in the grid to add a note
3. **Expected**: Note block appears at that pitch/time
4. 🔊 **Listen**: Does it make a sound when added? (if preview is on)

### C2: Edit Notes
1. Click a note to select it (should highlight)
2. Drag it left/right → moves in time
3. Drag it up/down → changes pitch
4. Drag right edge → changes duration
5. Press Delete → note removed
6. 📸 GIF of editing flow

### C3: Velocity
1. Look at the velocity lane at the bottom of Piano Roll
2. Drag velocity bars up/down
3. 🔊 **Listen**: Louder notes = higher velocity?

### C4: Grid & Snap
1. Change grid size (1/4, 1/8, 1/16)
2. Draw notes → they should snap to grid
3. Hold Alt while dragging → should bypass snap

### C5: Synth Presets
1. Change instrument preset in track header (Piano, Strings, Pad, Lead, Bass, Organ)
2. Draw a note
3. 🔊 **Listen**: Does the sound change with each preset?

---

## Test D: Step Sequencer

### D1: Pattern Editing
1. Open sequencer for a drum track
2. Click cells to toggle steps on/off
3. **Expected**: Active steps light up with track color
4. Press Play → 🔊 **Listen**: Pattern plays correctly?

### D2: Controls
1. Adjust swing → 🔊 changes feel?
2. Change steps per bar (8/16/32) → grid updates?
3. Mute individual drum rows → 🔊 specific drums silenced?
4. Adjust row volume → 🔊 individual drum volume changes?

---

## Test E: Effects

### E1: Add Effects
1. Select a track
2. Open Effects panel (if available via bottom panel tabs or toolbar)
3. Add an effect (e.g., Reverb)
4. **Expected**: Effect card appears with knobs/sliders
5. 🔊 **Listen**: Effect audible during playback?

### E2: Per-Effect UI
1. Add EQ3 → should show 3 sliders + frequency curve
2. Add Compressor → should show threshold/ratio knobs + GR meter
3. Add Reverb → should show decay/predelay knobs
4. Add Delay → should show time/feedback knobs
5. Add Distortion → should show amount knob + type selector
6. Add Filter → should show cutoff/resonance + filter type + LFO section
7. 📸 Screenshot of each effect UI

### E3: Effect Controls
1. Toggle bypass (power icon) → 🔊 effect on/off?
2. Drag to reorder effects → chain order changes?
3. Remove effect → removed cleanly?
4. Try presets for each effect → parameters change?

---

## Test F: AI Generation (requires API connection)

> ⚠️ These tests require ACE-Step API running locally or cloud API configured.
> If "Offline" status is shown, skip to Test G.

### F1: Generate a Track
1. Add a Stems track (e.g., Drums)
2. Click on the clip → enter a prompt (e.g., "upbeat rock drums")
3. Click Generate
4. **Expected**: Loading spinner → clip fills with audio → waveform visible
5. Press Play → 🔊 **Listen**: Generated music plays?

### F2: Cover Generation
1. Right-click a generated clip → "Create Cover..."
2. Enter new style, adjust strength slider
3. Click Generate
4. **Expected**: New clip with the cover version

### F3: Repaint
1. Right-click a clip → "Repaint Selection..."
2. Adjust the repaint range
3. Enter new prompt for that section
4. Click Generate
5. **Expected**: Only the selected portion changes

### F4: Multi-Track Generation
1. Add multiple tracks (Drums, Bass, Guitar)
2. Use "Generate All" or batch generation
3. **Expected**: Tracks generate sequentially with context awareness

---

## Test G: Mixer

### G1: Mixer Panel
1. Open Mixer (toolbar icon or keyboard shortcut)
2. **Expected**: Channel strip per track + Master fader
3. Adjust volume faders → 🔊 volume changes?
4. Adjust pan knobs → 🔊 stereo position changes?
5. 📸 Screenshot

---

## Test H: Loop Browser

### H1: Browse Loops
1. Open Loop Browser (Library icon in toolbar, if available)
2. **Expected**: List of loops with categories (Drums, Bass, Keys, Synth)
3. Click play on a loop → 🔊 preview plays?
4. Filter by category → list updates?
5. Search by name → results filter?

### H2: Add Loop to Timeline
1. Drag a loop from browser onto a track lane
2. **Expected**: Audio region appears with waveform
3. Press Play → 🔊 loop plays in context?

---

## Test I: Recording (requires microphone)

### I1: Audio Recording
1. Add a Sample track
2. Arm the track for recording (red dot button)
3. Press Record + Play
4. 🔊 Speak/play into microphone
5. Press Stop
6. **Expected**: New clip appears with recorded waveform
7. Press Play → 🔊 hear your recording?

---

## Audio Tests Summary (human ear required 🔊)

These CANNOT be tested by AI — human must listen:

| Test | What to Listen For |
|------|--------------------|
| B2 | Imported audio plays without distortion |
| B3 | Drum pattern timing is correct, no clicks/pops |
| B5 | Volume/mute/solo work as expected |
| C1 | Synth sounds on note preview |
| C3 | Velocity affects loudness |
| C5 | Each preset sounds distinctly different |
| D1 | Drum pattern loops cleanly |
| D2 | Swing changes the groove feel |
| E1 | Effect is audible (reverb tail, delay echoes, etc.) |
| E3 | Bypass cleanly removes effect |
| F1 | AI-generated music sounds musical |
| G1 | Volume/pan control is smooth, no artifacts |
| H1 | Loop preview plays correctly |
| I1 | Recording captures audio cleanly |

---

## GIF Recording Guide

For each test section (A-I), record one GIF showing the complete flow:

1. **macOS**: Use built-in screen recording (Cmd+Shift+5) → convert to GIF
2. **Any platform**: Use [LICEcap](https://www.cockos.com/licecap/) or [Gifski](https://gif.ski/)
3. Keep GIFs under 10MB (resize to 720p if needed)
4. Name: `test-X-description.gif` (e.g., `test-C-piano-roll-editing.gif`)
5. Save to `demos/` directory

---

_Thank you for testing! Your feedback directly improves the product._
