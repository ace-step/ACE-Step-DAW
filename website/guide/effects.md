# Effects Chain

Every track in ACE-Step DAW has a serial effects chain with 6 built-in processors. Effects are applied in order, and each can be independently enabled or disabled.

## Effect Chain Order

Effects process audio in series:

```
Input → EQ3 → Compressor → Reverb → Delay → Distortion → Filter → Output
```

Each effect has its own enable/disable toggle — bypassed effects pass audio through unchanged.

<!-- ![Demo](/images/placeholder.svg) -->

## EQ3 — 3-Band Equalizer

Shape the frequency balance of your track with low, mid, and high bands.

| Parameter | Range | Description |
|---|---|---|
| Low Gain | -15 to +15 dB | Low shelf at 250 Hz |
| Mid Gain | -15 to +15 dB | Mid band |
| High Gain | -15 to +15 dB | High shelf at 8 kHz |

**Presets:** Flat, Bass Boost, Presence, Warmth

## Compressor

Control dynamic range with real-time gain reduction metering.

| Parameter | Range | Description |
|---|---|---|
| Threshold | -24 to 0 dB | Level where compression starts |
| Ratio | 1:1 to 20:1 | Compression intensity |
| Attack | ms | How fast compression engages |
| Release | ms | How fast compression releases |
| Knee | 0 to 6 dB | Transition smoothness |

**Presets:** Gentle, Vocal, Drum Bus, Limit

::: tip
Watch the gain reduction meter to ensure you are not over-compressing. 3-6 dB of reduction is a good starting point.
:::

## Reverb

Add spatial depth and ambience.

| Parameter | Range | Description |
|---|---|---|
| Decay | 0.5 to 5 s | Reverb tail length |
| Pre-Delay | 0 to 100 ms | Gap before reverb starts |
| Mix | 0 to 1 | Wet/dry balance |

**Presets:** Room, Hall, Chamber, Plate

## Delay

Create echoes and rhythmic repeats.

| Parameter | Range | Description |
|---|---|---|
| Time | 10 ms to 1 s | Delay between repeats |
| Feedback | 0 to 0.95 | Number of repeats (higher = more) |
| Mix | 0 to 1 | Wet/dry balance |

**Presets:** Slap, Echo, Long

## Distortion

Add harmonic saturation from subtle warmth to aggressive fuzz.

| Parameter | Range | Description |
|---|---|---|
| Type | Soft Clip / Overdrive / Fuzz | Saturation curve |
| Amount | 0 to 1 | Distortion intensity |
| Mix | 0 to 1 | Wet/dry balance |

## Filter

Multimode filter with optional LFO modulation.

| Parameter | Range | Description |
|---|---|---|
| Type | Lowpass / Highpass / Bandpass | Filter mode |
| Frequency | 20 Hz to 20 kHz | Cutoff frequency |
| Resonance | 0 to 20 | Resonant peak at cutoff |
| LFO Rate | 0.1 to 20 Hz | Modulation speed |
| LFO Depth | 0 to 1 | Modulation amount |

**Presets:** Low Pass, High Pass, Wah LFO

::: tip
Enable the **LFO** on a lowpass filter to create auto-wah and filter sweep effects.
:::

## Tips

- Start with EQ to clean up the tone, then add compression for consistency
- Use reverb sparingly on bass instruments — it can muddy the low end
- A short slap delay (30-80 ms) adds width without obvious echoes
- Stack subtle distortion with a filter sweep for evolving textures

::: warning Known Limitation
Effect parameter changes apply in real time for most effects. However, changing the distortion type requires an internal rebuild of the audio node.
:::
