# ACE-Step DAW

> **Looking for a full-featured, production-ready experience?** Try [ACE Studio](http://acestudio.ai/) — our professional AI music creation platform.

A browser-based Digital Audio Workstation powered by [ACE-Step 1.5](https://github.com/ace-step/ACE-Step-1.5) for AI music generation. Tracks are generated sequentially in a "LEGO-style" pipeline — each new instrument layer is musically aware of everything generated before it.

## Features

### AI Music Generation
- **LEGO Pipeline** — Sequential generation with cumulative context (drums → bass → guitar → vocals)
- **Cover Generation** — AI-powered cover creation from existing audio
- **Repaint/Edit** — Selective regeneration of specific time ranges
- **Vocal2BGM** — Generate accompaniment from vocal tracks
- **Audio Analysis** — AI-powered BPM, key, and genre detection
- **16 Generation Presets** — Pop, Rock, Jazz, Electronic, Hip-Hop, Classical, Lo-Fi, Ambient
- **Model Selector** — Choose DiT and LM models, LoRA support

### DAW Capabilities
- **Multi-Track Timeline** — Arrangement view with clip-based editing
- **4 Track Types** — Stems (AI-generated), Sample (imported audio), Sequencer (step-based drums), Piano Roll (MIDI)
- **Piano Roll Editor** — Canvas-based MIDI note editor with velocity lane, draw mode, grid snap
- **Step Sequencer** — FL Studio-inspired drum pattern editor with beat pads
- **Effect Chain** — 6 built-in effects (EQ3, Compressor, Reverb, Delay, Distortion, Filter) with per-effect UI
- **Mixer Panel** — Per-track volume, pan, mute, solo, channel strips
- **6 Synth Presets** — Piano, Strings, Pad, Lead, Bass, Organ (Tone.js)
- **16 Drum Sounds** — Synthesized kicks, snares, hi-hats, claps, toms, cymbals (4 kit presets)
- **Loop Browser** — 15 built-in synthesized loops with search, filter, and drag-to-timeline
- **Recording Engine** — Microphone input, real-time waveform, count-in, input level metering
- **Automation** — Breakpoint envelopes with interpolation for volume and pan
- **Smart Controls** — Per-track parameter panels
- **Project Persistence** — Save/load projects via IndexedDB
- **WAV Export** — Bounce mix to stereo WAV file
- **Keyboard Shortcuts** — Comprehensive shortcut system

## Requirements

- **Node.js** 18+
- **ACE-Step 1.5 API server** running on `localhost:8001` (default), or use cloud API

## Quick Start

```bash
npm install
npm run dev
```

Opens at [http://localhost:5174](http://localhost:5174). The dev server proxies `/api` requests to the ACE-Step 1.5 backend at `localhost:8001`.

### Using Cloud API

To use the ACE-Step cloud API instead of a local server, configure the backend URL in Settings → API URL: `https://api.acemusic.ai`

### Production Build

```bash
npm run build
npm run preview
```

## Tech Stack

- **React 19** + **TypeScript** + **Vite**
- **Tailwind CSS v4**
- **Zustand** (state management)
- **Tone.js** (synth engine, effects, drum synthesis)
- **Web Audio API** (playback, recording, rendering)
- **IndexedDB** via idb-keyval (audio blob storage)

## Project Structure

```
src/
  components/
    assets/          # Loop browser, assets panel
    controls/        # Smart controls panel
    dialogs/         # New project, settings, export, instrument picker
    generation/      # AI generation panels (cover, repaint, vocal2bgm, analysis)
    layout/          # App shell, toolbar, status bar
    mixer/           # Mixer panel, effect chain
    pianoroll/       # Piano roll MIDI editor
    sequencer/       # Step sequencer, beat pads
    timeline/        # Timeline view, track lanes, clip blocks
    tracks/          # Track list, track headers
    transport/       # Transport bar, tempo/time display
    ui/              # Shared UI components (knob, fader, slider)
  constants/         # Defaults, track definitions, generation presets
  engine/            # Audio engine, synth/effects/drum/recording/automation engines
  hooks/             # React hooks (audio, transport, keyboard shortcuts)
  services/          # ACE-Step API, generation pipeline, project storage
  store/             # Zustand stores (project, transport, UI, generation)
  types/             # TypeScript interfaces (API, project, audio)
  utils/             # WAV encoding, waveform peaks, color, time helpers
```

## Development

See [AGENTS.md](AGENTS.md) for the complete development workflow, rules, and required skills.

See [docs/dev-process.md](docs/dev-process.md) for competitive research index and system test checklists.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play / Pause |
| `Enter` | Stop (return to start) |
| `R` | Toggle recording |
| `L` | Toggle loop |
| `K` | Toggle metronome |
| `N` | Toggle snap to grid |
| `Z` | Zoom to fit project |
| `Home` / `End` | Seek to start / end |
| `←` / `→` | Nudge playhead ±5s |
| `X` | Toggle mixer |
| `B` | Toggle smart controls |
| `O` | Toggle loop browser |
| `Y` | Toggle library |
| `E` | Edit selected clip |
| `S` | Split clip at playhead |
| `Q` | Quantize selected notes |
| `Delete` | Delete selected clip/notes |
| `Cmd+Z` / `Cmd+Shift+Z` | Undo / Redo |
| `Cmd+A` | Select all clips |
| `Cmd+D` | Duplicate clip |
| `Cmd+Scroll` | Zoom timeline |
| `Cmd+Shift+I` | Add track |
| `Cmd+Shift+E` | Export WAV |
| `?` | Keyboard shortcuts dialog |

## Development Stats

| Metric | Value |
|--------|-------|
| Source code | ~24,000 LOC |
| Unit tests | 94 |
| E2E tests | 21 |
| Test suites | 18 |
| Components | 60+ |
| Keyboard shortcuts | 25+ |
| CI pipeline | type-check → unit-test → build → e2e-test → Copilot review |

## Architecture

```
Frontend (React 19 + TypeScript)
├── Store (Zustand) — projectStore, transportStore, uiStore, generationStore
├── Engine (Web Audio + Tone.js) — AudioEngine, SynthEngine, DrumEngine, EffectsEngine
├── Components — Timeline, Mixer, PianoRoll, Sequencer, EffectChain
├── Hooks — useTransport, useRecording, useEffectsSync, useKeyboardShortcuts
└── Utils — dragMath, chords, dawStateSummary, time, wav, waveformPeaks
```

Agent-friendly: Every feature accessible via `window.__store.getState().actionName()` and `window.__dawSummary()`.

## License

MIT

## ACE Studio

ACE-Step DAW is an open-source project. For professional music production with higher quality models, real-time collaboration, and a polished workflow, visit **[ACE Studio](http://acestudio.ai/)**.
