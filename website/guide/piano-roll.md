# Piano Roll

The Piano Roll is a canvas-based MIDI editor for composing melodies, chords, and bass lines with built-in synth playback.

## Opening the Piano Roll

1. Select a Piano Roll clip on the timeline
2. Press `E` or double-click the clip to open the editor

![Piano Roll Demo](/demos/feature-piano-roll.gif)

## Interface Layout

| Area | Description |
|---|---|
| **MIDI Keyboard** | 56px sidebar on the left showing note names (C, C#, D, etc.) with octave labels. Black keys are shaded. |
| **Note Grid** | Main editing area. Notes appear as colored rectangles. |
| **Velocity Lane** | 60px strip below the grid showing velocity bars for each note. Resizable via drag divider. |
| **Toolbar** | Explicit tool buttons, grid size selector, ghost-note toggle, synth controls, and zoom controls. |

## Tool Modes

| Tool | Shortcut | Behavior |
|---|---|---|
| **Select** | `1` | Select, move, resize, and box-select notes |
| **Pencil** | `2` or `B` | Click to place a note, then drag to set duration |
| **Paint** | `3` | Drag across the grid to write repeated notes on snapped cells |
| **Erase** | `4` | Click or drag across notes to delete them |
| **Slide** | `5` | Create slide notes with a distinct color and playback behavior |

The active tool is shown in the toolbar, and notes snap to the selected grid by default.

## Editing Notes

| Action | How |
|---|---|
| **Move** | Drag the center of a note |
| **Resize** | Drag the left or right edge |
| **Delete** | Select and press `Delete` or `Backspace` |
| **Select multiple** | Click with modifier keys or box-select |
| **Preview** | Hover over a note to hear it |

## Grid Snap

Four grid sizes are available:

- **1/4** — Quarter notes
- **1/8** — Eighth notes
- **1/16** — Sixteenth notes (default)
- **1/32** — Thirty-second notes

All note placement and resizing snaps to the selected grid.

## Velocity

Each note has a velocity value from 0 to 127 that controls its volume and intensity.

- Velocity is shown in the **velocity lane** as vertical bars
- Color gradient: low velocity = blue, high velocity = red/orange
- Edit velocity by dragging bars in the velocity lane

## Synth Presets

Each piano roll track includes 6 built-in synth presets:

| Preset | Waveform | Character |
|---|---|---|
| **Piano** | Triangle | Soft attack, medium sustain |
| **Strings** | Sawtooth | Slow attack, long release |
| **Pad** | Sine | Very slow attack, ambient |
| **Lead** | Square | Sharp attack, cutting |
| **Bass** | Sawtooth | Punchy, short |
| **Organ** | Sine | Instant attack, no release |

## Navigation

| Action | Shortcut |
|---|---|
| Zoom X/Y | Scroll wheel with `Cmd/Ctrl` |
| Pan/Scroll | Scroll wheel |
| Tool switching | `1` / `2` / `3` / `4` / `5` |
| Pencil toggle | `B` |
| Quantize | `Q` |
| Quantize options | `Cmd/Ctrl + Q` |

## Tips

- Use **1/16 grid** for detailed melodies, **1/4 grid** for chord pads
- Lower velocities work well for ghost notes in drum programming
- The velocity color gradient makes it easy to spot dynamic variation at a glance
- Use **Paint** for hi-hat runs and **Slide** for expressive bass transitions
- Combine with the [Effects Chain](/guide/effects) to shape your synth sound

::: warning Known Limitation
The piano roll currently supports single-track editing only. Multi-track MIDI overlay is not yet available.
:::
