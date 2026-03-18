# Recording

ACE-Step DAW supports microphone recording directly into sample tracks with real-time monitoring and level metering.

## Setup

1. **Allow microphone access** — Your browser will prompt for permission when you first use recording
2. **Select input device** — Open Settings (`Cmd/Ctrl + ,`) to choose from available microphone inputs
3. **Arm a track** — Select the track you want to record into

<!-- ![Demo](/images/placeholder.svg) -->

## Recording Controls

### Count-In

Three modes are available in Settings:

| Mode | Behavior |
|---|---|
| **Off** | Recording starts immediately |
| **1 Bar** | One bar of metronome clicks before recording |
| **2 Bars** | Two bars of metronome clicks before recording |

### Metronome

| Mode | Behavior |
|---|---|
| **Always On** | Click plays during playback and recording |
| **Recording Only** | Click plays only while recording |
| **Off** | No metronome |

### Input Gain

Adjust the input gain to control recording levels. The level meter shows:
- **Current dB** — Real-time input level
- **Peak** — Maximum level reached (helps detect clipping)

### Monitoring

Enable monitoring to hear your input in real time through your speakers or headphones.

::: tip
Use headphones when monitoring is enabled to avoid feedback loops between your speakers and microphone.
:::

## Recording a Take

1. Select or create a sample track
2. Position the playhead where you want to start
3. Configure count-in and metronome preferences
4. Press the record button
5. After the count-in, recording begins — a waveform displays in real time
6. Press stop or the record button again to finish
7. The recording appears as a new clip on the track

## Output Format

Recordings are saved as WAV files:
- **Sample Rate:** 48 kHz
- **Channels:** 2 (stereo)
- **Bit Depth:** 16-bit PCM

## Tips

- Check your input level before recording — aim for peaks around -6 dB to leave headroom
- Use the 1-bar count-in to get into rhythm before your take starts
- Record multiple takes and keep the best one — you can always delete unwanted clips
- After recording, use clip cropping to trim silence from the start and end

::: warning Known Limitation
Recording is limited to one track at a time. Multi-track simultaneous recording is not yet supported.
:::
