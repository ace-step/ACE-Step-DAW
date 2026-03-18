# Automation Envelopes

Automation envelopes let you change track parameters over time — creating fades, panning sweeps, and dynamic mixes that evolve throughout the song.

## Supported Parameters

| Parameter | Range | Description |
|---|---|---|
| **Volume** | 0 to 1 | Track loudness over time |
| **Pan** | -1 to +1 | Stereo position over time (stored as 0 to 1, mapped to -1 to +1) |

## How Automation Works

Each automation lane contains a series of **breakpoints** — time/value pairs that define the parameter's shape over time.

```
Point A (0s, 0.8) ──── Point B (4s, 0.2) ──── Point C (8s, 1.0)
```

The engine interpolates smoothly between breakpoints during playback, creating continuous parameter changes.

<!-- ![Demo](/images/placeholder.svg) -->

## Breakpoint Properties

| Property | Description |
|---|---|
| **Time** | Position in seconds |
| **Value** | Parameter value (0 to 1) |
| **Curve** | -1 (ease-in) to 0 (linear) to +1 (ease-out) |

### Curve Types

| Curve | Value | Behavior |
|---|---|---|
| Ease-in | -1 | Slow start, fast end |
| Linear | 0 | Constant rate of change |
| Ease-out | +1 | Fast start, slow end |

## Common Automation Patterns

### Fade In
Set volume from 0 to 1 over the intro:
- Point 1: time = 0s, value = 0
- Point 2: time = 4s, value = 1

### Fade Out
Gradually reduce volume at the end:
- Point 1: time = 56s, value = 1
- Point 2: time = 60s, value = 0, curve = +1 (ease-out for natural decay)

### Pan Sweep
Move audio from left to right:
- Point 1: time = 0s, value = 0 (hard left)
- Point 2: time = 8s, value = 1 (hard right)

### Volume Duck
Drop volume for a vocal section:
- Point 1: time = 8s, value = 0.8
- Point 2: time = 8.5s, value = 0.3
- Point 3: time = 16s, value = 0.3
- Point 4: time = 16.5s, value = 0.8

## Tips

- Use **ease-out curves** for fade-outs — they sound more natural than linear fades
- Automate pad and ambient tracks to keep the mix interesting over long sections
- Volume automation is great for creating builds and drops in electronic music
- Keep automation points sparse — fewer points with curves often sound smoother than many points

::: warning Known Limitation
Automation is currently limited to volume and pan. Effect parameter automation (e.g., filter cutoff over time) is planned for a future release.
:::
