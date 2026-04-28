# ACE-Step DAW — UX Improvement Checklist

> **Version:** 1.1 · **Last Updated:** 2026-04-09  
> **How to use:** Work top-down by priority. Each item is actionable and implementable.  
> **Priority:** P0 = Must ship, P1 = Should ship, P2 = Nice to have, P3 = Future

---

## Legend

- ⬜ Not started
- 🔄 In progress
- ✅ Complete
- ❌ Won't do (with reason)

---

## P0 — Critical (Must Ship)

### Core Audio & Transport
- ✅ **Audio context management** — Resume AudioContext on first user gesture (click/tap). Show clear "Click to enable audio" overlay if context is suspended. *Ref: Web Audio autoplay policy*
- ⬜ **Latency calibration** — Auto-detect `audioContext.outputLatency + baseLatency` on first use. Display detected latency in settings. Allow manual override.
- ⬜ **Lookahead scheduling** — Set Tone.js `lookAhead` to 0.1s (100ms). Schedule all audio events ahead of time. Visual playhead compensates for latency offset.
- ⬜ **Glitch-free playback** — Use AudioWorklet for any custom DSP. Never run audio processing on main thread. Test with 20+ tracks playing simultaneously.
- ✅ **Transport controls** — Play (`Space`), Stop (`Space` × 2 or `Home`), Record (`R`), Loop toggle (`L`). All must respond in < 16ms visually.

### Undo System
- ⬜ **Scoped undo stacks** — Implement separate undo stacks for: global arrangement, per-track, piano roll, mixer. Active scope = currently focused panel.
- ⬜ **Undo for AI actions** — Every AI generation creates a single undo point. "Undo" reverts entire AI action (not individual notes).
- ⬜ **Undo history panel** — Show list of named actions with timestamps. Click to jump to any point (branching undo tree, not just linear).
- ✅ **Cmd+Z / Cmd+Shift+Z** — Must always work, in every context, never fail silently.

### Dual-Surface API
- ⬜ **Zustand action parity** — Every UI interaction dispatches the same Zustand action an agent would call. No direct DOM manipulation for state changes.
- ✅ **DAWState.summary** — Auto-generated natural language summary of project state (tracks, BPM, key, structure). Updated on every state change. Used by LLM agents for context.
- ⬜ **Typed action API** — Full TypeScript interface for all DAW actions (see INTERACTION_DESIGN_GUIDE.md §5.1). Export as public API.
- ⬜ **Error responses with suggestions** — When an action fails, return error code + context + actionable suggestions (not just "error occurred").

### Save & Data Persistence
- ✅ **Auto-save** — Every 30 seconds to IndexedDB. No data loss on crash/close.
- ✅ **beforeunload warning** — Warn user if unsaved changes when closing tab.
- ✅ **Project format** — JSON metadata + audio blobs in IndexedDB. Define and document format.
- ✅ **Export: WAV mix** — Full mixdown to WAV file via OfflineAudioContext.

---

## P1 — Important (Should Ship)

### Timeline & Navigation
- ✅ **Minimap** — Always-visible project overview strip at top of timeline. Shows all clips as colored blocks. Click to navigate.
- ✅ **Zoom gestures** — `Cmd+Scroll` = horizontal zoom, `Cmd+Shift+Scroll` = vertical zoom, pinch on trackpad/touch.
- ✅ **Zoom to selection** — `Z` zooms to fit selected clips/region. `Shift+Z` zooms to fit entire project.
- ✅ **Adaptive grid** — Grid resolution auto-adjusts based on zoom level (zoomed out = bars, zoomed in = 16th notes).
- ✅ **Snap toggle** — `Cmd+G` toggles snap. Hold `Cmd` while dragging to temporarily disable snap.
- ✅ **Scrubbing** — Click-drag on timeline ruler to scrub audio. Scrub speed ∝ drag velocity.

### Drag & Drop
- ✅ **OS file drop** — Handle native drag-drop of audio files from Finder/Explorer into timeline. Use File API + `dataTransfer`. Auto-decode and create clip at drop position.
- ✅ **Drag preview ghost** — Show translucent clip preview during drag with snapped position indicator.
- ✅ **Drag between tracks** — Drag clips between tracks (auto-convert MIDI↔audio if needed, or warn).
- ✅ **Drag from loop browser** — One-gesture drag from browser panel to timeline.
- ✅ **Drag reorder** — Reorder tracks via drag-handle on track header.

### Piano Roll (Learn from FL Studio)
- ✅ **Ghost notes** — Show notes from other tracks as 15% opacity background. Toggle with 👻 button.
- ✅ **Draw/paint tools** — Pencil (single note), paint brush (repeat notes), select, erase. Number keys `1-4` to switch tools.
- ⬜ **Velocity color** — Note color = velocity (light = soft, saturated = loud). Also show velocity bars below piano roll.
- ✅ **Quick quantize** — `Q` quantizes selected notes to current grid. `Cmd+Q` opens quantize dialog with strength slider.
- ✅ **Chord stamp** — Click to place common chord shapes (maj, min, 7th, dim, etc.). Shortcut: hold `Shift` + click.
- ✅ **Note resize** — Drag right edge to change duration. Drag left edge to change start (and duration).
- ⬜ **Slide/portamento notes** — Special note type that bends between pitches. Visual: diagonal line between notes.

### AI Generation UX
- ✅ **Generation panel** — Sidebar panel with: text prompt, style tags, key/BPM/length selectors, temperature slider, variation count.
- ⬜ **Multi-variation output** — Always generate 2-4 variations. Show as they complete (don't wait for all).
- ⬜ **A/B comparison** — Keyboard `1`/`2`/`3`/`4` to switch between variations during playback. Visual indicator of which is active.
- ✅ **Progress with ETA** — Honest progress bar with estimated time remaining. Never fake progress.
- ✅ **Inline regeneration** — Select region on timeline → right-click → "Regenerate with AI". New content auto-crossfades at boundaries.
- ✅ **Prompt history** — Scrollable list of past prompts with timestamps. Click to re-use.
- ✅ **Prompt autocomplete** — Suggest genres, instruments, moods, techniques as user types.

### Keyboard Shortcuts
- ✅ **Single-key shortcuts** — `Space` play, `R` record, `L` loop, `S` solo, `M` mute, `Z` zoom-to-selection. Shared command layer now ignores focused text-entry and editable fields.
- ✅ **Context-sensitive keys** — Arrow keys do different things in timeline vs piano roll vs mixer.
- ✅ **Shortcut customization** — Full editor in settings. Import/export presets. Conflict detection.
- ✅ **DAW migration presets** — Shortcut presets for Ableton, Logic, FL Studio, Pro Tools users.
- ⬜ **Browser conflict prevention** — Prevent `Cmd+W`, `Cmd+T` etc. in DAW context. Use safe alternatives.

### Command Palette
- ✅ **Cmd+K** — Fuzzy-match command palette. Index every action, parameter, and setting.
- ⬜ **Natural language commands** — "add reverb to vocals" matches "Add Reverb effect to Track: Vocals".
- ✅ **Recent commands** — Show recently used commands at top.
- ⬜ **Parameter search** — Search for any parameter by name ("kick volume", "reverb decay").

---

## P2 — Nice to Have

### Visual Polish
- ✅ **Playhead glow** — 2px playhead with soft glow trail (not just a hard line).
- ✅ **AI clip distinction** — AI-generated clips have subtle gradient/sparkle overlay (✨) to distinguish from manual.
- ✅ **Recording pulse** — Pulsing red border on recording track. Growing waveform display.
- ✅ **Clip transitions** — Smooth animation when clips are created, moved, deleted (200ms ease-out).
- ⬜ **Hover preview in browser** — Hovering over a loop in the browser auto-plays preview (300ms delay to prevent accidental triggers).

### Mixer
- ✅ **Level meters** — Per-track vertical meters with green→yellow→red gradient. Peak hold indicator. 60fps.
- ⬜ **Clip indicator** — Red dot at top of meter when clipping. Click to reset.
- ⬜ **Pan knob** — Horizontal slider or knob. Center-detented. Double-click to center.
- ⬜ **Channel strip** — Volume fader + pan + solo/mute + 4 insert slots + 2 send knobs per track.
- ⬜ **Bus/send routing** — Visual routing diagram. Drag to create sends.

### Touch Support
- ⬜ **44px minimum touch targets** — All interactive elements ≥ 44x44px on touch devices.
- ⬜ **Touch gesture mapping** — Tap=click, double-tap=double-click, long-press=right-click, pinch=zoom, two-finger-pan=scroll.
- ⬜ **Touch mode toggle** — Settings option to enlarge all controls for touch use.
- ⬜ **Floating toolbar** — Context toolbar that appears near selection on touch devices.

### Accessibility
- ⬜ **ARIA landmarks** — `role="application"` on main DAW, `role="toolbar"` on transport, `role="grid"` on timeline.
- ⬜ **Screen reader clip announcements** — Clips announced as: "Track name, clip type, bars 1 to 4, audio/MIDI".
- ⬜ **Keyboard-only full workflow** — Test: can a user create a full song using only keyboard? Document any gaps.
- ⬜ **Color-blind safe palette** — 16-color palette tested for deuteranopia, protanopia, tritanopia (see design guide §7.2).
- ⬜ **Shape coding** — Track type icons alongside colors (hexagon=drums, wave=melodic, mic=vocal, etc.).
- ⬜ **High contrast mode** — Toggle for increased border/text contrast.
- ✅ **Reduced motion** — Respect `prefers-reduced-motion`. Disable decorative animations, keep functional ones.

### Performance
- ⬜ **Virtualized track rendering** — Only render visible tracks in DOM. Use react-window or react-virtuoso.
- ⬜ **Canvas/WebGL waveforms** — Never render waveforms as DOM elements. Use Canvas for overview, WebGL for detailed editing.
- ⬜ **Web Workers for analysis** — Offload waveform computation, audio analysis, peak detection to Web Workers.
- ⬜ **Lazy effect instantiation** — Only create Tone.js effect nodes when track is playing or soloed.
- ⬜ **Zustand store slicing** — Components subscribe to minimal state slices. No re-renders from unrelated state changes.

### Onboarding
- ⬜ **Genre template selection** — First-run: pick genre → pre-configured BPM, key, instruments, template tracks.
- ⬜ **Complexity tier** — Choose Simple/Standard/Advanced. Hides/shows features accordingly.
- ⬜ **5-step interactive tutorial** — Overlay tutorial highlighting: timeline, transport, AI panel, mixer, Cmd+K. Skippable.
- ⬜ **Contextual tips** — First-time tips on features (stored in localStorage, dismissed permanently).
- ⬜ **Demo projects** — Pre-loaded projects in different genres showing DAW capabilities.

---

## P3 — Future / Stretch

### Advanced Features
- ✅ **Session View / Clip Launcher** — Ableton-style grid of clips for non-linear performance. Record into Arrangement from Session.
- ⬜ **Modulators** — Bitwig-style drag-modulator-onto-parameter system. LFO, step sequencer, envelope follower.
- ⬜ **Nested devices** — Effects and instruments can contain sub-chains.
- ⬜ **Capture MIDI** — Retroactive MIDI recording (Ableton-style). Always-on MIDI buffer, "Capture" saves last N bars.
- ✅ **Quick Sampler** — Drag any audio → instant playable instrument (Logic-style).
- ⬜ **Smart Controls** — Macro knobs that control multiple parameters. Beginner-friendly, mappable.
- ⬜ **Per-note expressions** — Pitch bend, pressure, timbre per note (MPE data model).
- ⬜ **Comping** — Record multiple takes, visually comp best sections.

### Collaboration
- ⬜ **Real-time multiplayer** — Google Docs-style simultaneous editing. WebSocket sync.
- ⬜ **Project sharing** — Share link, fork, remix (BandLab-style social).
- ⬜ **Comments** — Time-stamped comments on timeline (like SoundCloud but for editing).
- ✅ **Version history** — Git-like project versioning with named checkpoints.

### AI Advanced
- ⬜ **AI suggestions (passive)** — Sparkle icon (✨) appears when AI has arrangement suggestions. Non-intrusive, dismissable.
- ⬜ **AI suggestions (active)** — "What should come next?" button. Tab-to-autocomplete in empty regions.
- ⬜ **Reference track input** — Drag reference audio for style-matching generation.
- ⬜ **AI confidence scores** — Show generation quality confidence. Let user set minimum threshold.
- ⬜ **Prompt-from-clip** — "Describe this clip" → AI generates text description → user modifies → regenerate.
- ⬜ **AI mixing assistant** — "Balance this mix" → AI adjusts volumes, panning, basic EQ.

### Offline & PWA
- ⬜ **Service Worker** — Cache app shell for offline-first loading.
- ⬜ **IndexedDB audio cache** — Cache loop library and project audio for offline use.
- ⬜ **Sync queue** — Queue collaboration changes when offline, sync on reconnect.
- ⬜ **Storage management UI** — Show storage usage, allow cleanup of old projects.
- ⬜ **Persistent storage** — Request `navigator.storage.persist()` for important projects.

### Export & Integration
- ✅ **Stem export** — Export each track as individual WAV file.
- ✅ **MIDI export** — Export MIDI data for use in other DAWs.
- ⬜ **File System Access API** — Native save/open dialogs where browser supports it.
- ⬜ **Multi-project** — Open multiple projects, drag between them (Bitwig-style).

### Design System Polish
- ⬜ **Dockable panels** — VS Code-style panel docking, resizing, popping out to windows.
- ⬜ **Layout presets** — "Arrangement", "Mixing", "Editing", "AI Studio" one-click layouts.
- ⬜ **Multi-monitor** — Pop panels out to separate browser windows.
- ⬜ **Theme customization** — User-adjustable accent color, background tint.

---

## Implementation Priority Order

**Sprint 1 (Foundation):**
1. Audio context management + latency calibration
2. Dual-surface Zustand API (typed actions)
3. Undo system (scoped stacks)
4. Auto-save to IndexedDB
5. Basic keyboard shortcuts (Space, R, Cmd+Z)

**Sprint 2 (Core Editing):**
1. Timeline zoom/scroll/snap
2. Drag-and-drop (OS files, clips between tracks)
3. Piano roll (draw, select, ghost notes, quantize)
4. Mixer (volume, pan, mute/solo, meters)
5. Command palette (Cmd+K)

**Sprint 3 (AI Integration):**
1. AI generation panel (prompt → generate → compare)
2. Multi-variation output + A/B comparison
3. Inline regeneration (select → regenerate)
4. Progress indicators
5. AI error handling with suggestions

**Sprint 4 (Polish & Access):**
1. Onboarding flow (genre, complexity, tutorial)
2. Touch support
3. Accessibility (ARIA, keyboard-only, color-blind palette)
4. Performance optimization (virtualization, Canvas waveforms)
5. Visual polish (playhead glow, animations, hover previews)

**Sprint 5+ (Expansion):**
1. Session View / clip launcher
2. Real-time collaboration
3. PWA / offline
4. Advanced AI features
5. Modulators, Quick Sampler, Smart Controls

---

## Testing Checklist

### Audio Quality
- [ ] No glitches during 10-minute playback with 20 tracks
- [ ] Latency < 50ms on Chrome, Firefox, Safari
- [ ] Audio context resumes correctly after tab switch
- [ ] Offline audio context renders correctly for export

### Keyboard Workflow
- [ ] Can create complete 8-bar loop using only keyboard
- [ ] Cmd+Z works in every panel/context
- [ ] No keyboard shortcuts conflict with browser defaults
- [ ] Screen reader can navigate all controls

### AI Generation
- [ ] Generation completes within 60 seconds
- [ ] Progress indicator matches actual progress (±10%)
- [ ] All variations play in correct musical context
- [ ] Undo fully reverts any AI action
- [ ] Agent API produces same results as UI interaction

### Cross-Browser
- [ ] Chrome: all features working
- [ ] Firefox: all features working (note: Web Audio differences)
- [ ] Safari: all features working (note: AudioWorklet limitations)
- [ ] Mobile Safari: touch interactions working
- [ ] Chrome Android: touch interactions working

### Performance
- [ ] 100 tracks render without jank (< 16ms frame time)
- [ ] Waveform zoom is smooth at all levels
- [ ] Memory usage stays under 500MB for typical project
- [ ] IndexedDB operations don't block UI

---

*Update this checklist as items are completed. Add new items as features are designed.*
