# Automation & Parameter Control UX Research

> Date: 2026-03-27 | Scope: Automation editing, parameter control, and modulation UI in DAWs vs ACE-Step

---

## 1. Ableton Live Automation

### Automation Modes
- **No dedicated modes in arrangement**: Draw automation directly on clips or arrangement
- **Session View**: Automation recorded via MIDI mapping or mouse movement during playback
- **Arrangement automation**: Breakpoint envelopes drawn on tracks
- **Clip automation**: Per-clip envelopes that loop with the clip

### Drawing & Editing
- **Breakpoint editing**: Click to add points, drag to move
- **Line segments**: Straight lines between breakpoints (no curves in standard mode)
- **Draw mode (B key)**: Freehand drawing of automation curves
- **Grid snapping**: Automation points snap to beat grid
- **Select + drag**: Move multiple points together
- **Cmd+A**: Select all automation on track

### Envelope Display
- **Overlay on clip**: Automation drawn directly on top of audio/MIDI clips
- **Device parameter chooser**: Dropdown to select which parameter to automate
- **Color coding**: Each automated parameter gets distinct color
- **Show/hide**: Toggle automation visibility per track

## 2. Logic Pro Automation

### 4 Automation Modes
- **Read**: Plays back existing automation (default)
- **Touch**: Records changes while touching control, returns to previous value on release
- **Latch**: Records changes, holds last value when control released
- **Write**: Overwrites all existing automation with new values

### Curve Editing
- **Bezier curves**: Drag between points to create curved transitions
- **Step automation**: Square wave style — instant jumps between values
- **Automation Select tool**: Region-based selection for batch editing
- **Relative mode**: Offset existing automation up/down without changing curve shape
- **MIDI Learn**: Move hardware control → auto-assign to parameter

### Automation Lanes
- **Per-track lanes**: Each parameter gets its own sub-lane below the track
- **Multiple lanes visible**: See volume, pan, filter simultaneously
- **Lane height adjustment**: Resize for precision editing
- **Copy/paste automation**: Between tracks or parameters

## 3. Studio One — Best Automation Painting

### Paint Tool
- **Shape painting**: Draw sine, square, triangle, saw, random shapes
- **Grid-synced shapes**: LFO-like automation snapped to beat grid
- **Transform tool**: Scale, stretch, invert automation regions
- **Part automation**: Automation moves with the clip (not fixed to timeline)

### Automation Modes
- **Touch, Latch, Write**: Standard modes
- **Trim**: Offset automation by percentage (±, multiplicative)
- **Cross-fade automation**: Smooth transitions between automation regions

## 4. FL Studio Automation

### Automation Clips
- **Automation as clips**: Automation is placed on playlist as colored clips
- **LFO tool**: Built-in LFO shape generator (sine, saw, triangle + parameters)
- **Curve types**: Single curve, hold, smooth, stairs, half-sine, etc.
- **Event editor**: Per-event automation with fine control
- **Link to controller**: Right-click any knob → Link to controller → assign MIDI CC

### Unique Features
- **Copy state → Paste as automation**: Copy current parameter values as starting point
- **Scale levels**: Select automation region → scale by percentage
- **LFO shape drawing**: Draw custom LFO shapes that repeat

## 5. Bitwig Studio

### Modulation vs Automation
- **Automation**: Traditional timeline-based parameter changes
- **Modulation**: Real-time modulators (LFOs, envelopes, followers) assigned to parameters
- **Per-voice modulation**: Modulate parameters per individual note (MPE)
- **Expressions**: Timbre, pressure, slide — per-note modulation lanes

### Modulator Devices
- **LFO**: Sync or free-running, multiple shapes
- **Envelope follower**: Track audio amplitude → modulate parameter
- **Step sequencer**: 16-step modulation source
- **Math**: Combine modulation sources (add, multiply, etc.)
- **Keytrack**: Modulate based on played note pitch

## 6. ACE-Step Current State

### What Exists
- **TempoLane.tsx**: Tempo change markers on timeline (not general automation)
- **AutomationLane in store**: Data model for per-track automation lanes
- **AutomationPoint type**: `{ beat, value, curveType }` — supports linear/exponential/logarithmic
- **No automation UI**: No drawing, no editing, no visualization of automation curves
- **No MIDI learn**: No controller mapping
- **Knob.tsx**: Supports vertical drag, double-click reset — but no automation recording

### Key Gaps
| Feature | Competitors | ACE-Step |
|---|---|---|
| Draw automation curves | All | No UI |
| Automation modes (Touch/Latch/Write) | Logic, Studio One, Pro Tools | No |
| Bezier/curved automation | Logic, FL | Data supports, no UI |
| Multiple automation lanes per track | All | Data exists, no UI |
| LFO-shaped automation | FL Studio, Studio One | No |
| MIDI Learn / controller mapping | All | No |
| Relative automation (trim) | Studio One | No |
| Paint/shape tools | Studio One (best) | No |
| Per-clip automation | Ableton, Bitwig | No |
| Modulation routing (non-timeline) | Bitwig, Serum, Vital | No |

---

## 7. Recommendations for ACE-Step

### Phase 1: Basic Automation Drawing
- **Automation lane UI**: Show/hide lanes below each track
- **Click to add points**: Breakpoint creation on the automation lane
- **Drag points**: Move existing breakpoints
- **Parameter selector**: Dropdown to choose volume, pan, effect params
- **Line segments**: Linear interpolation between points (simplest to implement)

### Phase 2: Recording & Curves
- **Touch mode**: Record automation by moving knobs during playback
- **Bezier curves**: Drag between points for curved transitions
- **Automation overlay on clips**: Draw automation on top of clip content
- **Copy/paste automation**: Between tracks and parameters
- **Snap to grid**: Automation points snap to beat divisions

### Phase 3: Creative Automation
- **LFO tool**: Paint repeating shapes (sine, saw, square) synced to grid
- **Trim/relative mode**: Offset existing automation curves
- **Per-clip automation**: Automation that loops with clip
- **MIDI Learn**: Right-click knob → move hardware control → mapped
- **Modulation routing**: LFO/envelope → parameter (Bitwig-style)

---

## Sources

- [Ableton Live 12: Automation & Envelopes — Ableton Manual](https://www.ableton.com/en/manual/automation-and-editing-envelopes/)
- [Logic Pro: Automation Overview — Apple Support](https://support.apple.com/guide/logicpro/automation-overview-lgce1e9bsf6b/mac)
- [Studio One: Automation — PreSonus Manual](https://www.presonus.com/learn/technical-articles/automation-studio-one)
- [FL Studio: Automation Clips — Image-Line Manual](https://www.image-line.com/fl-studio-learning/fl-studio-online-manual/html/automation_clip.htm)
- [Bitwig Studio: Modulators — Bitwig Documentation](https://www.bitwig.com/stories/modulators/)
