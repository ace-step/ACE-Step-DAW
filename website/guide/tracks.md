# Track Types

ACE-Step DAW supports four distinct track types, each optimized for different production workflows.

## Stems Track

Stems tracks are powered by the AI generation engine. Each stems track represents an isolated instrument part generated through the LEGO pipeline.

**How it works:**
1. Add a stems track and select an instrument (e.g., Drums, Bass, Guitar)
2. Configure generation parameters — prompt, lyrics, BPM, key
3. Press `Cmd/Ctrl + G` to generate
4. The AI generates audio in context, receiving the cumulative mix of previously generated tracks

**Generation order:**
Drums → Bass → Guitar → Keyboard → Percussion → Strings → Synth → FX → Brass → Woodwinds → Backing Vocals → Vocals

<!-- ![Demo](/images/placeholder.svg) -->

::: tip
You can regenerate any track out of order. The engine will use whatever valid cumulative context is available.
:::

## Sample Track

Sample tracks hold imported audio clips. Drag audio files onto the timeline or use the file picker to add them.

**Features:**
- Per-clip audio cropping via `audioOffset` and `audioDuration`
- Move and resize clips on the timeline
- Split clips at the playhead with `S`
- Duplicate clips with `Cmd/Ctrl + D`

<!-- ![Demo](/images/placeholder.svg) -->

::: tip
Sample tracks are great for recording takes. Record mic input directly into a sample track, then edit the resulting clip.
:::

## Sequencer Track

An FL Studio-inspired drum pattern editor for creating rhythmic patterns.

**Features:**
- Configurable step count: 8, 16, or 32 steps per bar
- 1 to 4 bars per pattern
- Swing control (0 = straight, 0.67 = heavy swing)
- Up to 8+ drum rows per pattern
- Per-row volume, pan, and mute controls
- 4 drum kits: 808, Acoustic, Electronic, Lo-Fi
- 16-pad beat pads with QWERTY keyboard mapping (`1-4`, `Q-R`, `A-F`, `Z-V`)

<!-- ![Demo](/images/placeholder.svg) -->

See [Step Sequencer](/guide/sequencer) for the full guide.

## Piano Roll Track

A canvas-based MIDI note editor with built-in synth playback.

**Features:**
- Grid snap: 1/4, 1/8, 1/16, 1/32 note divisions
- Velocity lane with color-coded display (blue → red)
- Draw mode (`B` key) for rapid note entry
- MIDI keyboard sidebar showing note names
- 6 synth presets: Piano, Strings, Pad, Lead, Bass, Organ
- Independent X/Y zoom and scroll

<!-- ![Demo](/images/placeholder.svg) -->

See [Piano Roll](/guide/piano-roll) for the full guide.

## Adding Tracks

Press `Cmd/Ctrl + Shift + I` to open the instrument picker. Choose from 12 named instruments:

| Instrument | Typical Track Type |
|---|---|
| Drums | Sequencer or Stems |
| Bass | Piano Roll or Stems |
| Guitar | Stems or Sample |
| Keyboard | Piano Roll or Stems |
| Vocals | Stems or Sample |
| Strings | Stems or Piano Roll |
| Synth | Piano Roll or Stems |
| Brass | Stems |
| Woodwinds | Stems |
| Percussion | Sequencer or Stems |
| FX | Stems |
| Custom | Any |

::: warning Known Limitation
Each track type has its own clip format. You cannot convert a sequencer pattern into a piano roll clip or vice versa.
:::
