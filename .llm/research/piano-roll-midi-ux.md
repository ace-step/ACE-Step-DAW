# Piano Roll & MIDI Editing UX Research

> Date: 2026-03-27 | Scope: MIDI editing UX in mainstream DAWs vs ACE-Step

---

## 1. FL Studio Piano Roll — Best in Class

### Why It's Considered the Best
- "The well-deserved reputation as the best Piano Roll in the business" — industry consensus
- Combination of speed, visual clarity, and creative tools
- Mouse-friendly: Adding, removing, moving, editing — intuitive with minimal clicks
- Any user from any DAW can learn it comfortably in minutes

### Key Features
- **Ghost Notes**: Semi-transparent notes from other channels visible behind current channel — essential for harmonic reference
- **Chord Stamps**: Place predefined chords (30+ types) with one click via Stamp tool
- **Slide Notes**: Special note type that glides pitch between notes (unique to FL)
- **Scale Highlighting**: Visual highlight of scale notes on piano keyboard
- **Quantize Strength**: 0-100% slider — 75% preserves feel while cleaning timing
- **Tools**: Draw, Paint, Delete, Select, Zoom, Slice modes
- **Multi-Channel Editing**: Switch between MIDI channels within same piano roll

### What Makes It Mouse-Friendly
- Only 2 basic mechanics: click mouse + hold modifier key
- Discovering functionality happens quickly
- Right-click = delete note (no switching to eraser tool)
- Left-click = draw note (default mode)

## 2. Ableton MIDI Clip Editor

### Design Philosophy
- **Fold mode**: Hide unused note rows, show only played notes
- **Note stretch markers**: Drag note edges to adjust duration
- **Velocity lane**: Bottom section with draggable velocity stems
- **Legato button**: Extend all selected notes to touch the next
- **MPE editing**: Per-note pitch bend, slide, and pressure (Live 12+)

## 3. Logic Pro Piano Roll

### Unique Strengths
- **Brush tool**: Paint repeated notes at grid divisions
- **Scale Quantize**: Snap notes to selected musical scale
- **MIDI Transform**: Batch operations (transpose, randomize, thin CC data)
- **Articulation management**: Per-note articulation switching for orchestral libraries
- **Step input**: Type notes one at a time using MIDI keyboard + duration keys

## 4. Bitwig Studio

### Per-Note Expression
- **Micro-pitch editing**: Detune individual notes in cents
- **Per-note modulation**: Expression data per note (MPE native)
- **Clip modulation**: Modulators that run per-clip, not per-track
- **Operator tool**: Select/draw/split/paint modes with clear visual feedback

## 5. ACE-Step Current State

### What Exists (PianoRoll.tsx + PianoRollCanvas.tsx)
- Tool palette: Select, Pencil, Paint, Erase, Slide
- Keyboard shortcuts: V/B/X/1/2/3/4/5 for tools
- Grid sizes: 1/16, 1/8, 1/4, 1/2, whole
- Ghost notes toggle
- Chord shapes selector (Major, Minor, Diminished, etc.)
- Velocity lane at bottom
- Canvas-based rendering
- Zoom X slider
- isSlide property on MidiNote type

### Key Gaps vs Competitors
| Feature | FL Studio | Ableton | Logic | ACE-Step |
|---|---|---|---|---|
| Ghost notes quality | Best | Good | No | Toggle exists |
| Chord stamp (one-click) | 30+ chords | No | No | Selector exists, UX unclear |
| Scale highlighting | Yes | Fold mode | Yes | No |
| Lock-to-scale | No | No | Yes | No |
| Velocity painting (alt+drag) | Yes | Yes | Yes | Basic lane |
| Quantize strength slider | Yes | Yes | Yes | No strength control |
| Humanize | Yes | No | Yes | No |
| Legato (extend to next) | Yes | Yes | Yes | No |
| Strumming tool | Yes | No | No | No |
| Multi-note time stretch | Yes | Yes | Yes | No |
| Note expression / MPE | No | Yes | No | No |
| Brush/paint tool | Yes | No | Yes | "Paint" tool exists |

---

## 6. Recommendations for ACE-Step

### Phase 1: Core Editing
- Scale highlighting on piano keyboard (from project key)
- Quantize strength slider (0-100%)
- Velocity painting: Alt+drag in velocity lane
- Legato: Select notes → L key

### Phase 2: Creative Tools
- Ghost notes rendering quality improvement
- Humanize: Randomize timing (±ticks) and velocity
- Strumming: Apply strum offset to chord
- Chord stamp: One-click chord placement (FL-style)

### Phase 3: Advanced
- Lock-to-scale mode
- Multi-note time stretch
- MPE/expression editing
- Step input mode

---

## Sources

- [FL Studio Piano Roll 101: Best Features & Key Functions](https://unison.audio/fl-studio-piano-roll/)
- [How to Use the Piano Roll in FL Studio: Complete Guide (2026)](https://www.audeobox.com/learn/fl-studio/how-to-use-the-piano-roll-in-fl-studio/)
- [DAW with the Best Piano Roll/MIDI Editor? — VI-CONTROL](https://vi-control.net/community/threads/daw-with-the-best-piano-roll-midi-editor.36951/)
- [30 Days with FL Studio 20: Piano Roll Basics](https://www.admiralbumblebee.com/music/2018/06/24/30-days-with-FLStudio-20-Piano-Roll-Basics.html)
- [FL Studio Review: The Producer's Playground in 2025](https://www.thedystopiancollective.com/softwarereviews/fl-studio-review-the-producers-playground-in-2025)
