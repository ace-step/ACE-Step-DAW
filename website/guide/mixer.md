# Mixer

The mixer panel provides per-track channel strips and a master fader for controlling the final mix.

## Opening the Mixer

Press `X` to toggle the mixer panel. It appears at the bottom of the DAW interface and can be resized by dragging the top divider.

<!-- ![Demo](/images/placeholder.svg) -->

## Channel Strip

Each track has a channel strip with the following controls:

| Control | Range | Description |
|---|---|---|
| **Volume** | 0 to 1 | Exponential scaling for natural loudness response |
| **Pan** | -1 (L) to +1 (R) | Stereo position |
| **Mute** | On/Off | Silence the track |
| **Solo** | On/Off | Solo this track (exclusive — mutes all others) |

## Master Fader

The master fader controls the global output volume.

| Parameter | Range | Default |
|---|---|---|
| Volume | 0 to 2.0 | 1.0 |

::: tip
Keep the master fader at 1.0 and use individual track volumes to balance the mix. Only boost the master if the overall level is too quiet after mixing.
:::

## Per-Track EQ

Each channel strip includes a built-in 3-band EQ:

- **Low** shelf at 250 Hz (±15 dB)
- **Mid** band (±15 dB)
- **High** shelf at 8 kHz (±15 dB)

Default: all bands at 0 dB (flat).

## Per-Track Compressor

A built-in compressor is available on every channel:

| Parameter | Default |
|---|---|
| Threshold | -24 dB |
| Ratio | 4:1 |
| Knee | Configurable |
| Attack/Release | Configurable |

Includes a gain reduction meter for visual feedback.

## Per-Track Reverb

A simple reverb send built into each channel:

| Parameter | Range | Default |
|---|---|---|
| Mix | 0 to 1 | 0 (off) |
| Room Size | 0 to 1 | — |

## Mixing Workflow

1. **Set levels** — Start with all faders at 0.7 and adjust relative to the loudest element
2. **Pan for width** — Spread instruments across the stereo field. Keep kick, bass, and vocals centered.
3. **Solo to check** — Solo each track to listen for issues before mixing back in
4. **Add EQ** — Cut problem frequencies, boost character
5. **Compress** — Tame dynamics on vocals and drums
6. **Add reverb** — A touch of reverb on most tracks, more on vocals and snare

## Tips

- Use **solo** to check individual tracks, but always make mixing decisions with all tracks playing
- Cut frequencies with EQ more than you boost — subtraction often sounds more natural
- Keep the master meter below clipping (0 dB)
- The mixer height is resizable — drag the top edge for more or less screen space

::: warning Known Limitation
The mixer does not currently support aux sends or bus routing. All effects are applied per-track in the effect chain.
:::
