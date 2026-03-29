<p align="center">
  <img src="public/logo-512.png" alt="ACE-Step DAW" width="120" />
</p>

<h1 align="center">ACE-Step DAW</h1>

<p align="center">
  <strong>The AI-native DAW where every instrument knows what came before it.</strong>
</p>

<p align="center">
  <a href="https://github.com/ace-step/ACE-Step-DAW/actions"><img src="https://github.com/ace-step/ACE-Step-DAW/actions/workflows/test.yml/badge.svg" alt="CI" /></a>
  <a href="https://github.com/ace-step/ACE-Step-DAW/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0--or--later-blue.svg" alt="License" /></a>
  <img src="https://img.shields.io/badge/react-19-61DAFB?logo=react" alt="React 19" />
  <img src="https://img.shields.io/badge/tone.js-15-F734D7" alt="Tone.js" />
  <img src="https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript" alt="TypeScript" />
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> &bull;
  <a href="#what-makes-it-different">What Makes It Different</a> &bull;
  <a href="#features">Features</a> &bull;
  <a href="#architecture">Architecture</a> &bull;
  <a href="#contributing">Contributing</a>
</p>

---

> **Want a production-ready experience today?** Try [ACE Studio](http://acestudio.ai/) — our professional AI music creation platform with higher quality models and real-time collaboration.

## What Makes It Different

Most AI music tools generate a full song in one shot. ACE-Step DAW takes a fundamentally different approach — it builds songs **layer by layer**, where each new instrument is musically aware of everything generated before it.

### LEGO Pipeline — Context-Aware Sequential Generation

Generate drums first. Then bass that grooves with the drums. Then guitar that complements both. Then vocals that sit perfectly in the mix. Each layer "hears" the cumulative result of all previous layers through the ACE-Step 1.5 model.

```
Drums → Bass (hears drums) → Guitar (hears drums+bass) → Vocals (hears everything)
```

This isn't post-hoc mixing — the AI **composes** each part knowing the full musical context, producing arrangements that are coherent from the ground up.

### Strudel Live Coding — Algorithmic Composition as a Track Type

Write `s("[bd <hh oh>]*2, [~ cp]*2")` and hear it instantly. ACE-Step DAW integrates [Strudel](https://strudel.cc) as a first-class track type alongside traditional timeline clips. Switch between visual editing and code-based pattern generation without leaving the DAW. Convert between MIDI and Strudel patterns freely.

### Agent-Native Architecture

Every feature is accessible via `window.__store.getState().actionName()`. The entire DAW state is scriptable, testable, and automatable. Built for a future where AI agents and humans collaborate on music production side by side.

## Quick Start

**Requirements:** Node.js 18+ and an [ACE-Step 1.5](https://github.com/ace-step/ACE-Step-1.5) API server (local or cloud).

```bash
git clone https://github.com/ace-step/ACE-Step-DAW.git
cd ACE-Step-DAW
npm install
npm run dev
```

Opens at [http://localhost:5174](http://localhost:5174). The dev server proxies `/api` to the ACE-Step 1.5 backend at `localhost:8001`.

**Cloud API:** Configure the backend URL in Settings → API URL: `https://api.acemusic.ai`

**Production build:**

```bash
npm run build && npm run preview
```

## Features

### AI Generation

| Feature | Description |
|---------|-------------|
| **LEGO Pipeline** | Sequential generation with cumulative context — drums → bass → guitar → vocals |
| **Text-to-Music** | Describe what you want, get audio — 16 genre presets (Pop, Rock, Jazz, Electronic, Hip-Hop, Classical, Lo-Fi, Ambient) |
| **Cover Generation** | Reimagine existing audio in a new style with controllable deviation strength |
| **Repaint** | Selectively regenerate a time range — conservative, balanced, or aggressive modes |
| **Vocal2BGM** | Feed in vocals, generate matching accompaniment automatically |
| **Audio Analysis** | AI-powered BPM, key, and genre detection |
| **Model Selector** | Choose DiT/LM models, adjust inference steps, LoRA support |

### DAW Core

| Feature | Description |
|---------|-------------|
| **Multi-Track Timeline** | Clip-based arrangement with drag, resize, split, fade handles, and snap-to-grid |
| **5 Track Types** | Stems (AI), Sample (imported audio), Sequencer (step drums), Piano Roll (MIDI), Strudel (live code) |
| **Piano Roll** | Canvas-based MIDI editor with velocity lane, slide notes, ghost notes, chord stamps, and quantize |
| **Step Sequencer** | FL Studio-inspired 16-step drum pattern editor with 16 synthesized drum sounds and 4 kit presets |
| **Effect Chain** | Per-track effect rack — EQ3, Compressor, Reverb, Delay, Distortion, Chorus, Flanger, Phaser, Filter, Sidechain |
| **Mixer** | Channel strips with volume, pan, mute, solo, and per-track metering |
| **6 Synth Presets** | Piano, Strings, Pad, Lead, Bass, Organ (Tone.js polyphonic synthesis) |
| **Loop Browser** | 15 built-in synthesized loops with search, filter, and drag-to-timeline |
| **Recording** | Microphone input with real-time waveform, count-in, and input level metering |
| **Automation** | Breakpoint envelopes with interpolation for volume, pan, and effect parameters |
| **Project Persistence** | Save/load via IndexedDB with auto-save |
| **WAV Export** | Offline render to stereo WAV |
| **Undo/Redo** | 55+ undoable actions covering virtually every operation |
| **25+ Keyboard Shortcuts** | Full keyboard-driven workflow — [see full list](#keyboard-shortcuts) |

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                   React 19 Components (60+)                  │
│   Timeline │ PianoRoll │ Sequencer │ Mixer │ Strudel Editor │
└──────────────────────────┬───────────────────────────────────┘
                           │
┌──────────────────────────▼───────────────────────────────────┐
│                   Zustand Stores (7)                          │
│   project │ transport │ generation │ ui │ model │ shortcuts  │
└──────────────────────────┬───────────────────────────────────┘
                           │
┌──────────────────────────▼───────────────────────────────────┐
│                   Services Layer                             │
│   Generation Pipeline │ ACE-Step API │ Audio File Manager    │
│   Strudel Conversion  │ Project Storage                      │
└──────────────────────────┬───────────────────────────────────┘
                           │
┌──────────────────────────▼───────────────────────────────────┐
│              Audio Engine (Tone.js + Web Audio API)           │
│   AudioEngine │ SynthEngine │ DrumEngine │ EffectsEngine     │
│   AutomationEngine │ RecordingEngine │ StrudelEngine         │
└──────────────────────────┬───────────────────────────────────┘
                           │
                     ┌─────▼─────┐
                     │  Speaker / │
                     │  WAV File  │
                     └───────────┘
```

**Signal chain per track:**

```
Source → Input Gain → Pan → EQ3 → Effect Chain → Compressor → Volume → Analyser → Master
```

### Project Structure

```
src/
  components/       # 60+ React components by domain
    timeline/       #   Arrangement view, clip blocks, track lanes
    pianoroll/      #   Canvas MIDI editor, velocity lane
    sequencer/      #   Step grid, beat pads
    mixer/          #   Channel strips, effect chain
    strudel/        #   Live code editor
    generation/     #   AI generation panels
    transport/      #   Transport bar, tempo/time
  engine/           # Audio engine (Tone.js + Web Audio wrappers)
  services/         # Business logic (API, generation pipeline, storage)
  store/            # Zustand stores
  hooks/            # React hooks (transport, recording, shortcuts)
  types/            # TypeScript interfaces
  utils/            # Pure helpers (WAV, waveform, color, time)
  constants/        # Defaults, presets, track definitions
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| UI | React 19 + TypeScript 5.7 + Vite 6 |
| Styling | Tailwind CSS v4 |
| State | Zustand 5 |
| Audio | Tone.js 15 + Web Audio API |
| Live Coding | Strudel (core, mini, webaudio, soundfonts) |
| Storage | IndexedDB via idb-keyval |
| Testing | Vitest + Playwright |

## Keyboard Shortcuts

| Key | Action | | Key | Action |
|-----|--------|-|-----|--------|
| `Space` | Play / Pause | | `X` | Toggle mixer |
| `Enter` | Stop | | `B` | Toggle smart controls |
| `R` | Record | | `O` | Toggle loop browser |
| `L` | Toggle loop | | `E` | Edit selected clip |
| `K` | Toggle metronome | | `S` | Split clip at playhead |
| `N` | Toggle snap | | `Q` | Quantize notes |
| `Z` | Zoom to fit | | `Delete` | Delete selection |
| `Home`/`End` | Seek start/end | | `Cmd+Z` | Undo |
| `←`/`→` | Nudge ±5s | | `Cmd+Shift+Z` | Redo |
| `Cmd+Scroll` | Zoom timeline | | `Cmd+D` | Duplicate clip |
| `Cmd+Shift+I` | Add track | | `Cmd+Shift+E` | Export WAV |
| `?` | Show all shortcuts | | `Cmd+A` | Select all |

## Development

```bash
npm run dev            # Dev server at http://127.0.0.1:5174
npm test               # Unit tests (Vitest)
npm run test:e2e       # E2E tests (Playwright)
npm run test:all       # Unit + E2E
npm run test:coverage  # Coverage report
npm run build          # Type-check + production build
```

| Metric | Value |
|--------|-------|
| Source code | ~24,000 LOC |
| Components | 60+ |
| Unit tests | 94 |
| E2E tests | 21 |
| CI pipeline | type-check → unit-test → build → e2e → review |

See [AGENTS.md](AGENTS.md) for the complete development workflow and agent conventions.

## Contributing

We welcome contributions! Whether it's a bug fix, new feature, or documentation improvement:

1. **Find or create an issue** — check [open issues](https://github.com/ace-step/ACE-Step-DAW/issues) or create one with a `feat:`, `fix:`, or `docs:` prefix
2. **Fork and branch** — `feat/issue-NUMBER` or `fix/issue-NUMBER`
3. **Write tests first** — we follow TDD (red → green → refactor)
4. **Pass quality gates** — `npx tsc --noEmit` + `npm test` + `npm run build` must all succeed
5. **Open a PR** — include `Closes #NUMBER` in the body

See [AGENTS.md](AGENTS.md) for detailed conventions on commits, testing, and code style.

## License

**AGPL-3.0-or-later** — ACE-Step DAW bundles [Strudel](https://strudel.cc) packages (AGPL-3.0-or-later), so the project is distributed under AGPL-compatible terms as a whole.

If you need an MIT-only distribution, remove the Strudel integration or obtain an alternative license from the Strudel copyright holders. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for details.

For hosted deployments, make source code available to network users. Override branding with:
`VITE_SOURCE_CODE_URL`, `VITE_LICENSE_URL`, `VITE_COPYRIGHT_NOTICE`

---

<p align="center">
  <strong>ACE-Step DAW</strong> is an open-source project by <a href="http://acestudio.ai/">ACE Studio</a>.<br />
  For professional production with higher quality models and real-time collaboration, visit <a href="http://acestudio.ai/">acestudio.ai</a>.
</p>
