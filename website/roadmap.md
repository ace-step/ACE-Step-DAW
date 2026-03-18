# Roadmap

What has shipped and what is planned for ACE-Step DAW.

## Shipped (v0.1.0)

- 4 track types: Stems, Sample, Sequencer, Piano Roll
- AI generation: LEGO pipeline, Cover, Repaint, Vocal2BGM
- 16 generation presets across 8 genres
- Audio analysis (BPM, key, genre, time signature)
- 6 built-in effects: EQ3, Compressor, Reverb, Delay, Distortion, Filter
- Mixer panel with per-track volume, pan, mute, solo
- Per-track EQ, compressor, and reverb
- Canvas-based piano roll with velocity lanes
- FL Studio-inspired step sequencer with beat pads
- 4 drum kits (808, Acoustic, Electronic, Lo-Fi)
- 6 synth presets (Piano, Strings, Pad, Lead, Bass, Organ)
- Microphone recording with count-in and metronome
- Automation envelopes for volume and pan
- Loop browser with 15 synthesized loops
- WAV export (48kHz stereo 16-bit PCM)
- IndexedDB persistence with undo/redo (50 states)
- Keyboard shortcuts for all major actions

## Planned

### Tracks & Editing
- [ ] Multi-track MIDI overlay in piano roll
- [ ] Track grouping and folder tracks
- [ ] Variable-length sequencer patterns
- [ ] MIDI import/export
- [ ] Audio warp and time-stretching
- [ ] Track freeze (render to audio for CPU savings)

### Effects & Mixing
- [ ] Aux sends and bus routing
- [ ] Effect parameter automation (filter cutoff, etc.)
- [ ] More effect types (chorus, flanger, phaser)
- [ ] Sidechain compression
- [ ] Spectrum analyzer and metering

### AI Generation
- [ ] Real-time generation preview
- [ ] Custom model upload
- [ ] In-browser inference (no server required)
- [ ] Stem separation from mixed audio

### Recording & Loops
- [ ] Multi-track simultaneous recording
- [ ] Custom loop import
- [ ] Loop time-stretch to project BPM
- [ ] Audio-to-MIDI conversion

### Project & Export
- [ ] MP3 and FLAC export
- [ ] Cloud project storage
- [ ] Collaboration (shared sessions)
- [ ] Project templates

### Platform
- [ ] PWA support (install as desktop app)
- [ ] Mobile-responsive layout
- [ ] Plugin system for custom effects and instruments
