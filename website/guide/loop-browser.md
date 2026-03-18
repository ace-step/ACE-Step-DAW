# Loop Browser

The loop browser provides 15 built-in synthesized loops that you can preview, search, and drag onto the timeline.

## Opening the Loop Browser

Press `O` to toggle the loop browser / assets panel.

<!-- ![Demo](/images/placeholder.svg) -->

## Built-in Loops

### Drums

| Loop | BPM | Bars | Character |
|---|---|---|---|
| 808 Boom | 90 | 4 | Classic 808-style kick pattern |
| Rock Steady | 120 | 4 | Solid rock beat |
| Shuffle Blues | 95 | 4 | Shuffled hi-hat groove |
| Trap Hi-Hats | 140 | 4 | Rapid hi-hat rolls |
| Lo-Fi Drums | 85 | 4 | Laid-back, crunchy beat |

### Bass

| Loop | BPM | Bars | Key | Character |
|---|---|---|---|---|
| Sub Bass | 90 | 4 | Cm | Deep sub bass |
| Walking Bass | 120 | 4 | C | Jazz walking bass line |
| Funk Slap | 110 | 4 | Em | Funky slap bass |
| Synth Bass | 128 | 4 | Cm | Pulsing synth bass |

### Keys

| Loop | BPM | Bars | Key | Character |
|---|---|---|---|---|
| Piano Ballad | 80 | 4 | C | Gentle piano chords |
| Rhodes Groove | 100 | 4 | Eb | Smooth Rhodes progression |
| Ambient Pad | 70 | 8 | C | Evolving pad texture |

### Synth

| Loop | BPM | Bars | Key | Character |
|---|---|---|---|---|
| Arp Cascade | 128 | 4 | C | Arpeggiated synth |
| Lead Line | 120 | 4 | Cm | Melodic synth lead |
| Pluck Stab | 130 | 4 | Cm | Short pluck chords |

## Using the Loop Browser

### Search

Type in the search bar to filter loops by name.

### Filter by Category

Click the category tabs to filter:
- **All** — Show all loops
- **Drums** — Drum loops only
- **Bass** — Bass loops only
- **Keys** — Keyboard loops only
- **Synth** — Synth loops only

### Preview

Click a loop to preview it. Click again to stop playback.

### Add to Timeline

Drag a loop from the browser onto the timeline to insert it as a new clip.

## How Loops Work

All loops are **synthesized on demand** using Tone.js — no external audio files are required. Each loop is generated the first time you preview or use it, then cached for instant access.

Waveform peaks are extracted for visual display in both the browser and the timeline.

## Tips

- Use the **808 Boom** and **Sub Bass** loops together for a hip-hop foundation
- The **Ambient Pad** loop (8 bars) works well as a background texture — layer it under other instruments
- Combine **Rock Steady** drums with **Walking Bass** for an instant jazz-rock groove
- Loops inherit the project BPM — they will time-stretch to match your tempo

::: warning Known Limitation
Custom loop import is not yet supported. The 15 built-in loops are synthesized — you cannot add your own loops to the browser at this time.
:::
