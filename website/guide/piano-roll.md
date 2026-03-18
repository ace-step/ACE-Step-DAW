# Piano Roll

The Piano Roll is a canvas-based MIDI editor for composing melodies, chords, and bass lines with built-in synth playback.

## Opening the Piano Roll

1. Select a Piano Roll clip on the timeline
2. Press `E` or double-click the clip to open the editor

<!-- ![Demo](/images/placeholder.svg) -->

## Interface Layout

| Area | Description |
|---|---|
| **MIDI Keyboard** | 56px sidebar on the left showing note names (C, C#, D, etc.) with octave labels. Black keys are shaded. |
| **Note Grid** | Main editing area. Notes appear as colored rectangles. |
| **Velocity Lane** | 60px strip below the grid showing velocity bars for each note. Resizable via drag divider. |
| **Toolbar** | Grid size selector, draw mode toggle, zoom controls. |

## Drawing Notes

1. Enable **Draw Mode** by pressing `B` or clicking the draw mode toggle
2. Click on the grid to place a note
3. Drag left/right while placing to set duration
4. Notes snap to the selected grid size

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
| Toggle draw mode | `B` |

## Tips

- Use **1/16 grid** for detailed melodies, **1/4 grid** for chord pads
- Lower velocities work well for ghost notes in drum programming
- The velocity color gradient makes it easy to spot dynamic variation at a glance
- Combine with the [Effects Chain](/guide/effects) to shape your synth sound

::: warning Known Limitation
The piano roll currently supports single-track editing only. Multi-track MIDI overlay is not yet available.
:::
