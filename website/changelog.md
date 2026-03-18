# Changelog

All notable changes to ACE-Step DAW are documented here.

## v0.1.0 — Initial Release

The first public release of ACE-Step DAW.

### Tracks
- 4 track types: Stems, Sample, Sequencer, Piano Roll
- 12 named instruments with color-coded headers
- Clip operations: move, resize, split, duplicate, delete
- Per-clip audio cropping for sample tracks

### AI Generation
- LEGO pipeline with sequential multi-track generation
- Cover mode for AI-powered style transfer
- Repaint mode for selective time-range regeneration
- Vocal2BGM for generating accompaniment from vocals
- 16 generation presets across 8 genres
- Audio analysis: BPM, key, genre, time signature detection
- DiT and LM model selection with LoRA support

### Piano Roll
- Canvas-based MIDI editor with grid snap (1/4, 1/8, 1/16, 1/32)
- Velocity lane with color gradient display
- Draw mode for rapid note entry
- 6 synth presets: Piano, Strings, Pad, Lead, Bass, Organ

### Step Sequencer
- FL Studio-inspired pattern grid (8, 16, 32 steps)
- Swing control and per-step velocity
- 16-pad beat pads with QWERTY keyboard mapping
- 4 drum kits: 808, Acoustic, Electronic, Lo-Fi
- Per-row volume, pan, mute, clone, and rename

### Mixer & Effects
- Per-track volume, pan, mute, solo with master fader
- 6 effects: EQ3, Compressor, Reverb, Delay, Distortion, Filter
- Per-track integrated EQ, compressor, and reverb
- Real-time gain reduction metering
- Effect presets for all processors

### Recording
- Microphone input with device selection
- Count-in (off, 1 bar, 2 bars) and metronome
- Real-time level metering and monitoring
- WAV output at 48kHz stereo 16-bit PCM

### Automation
- Breakpoint-based envelopes for volume and pan
- Per-point curve control (ease-in, linear, ease-out)
- Real-time interpolation during playback

### Loop Browser
- 15 built-in synthesized loops (drums, bass, keys, synth)
- Search and category filtering
- Preview playback and drag-to-timeline

### Project
- IndexedDB auto-save with undo/redo (50 states)
- WAV export with real-time mixing
- Full keyboard shortcut system
