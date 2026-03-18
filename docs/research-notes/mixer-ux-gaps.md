# Mixer UX Gap Analysis: ACE-Step DAW vs Ableton Live 12

Source: [Ableton Live 12 Manual — Mixing](https://www.ableton.com/en/live-manual/12/mixing/)
Date: 2026-03-18

---

## Top 5 Gaps

### Gap 1: No Track Level Meters (HIGH VALUE)
**Ableton**: Peak + RMS output meters per track. Resizable with tick marks, numeric dB field, resettable peak indicators.
**Ours**: No level meters at all. Users have no visual feedback for signal levels.
**Implementation**: Read AudioContext analyser node data, render in Mixer channel strip.

### Gap 2: No Group Tracks / Track Folders (MEDIUM VALUE)
**Ableton**: Nestable Group Tracks that sum child audio. Foldable, colorable, child routing defaults to group output.
**Ours**: Flat track list only. No hierarchy or summing.
**Implementation**: Add `parentTrackId` to Track type, render nested in TrackList, sum through group TrackNode.

### Gap 3: No Split Stereo Pan Mode (LOW-MEDIUM VALUE)
**Ableton**: Two modes — Stereo Pan (default) and Split Stereo Pan (L/R independent). Switchable via context menu.
**Ours**: Single pan knob only.
**Implementation**: Add `panMode: 'stereo' | 'split'` + `panLeft`/`panRight` to Track type.

### Gap 4: No Send/Return Tracks (MEDIUM VALUE)
**Ableton**: Dedicated return tracks for shared effects (reverb, delay). Tracks have send knobs per return.
**Ours**: Effects are per-track only. No shared effect buses.
**Implementation**: New TrackType 'return', send amounts per track, audio routing changes in AudioEngine.

### Gap 5: No Master Track Visible in Mixer (LOW VALUE)
**Ableton**: Master track always visible in mixer with its own volume, pan, effects chain.
**Ours**: Master channel exists in Mixer but limited controls.

---

## Priority Matrix

| Gap | User Impact | Effort | Priority |
|-----|-----------|--------|----------|
| Track level meters | Visual feedback essential for mixing | M | **P0** |
| Group tracks | Organization for complex projects | L | P1 |
| Split stereo pan | Pro mixing feature | S | P2 |
| Send/Return tracks | Shared effects, pro workflow | L | P1 |
| Master track controls | Completeness | S | P2 |

## Recommended Next: Track Level Meters (P0)
Lowest effort, highest visual impact. Use AnalyserNode attached to each TrackNode, render bars in mixer channel strips with RAF loop.
