# Synth UI Design Research

> Date: 2026-03-27 | Scope: How top synthesizers design their editing UIs vs ACE-Step

---

## 1. Industry Leaders — Layout Patterns

### Serum 2 (Xfer Records) — Industry Standard
- **Fixed layout with tabbed pages**: Oscillators, Mixer, FX, Matrix, Global
- **Top-down signal flow**: Oscillators at top → Filter center → Envelopes/LFOs left → Mod Matrix + FX on tabs
- **3 oscillators** (new in Serum 2) + sub + noise
- **Drag-and-drop modulation**: Drag LFO/Env source to any knob → creates mod ring (blue arc)
- **Built-in clip sequencer**: Program melodies inside the synth (unique to Serum 2)
- **Wavetable 3D view**: Interactive 3D wavetable display, click to browse frames
- **Preset browser**: Tag-based, mouse wheel scrolling, searchable
- **Full undo/redo**: Every parameter change is undoable

### Vital (Matt Tytel) — Free, Modern Reference
- **GPU-accelerated visuals**: 60fps animated interface, minimal CPU impact
- **3 oscillators + sampler**: Each with wavetable position, unison, spectral morph
- **Visual modulation arcs**: Colored arcs on destination knobs showing mod depth per source
- **Drag-to-assign modulation**: Drag source → drop on knob → set depth
- **Real-time spectral display**: Live FFT visualization of oscillator output
- **Skinnable UI**: Community skins (retro, minimal, VS Code-inspired, etc.)
- **Layout**: Left column (oscillators) → Center (filter + effects) → Right (envelopes, LFOs, mod matrix)

### Ableton Wavetable
- **Tab-based sections**: Oscillator 1, Oscillator 2, Sub/Noise, Filter, Mod Matrix, Effects
- **Collapsible panels**: Click header to expand/collapse sections
- **Modulation**: 3 LFOs + 3 Envelopes assignable via matrix tab
- **Wavetable browser**: Built-in wavetable categories, click to load
- **Minimal aesthetic**: Flat design, Ableton's signature clean look

### Logic Alchemy — Most Ambitious
- **4 source cards**: Each can be additive, spectral, granular, wavetable, VA, or sampled
- **Performance controls**: XY pad, morph pad, mod wheel assignments
- **Transform pad**: Morph between 8 snapshots in real-time
- **Progressive disclosure**: Simple mode vs Advanced mode toggle

### Surge XT — Open Source Power
- **Dense UI**: All parameters visible simultaneously (no tabs)
- **3 oscillators**: Classic, Modern, FM2, FM3, Wavetable, Window, String, Twist, Alias, S&H
- **Modulation routing**: Right-click any param → assign modulation source
- **Dual filter**: Parallel/serial routing with visual signal flow
- **Open source**: Reference for Web Audio synth UI implementation

---

## 2. Key UI Design Patterns

### Envelope Visualizers
- **Interactive ADSR curve** with draggable control points (standard in all top synths)
- **Bezier handles**: Serum allows drag between points for curve shape
- **Color coding**: Vital uses green=amplitude, blue=filter, orange=mod
- **Real-time playback cursor**: Moves along envelope during note playback
- **Multiple envelopes visible**: Show all active envelopes stacked or tabbed

### Knob Design (Industry Standard)
- **Size**: 32-48px diameter, 270° rotation arc
- **Modulation ring**: Colored arc around knob showing modulation depth
  - Serum: Blue ring for all modulation
  - Vital: Different color per modulation source (multi-colored arcs)
- **Interaction**: Vertical drag (up=increase), with pointer lock to prevent edge hitting
- **Double-click**: Reset to default value
- **Right-click**: Open precision text input
- **Hover tooltip**: Shows parameter name + current value + unit

### Progressive Disclosure
- **Default view**: Essential params (osc type, cutoff, ADSR, volume)
- **Expanded view**: Unison, detune, LFO, filter routing
- **Expert view**: Full mod matrix, all parameters exposed
- **Logic Alchemy pattern**: Simple/Advanced toggle button

### Preset Browser Integration
- **Inline browser**: Serum/Vital show preset name in header, click to browse
- **Category tags**: Bass, Lead, Pad, Keys, FX, Pluck, etc.
- **Search**: Text search + tag filter
- **Favorites**: Star to bookmark
- **Previous/Next**: Arrow buttons for quick browsing

---

## 3. ACE-Step Current State

- **SynthEngine.ts**: 6 hardcoded presets, no parameter editing
- **SynthPreset type**: `'piano' | 'strings' | 'pad' | 'lead' | 'bass' | 'organ' | 'sampler'`
- **UI**: Preset dropdown only — no knobs, no envelopes, no visual feedback
- **Knob.tsx component exists**: 32px, 270° arc, vertical drag, double-click reset, right-click precision — good foundation

### Gap: Everything Between Preset Dropdown and Full Synth Editor

---

## 4. Recommended ACE-Step Synth Editor Design

### Layout (Single Panel, ~400px height)

```
┌─────────────────────────────────────────────────────────┐
│ [Preset: Piano ▼] [◀ ▶] [Save] [Browse]     [Simple ↔ Advanced] │
├──────────┬──────────┬──────────┬──────────────────────────┤
│ OSCILLATOR │  FILTER   │ ENVELOPES │     MOD / FX            │
│            │           │           │                         │
│ [Wave ▼]   │ [Type ▼]  │ ╭─╲___╮  │ LFO Rate  [○]          │
│ Shape [○]  │ Cutoff [○]│ A D S R  │ LFO Depth [○]          │
│ Detune [○] │ Reso  [○] │ (drag    │ LFO → [Dest ▼]         │
│ Unison [○] │ Env   [○] │  points) │                         │
│ Level  [○] │ Key   [○] │          │ [+ Add Mod Route]       │
│            │           │ Filt Env │                         │
│            │           │ ╭─╲___╮  │                         │
└──────────┴──────────┴──────────┴──────────────────────────┘
```

### Phase 1 (MVP): Oscillator + Filter + Amp ADSR
### Phase 2: Filter ADSR + LFO with routing
### Phase 3: Mod matrix + Wavetable support

---

## Sources

- [Serum 2 vs Pigments 7 vs Vital: Which Soft Synth Rules in 2026?](https://dawzone.com/serum-2-vs-pigments-6-vs-vital-which-soft-synth-is-the-best)
- [The Ultimate Soft Synth Showdown: Serum 2, Pigments 6, Phase Plant, Vital](https://www.musicradar.com/music-tech/the-ultimate-soft-synth-showdown-serum-2-pigments-6-phase-plant-vital-and-massive-x-but-which-is-best)
- [Serum 2 vs Vital: The Ultimate Wavetable Synth Comparison (2025)](https://theproducerschool.com/blogs/music-production/serum-2-vs-vital-the-ultimate-wavetable-synth-comparison-2025)
- [Serum 2 Tutorial: The Ultimate Guide for Beginners](https://www.edmprod.com/serum-2-guide/)
- [The Best 5 Free Vital VST Skins for 2025](https://vectorpresets.com/blogs/vital-skins/the-best-5-free-vital-vst-skins-for-2025-best-of-the-rest)
