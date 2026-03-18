---
layout: home

hero:
  name: ACE-Step DAW
  text: The AI-Powered DAW
  tagline: A full-featured browser-based digital audio workstation with AI music generation, built on Tone.js and React.
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/nicepkg/acestep-daw

features:
  - icon: "\U0001F3B5"
    title: 4 Track Types
    details: Stems, Sample, Sequencer, and Piano Roll tracks — everything you need from drum patterns to MIDI melodies.
  - icon: "\U0001F916"
    title: AI Music Generation
    details: LEGO pipeline generates tracks sequentially with cumulative context. Plus Cover, Repaint, and Vocal2BGM modes.
  - icon: "\U0001F39B\uFE0F"
    title: Pro Mixer & Effects
    details: Per-track EQ, compressor, reverb, delay, distortion, and filter with LFO. Full mixer with volume, pan, mute, and solo.
  - icon: "\U0001F3B9"
    title: Piano Roll Editor
    details: Canvas-based MIDI editor with velocity lanes, grid snap, draw mode, and 6 built-in synth presets.
  - icon: "\U0001F941"
    title: Step Sequencer & Beat Pads
    details: FL Studio-inspired drum pattern editor with 16-pad QWERTY-mapped beat pads and configurable swing.
  - icon: "\U0001F3A4"
    title: Recording Engine
    details: Record directly from your microphone with count-in, metronome, real-time level metering, and monitoring.
  - icon: "\U0001F4C8"
    title: Automation Envelopes
    details: Breakpoint-based automation for volume and pan with per-point curve control and smooth interpolation.
  - icon: "\U0001F501"
    title: Loop Browser
    details: 15 built-in synthesized loops across drums, bass, keys, and synth categories. Search, preview, and drag to timeline.
  - icon: "\U0001F4BE"
    title: Offline & Persistent
    details: Runs entirely in the browser. Projects auto-save to IndexedDB with full undo/redo history. Export to WAV.
---

## Quick Start

```bash
# Clone the repository
git clone https://github.com/nicepkg/acestep-daw.git
cd acestep-daw

# Install dependencies
npm install

# Start the development server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) and start making music.
