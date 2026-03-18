# Getting Started

ACE-Step DAW is a browser-based digital audio workstation powered by AI music generation. It runs entirely in your browser — no installation required beyond cloning the repo.

## Prerequisites

- **Node.js** 18 or later
- **npm** 9 or later
- A modern browser (Chrome or Edge recommended for best Web Audio support)

## Installation

```bash
git clone https://github.com/nicepkg/acestep-daw.git
cd acestep-daw
npm install
```

## Running the DAW

```bash
npm run dev
```

This starts the Vite development server. Open [http://localhost:5173](http://localhost:5173) in your browser.

## Your First Project

1. **Create a new project** — Press `Cmd/Ctrl + N` or use the project menu.
2. **Add a track** — Press `Cmd/Ctrl + Shift + I` to open the instrument picker. Choose from 12 named instruments (Drums, Bass, Guitar, Vocals, etc.) or create a custom track.
3. **Choose a track type** — Each track can be a Stems, Sample, Sequencer, or Piano Roll track.
4. **Add content** — Depending on your track type:
   - **Stems**: Use AI generation (`Cmd/Ctrl + G`) to create instrument parts
   - **Sample**: Import audio files by dragging them onto the timeline
   - **Sequencer**: Click steps in the pattern grid to build drum patterns
   - **Piano Roll**: Press `E` to open the editor and draw MIDI notes
5. **Mix** — Press `X` to open the mixer. Adjust volume, pan, and add effects.
6. **Export** — Press `Cmd/Ctrl + Shift + E` to export your project as a WAV file.

<!-- ![Demo](/images/placeholder.svg) -->

## Project Structure

Your projects are saved automatically to IndexedDB in your browser. Each project stores:

- Track configuration and clip data
- Audio blobs (recorded and AI-generated)
- Mixer settings and effect chains
- Automation envelopes
- Undo/redo history (up to 50 states)

::: tip
Projects persist across browser sessions. Use `Cmd/Ctrl + O` to browse and switch between saved projects.
:::

## Next Steps

- [Feature Overview](/guide/features) — See everything ACE-Step DAW can do
- [Track Types](/guide/tracks) — Learn about the 4 track types
- [AI Generation](/guide/ai-generation) — Generate music with the LEGO pipeline
- [Keyboard Shortcuts](/guide/shortcuts) — Speed up your workflow
