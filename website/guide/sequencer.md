# Step Sequencer & Beat Pads

The step sequencer is an FL Studio-inspired drum pattern editor for creating rhythmic patterns with a grid interface and real-time beat pads.

## Pattern Configuration

| Setting | Options | Default |
|---|---|---|
| Steps per bar | 8, 16, 32 | 16 |
| Bars | 1 to 4 | 1 |
| Swing | 0.0 to 1.0 | 0.0 (straight) |

Swing offsets the timing of odd-numbered steps. At 0 the rhythm is perfectly straight; at 0.67 you get a heavy shuffle feel.

<!-- ![Demo](/images/placeholder.svg) -->

## Step Grid

The grid displays rows (one per drum sound) and columns (one per step).

**To toggle a step:** Click it. Active steps light up in the row's accent color.

**Per-step velocity:** Each active step has an adjustable velocity (0 to 1) that controls its playback volume.

## Drum Rows

Each row represents a drum sound. You can have 8 or more rows per pattern.

**Per-row controls:**

| Control | Description |
|---|---|
| Volume | 0 to 1, controls row loudness |
| Pan | -1 (left) to +1 (right) |
| Mute | Silence the row |
| Clone | Duplicate the row |
| Remove | Delete the row |
| Rename | Change the row label |

## Drum Kits

Four built-in kits to choose from:

| Kit | Character |
|---|---|
| **808** | Classic electronic — boomy kick, snappy snare |
| **Acoustic** | Natural drum kit sounds |
| **Electronic** | Modern electronic percussion |
| **Lo-Fi** | Warm, crunchy, lo-fi textures |

**Default rows:** Kick, Snare, Closed Hi-Hat, Open Hi-Hat

**Extended rows:** + Clap, Rim, Low Tom, High Tom

## Beat Pads

A 16-pad grid (4 x 4) for triggering drum sounds in real time.

### QWERTY Keyboard Mapping

```
 1  2  3  4
 Q  W  E  R
 A  S  D  F
 Z  X  C  V
```

Press any mapped key to trigger the corresponding pad with LED-style visual feedback.

<!-- ![Demo](/images/placeholder.svg) -->

## Step-by-Step: Building a Pattern

1. **Select a kit** — Choose 808, Acoustic, Electronic, or Lo-Fi
2. **Set steps and bars** — 16 steps / 1 bar is a good starting point
3. **Program the kick** — Click steps 1, 5, 9, 13 for a four-on-the-floor pattern
4. **Add snare** — Click steps 5 and 13 for a standard backbeat
5. **Layer hi-hats** — Click every other step (1, 3, 5, 7, ...) for eighth-note hats
6. **Adjust swing** — Try 0.3 to 0.5 for a natural groove
7. **Fine-tune velocity** — Lower the velocity on off-beat hats for a more human feel

## Tips

- Use **32 steps** for detailed hi-hat rolls and trap-style patterns
- Combine swing with velocity variation for a natural, human feel
- Use the **beat pads** to audition sounds before programming them in the grid
- Clone a row and pitch-shift it for layered percussion

::: warning Known Limitation
Sequencer patterns are fixed-length per bar. Variable-length patterns within a single track are not yet supported.
:::
