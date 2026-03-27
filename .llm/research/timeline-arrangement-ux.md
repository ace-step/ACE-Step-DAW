# Timeline & Arrangement UX Research

> Date: 2026-03-27 | Scope: Arrangement view UX in mainstream DAWs vs ACE-Step

---

## 1. Ableton Live Arrangement View

### Navigation & Zoom
- **Overview bar**: Shows entire arrangement in miniature, click/drag to navigate
- **Beat-time ruler zoom**: Click+drag vertically in ruler to zoom (drag horizontally to scroll)
- **Pinch gesture**: Trackpad/touchscreen zoom support
- **Cmd+scroll**: Horizontal zoom anchored to cursor position

### Clip Editing
- **Surface-level editing**: Edit clips without opening detail view
- **Option+Shift+drag**: Scrub through clip's audio position in arrangement
- **Arrow keys**: Nudge selected clips, snaps to grid (Cmd for fine adjust)
- **Cut Time (Cmd+Shift+Delete)**: Removes time selection, moves everything closer
- **Consolidate (Cmd+J)**: Merge selected clips into one
- **Auto-crossfade**: 4ms fade at clip boundaries by default
- **Lock Envelopes**: Automation stays at song position when clips are moved

### Unique Dual-View System
- **Session View**: Clip launcher for improvisation/looping
- **Arrangement View**: Linear timeline for structured composition
- **Session → Arrangement**: Record session clips into arrangement

## 2. Logic Pro Tracks Area

### Region Operations
- **Split (Cmd+T)**: Split at playhead
- **Join (Cmd+J)**: Merge selected regions
- **Flex Time**: Non-destructive time stretching with visible warp markers
- **Take Folders**: Multiple takes stacked, click to select best sections (best comping UX)
- **Quick Swipe Comping**: Click-drag across take lanes to select best parts

### Automation
- **Show/hide automation lanes** per track
- **Multiple parameters per track**: Each gets own lane
- **4 automation modes**: Read, Touch, Latch, Write

## 3. FL Studio Playlist

### Pattern-Based + Audio Clips
- **Patterns**: MIDI patterns placed as clips on timeline
- **Audio clips**: Direct audio on same timeline
- **No track ownership**: Any pattern/audio can go on any track (flexible but unusual)
- **Horizontal zoom**: Mouse wheel on ruler
- **Clip operations**: Split, slice, merge, reverse, time-stretch handles

## 4. Reaper Arrange

### Highly Customizable
- **Items**: Clips can contain audio, MIDI, or both
- **Takes**: Multiple takes per item, cycle through with T key
- **Custom actions**: Scriptable macro system
- **Razor editing**: Select time range across multiple tracks visually

## 5. ACE-Step Current State

### What Exists
- Timeline.tsx (~500 LOC): Main container with zoom/pan/selection
- TrackLane.tsx: Renders clips per track with drag-and-drop
- ClipBlock.tsx: Individual clip with status overlay, resize handles
- TimeRuler.tsx: Measures/beats with loop braces
- Minimap.tsx: Full project overview sidebar
- Playhead.tsx: Animated with blinking triangle
- GridOverlay.tsx: Bar/beat/eighth/sub divisions
- SelectionFloatingToolbar.tsx: Context actions for selected clips
- TempoLane.tsx: Tempo change markers
- ArrangementMarkers.tsx: Section labels (Intro/Verse/Chorus)
- Drag-and-drop: Move/resize clips
- Multi-select: Shift/Ctrl+click
- Context menus: Right-click for clip/canvas actions

### Key Gaps
| Feature | Competitors | ACE-Step |
|---|---|---|
| Split at playhead (Cmd+E) | All | No |
| Fade in/out handles | All | Data exists, no drag UI |
| Crossfade on overlap | All | No |
| Duplicate (Cmd+D) | All | No shortcut |
| Loop/repeat clip | All | No |
| Reverse clip | All | No |
| Take lanes / comping | Logic (best) | Data model exists, no UI |
| Clip color override | All | Track color only |
| Time-stretch handles | All | No |
| Consolidate shortcut | Ableton, Logic | Store action only |

---

## 6. Recommendations

### Phase 1: Essential Clip Operations
- Split at playhead (Cmd+E)
- Duplicate clip (Cmd+D)
- Fade handles (6px drag zones at clip corners)
- Crossfade on overlap

### Phase 2: Advanced Editing
- Take lane UI with comping
- Clip color override
- Reverse clip
- Loop/repeat

### Phase 3: Polish
- Time-stretch handles on clips
- Razor editing (Reaper-style)
- Consolidate shortcut

---

## Sources

- [Arrangement View — Ableton Reference Manual v12](https://www.ableton.com/en/manual/arrangement-view/)
- [Quick Editing in Ableton Live's Arrangement View](https://musictech.com/tutorials/ableton-live/quick-editing-in-ableton-lives-arrangement-view/)
- [Surface Level Clip Editing in Arrangement View](https://www.patches.zone/ableton-tutorials/surface-level-clip-editing)
- [Ableton Live Redesign Case Study](https://nenadmilosevic.co/ableton-live-redesign/)
- [Ableton Live: Session & Arrangement Views](https://www.soundonsound.com/techniques/ableton-live-session-arrangement-views)
