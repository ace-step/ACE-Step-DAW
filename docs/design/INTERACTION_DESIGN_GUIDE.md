# ACE-Step DAW — Interaction Design Guide

> **Version:** 1.0 · **Last Updated:** 2026-03-18  
> **Stack:** React + TypeScript + Zustand + Tone.js · Browser-based  
> **Goal:** Best AI-native DAW in the world — for humans AND agents

---

## Table of Contents

1. [Design Philosophy](#1-design-philosophy)
2. [Competitive Analysis](#2-competitive-analysis)
3. [Core UX Principles](#3-core-ux-principles)
4. [Browser-Specific Design](#4-browser-specific-design)
5. [AI-Agent Interaction Design](#5-ai-agent-interaction-design)
6. [AI Generation UX](#6-ai-generation-ux)
7. [Accessibility & Inclusive Design](#7-accessibility--inclusive-design)
8. [Design System](#8-design-system)
9. [Onboarding & Progressive Disclosure](#9-onboarding--progressive-disclosure)
10. [Keyboard & Shortcut Design](#10-keyboard--shortcut-design)

---

## 1. Design Philosophy

### The ACE-Step Manifesto

ACE-Step is not a traditional DAW that bolted on AI. It's an **AI-native DAW** where every interaction is designed to be performed by either a human hand or an AI agent — and often both collaborating.

**Three Pillars:**

1. **Dual-Surface Design** — Every feature has a visual interaction AND a programmatic API. No feature is GUI-only; no feature is API-only.
2. **Non-Destructive by Default** — Every action creates a reversible state change. The user (human or AI) can always go back.
3. **Progressive Complexity** — A beginner sees a simple loop maker. A producer sees a full DAW. An agent sees a scriptable audio graph.

### Design Priorities

| Priority | Principle | Rationale |
|----------|-----------|-----------|
| P0 | **Playback must never glitch** | Audio latency is the #1 trust-killer |
| P0 | **Undo must always work** | Confidence to experiment comes from safety nets |
| P1 | **Every action is scriptable** | AI agents need programmatic access |
| P1 | **Visual feedback is instant** | Even if audio has latency, UI must respond in <16ms |
| P2 | **Touch-friendly targets** | Browser DAW = tablet users |
| P2 | **Keyboard-first power users** | Pro producers never touch a mouse for common actions |
| P3 | **Offline capability** | PWA for reliability |

---

## 2. Competitive Analysis

### 2.1 Ableton Live

**What makes it magical:**
- **Session View ↔ Arrangement View duality** — The single most innovative DAW concept. Session View is a non-linear clip launcher (grid of clips, fire any combination). Arrangement View is a traditional timeline. You can **record from Session into Arrangement**, bridging improvisation and composition.
- **Warping** — Any audio can be tempo-matched in real-time. Drag any audio file in and it just works at the current BPM.
- **Capture MIDI** — Records MIDI retroactively. You play something, then hit "Capture" and it saves what you just played. Solves the "I wasn't recording" problem.

**Keyboard shortcut philosophy:**
- Single-key shortcuts (no modifiers): `Tab` toggles Session/Arrangement, `Space` play/stop, `0` activates clips
- Modifier keys add precision: `Cmd+Z` undo, `Cmd+Shift+Z` redo
- Context-sensitive: same key does different things depending on focus (clip view, arrangement, mixer)

**Undo/Redo:**
- Linear undo stack per project
- **Limitation:** undo doesn't capture every parameter change (automation, some MIDI edits are grouped)
- No branching undo — a known frustration

**Drag-and-drop:**
- Drag from browser sidebar → track (works great)
- Drag between tracks to copy clips (intuitive)
- **Frustration:** Can't drag from OS Finder directly into Session View clips easily
- Drag to reorder devices in chain

**Onboarding:**
- Minimal in-app onboarding; relies on Ableton's learning site and community
- "Learn Live" interactive tutorials shipped with recent versions
- Heavy reliance on community knowledge (YouTube ecosystem)

**ACE-Step Takeaways:**
- ✅ Implement a Session/Arrangement duality (clip launcher + timeline)
- ✅ Implement retroactive MIDI capture
- ✅ Single-key shortcuts for common actions
- ✅ Make drag-and-drop work from OS into browser (File API + drag events)

---

### 2.2 Logic Pro

**What makes it magical:**
- **Smart Controls** — Simplified macro knobs that control multiple parameters at once. Beginners get 4-8 knobs; pros can map them to anything.
- **Flex Time / Flex Pitch** — Drag notes in audio waveform to fix timing/pitch. Feels like editing MIDI but on audio.
- **Quick Sampler** — Drag ANY audio onto Quick Sampler and immediately play it as an instrument. One-step workflow from sample to playable instrument.
- **Drummer** — AI-like virtual drummer that follows genre/complexity/feel sliders. Not truly AI, but the UX of "adjust feel → get new pattern" is the gold standard.

**Keyboard shortcut philosophy:**
- Default set is huge (200+ shortcuts)
- Fully customizable key commands window
- Many actions have NO default shortcut — you add your own

**Undo/Redo:**
- Comprehensive undo history with named steps
- Separate undo for mixer vs arrangement (smart scoping)
- Undo list is viewable as a history panel

**Drag-and-drop:**
- Apple ecosystem polish: drag from Finder, Apple Loops, anywhere
- Drag regions between tracks auto-converts (MIDI ↔ audio via Flex)
- **Frustration:** Some drag operations require precise hit targets

**Onboarding:**
- Step-by-step project templates ("Electronic", "Hip Hop", "Songwriter")
- In-app Quick Help (hover to learn)
- GarageBand → Logic upgrade path is seamless

**ACE-Step Takeaways:**
- ✅ Implement Smart Controls / macro knobs for simplified control
- ✅ Quick Sampler workflow: drag audio → instant instrument
- ✅ Drummer-style AI pattern generation with feel sliders
- ✅ Template-based onboarding per genre
- ✅ Separate undo scopes (mixer vs timeline vs piano roll)

---

### 2.3 FL Studio

**What makes it magical:**
- **Piano Roll** — Universally considered the best piano roll in any DAW. Why?
  - Ghost notes (see notes from other channels as translucent)
  - Paint/draw/slice tools with brush modes
  - Portamento slides between notes via slide notes
  - Stamp tool for chord shapes
  - Randomize/humanize with fine control
  - Color-per-note for velocity or custom grouping
- **Pattern-based workflow** — Patterns are self-contained loops. Channel Rack holds instruments. Patterns go into the Playlist (timeline). This separation makes beat-making incredibly fast.
- **Channel Rack** — Simple step sequencer that's always visible. Click steps to build drum patterns in seconds.

**Keyboard shortcut philosophy:**
- Right-click menus are king (context menus for everything)
- Fewer keyboard shortcuts by default; more mouse-driven
- Number keys select tools (pencil, slice, select, zoom)

**Undo/Redo:**
- Per-pattern undo (nice isolation)
- `Ctrl+Alt+Z` for undo history browser
- Can undo/redo across different views independently

**Drag-and-drop:**
- Drag patterns from picker to playlist
- Drag samples from browser to channel rack
- Drag automation clips from any parameter
- **Frustration:** Some inter-panel drags feel clunky on HiDPI

**Onboarding:**
- Demo projects that showcase different genres
- Tooltip-rich UI (hover any knob/button for explanation)
- Lifetime free updates creates loyal, patient learner base

**ACE-Step Takeaways:**
- ✅ Piano roll is P0: ghost notes, stamp tool, portamento slides
- ✅ Pattern-based workflow alongside timeline arrangement
- ✅ Step sequencer always visible for drums
- ✅ Rich tooltip system on hover
- ✅ Per-scope undo (pattern vs arrangement vs mixer)

---

### 2.4 Bitwig Studio

**What makes it magical:**
- **Modulators** — Any parameter can be modulated by LFOs, step sequencers, envelopes, audio followers. Drag a modulator onto any knob. No other DAW makes modular-style patching this accessible.
- **Nested Devices** — Devices can contain other devices. Create layered instrument/effect chains visually.
- **The Grid** — Built-in modular synthesis environment. Build custom instruments from primitive modules.
- **Clip Launcher + Arranger** seamlessly integrated (inspired by Ableton, but more flexible)
- **Per-note expressions** — Each MIDI note has its own pressure, timbre, pitch bend curves. First-class MPE support.
- **Multi-touch** — Dedicated touch support, not an afterthought.

**Keyboard shortcut philosophy:**
- Clean, consistent modifiers
- Heavy use of `Ctrl+` for non-destructive operations
- Context-sensitive (like Ableton)

**Undo/Redo:**
- Per-device undo chains
- Separate undo for arrangement vs detail editor
- Crash recovery auto-saves

**Drag-and-drop:**
- Drag modulators onto parameters (the killer DnD pattern)
- Drag between projects (multi-project support)
- Drag to create automation lanes

**Onboarding:**
- Dashboard with video tutorials
- Context-aware browser suggests relevant content

**ACE-Step Takeaways:**
- ✅ Modulator drag-to-assign pattern (modulators → knobs)
- ✅ Nested device chains
- ✅ Per-note expressions / MPE-ready data model
- ✅ Multi-touch from day one
- ✅ Auto-save + crash recovery

---

### 2.5 BandLab / Soundtrap (Browser-Based)

**What makes them work in browser:**
- **BandLab:**
  - Free, social-first (share/collaborate/fork projects)
  - Mobile-first design → UI is touch-optimized
  - Simplified mixer (fewer tracks, simpler effects)
  - Real-time collaboration (Google Docs for music)
  - Loops library integrated into creation flow
  - **Limitation:** 12-track max, limited MIDI editing, latency issues on Firefox

- **Soundtrap (by Spotify):**
  - Education-focused (classroom collaboration)
  - Real-time multiplayer editing
  - Podcast + music tools unified
  - Better MIDI than BandLab, still limited vs desktop DAWs
  - Sound library with bi-weekly drops (keeping content fresh)
  - **Limitation:** No piano roll as sophisticated as desktop DAWs

**Browser-specific solutions they've implemented:**
- Audio context resume on first user gesture (autoplay policy)
- WebSocket-based real-time sync for collaboration
- IndexedDB for local project caching
- Web Workers for audio processing off main thread
- Simplified UI to reduce DOM complexity

**ACE-Step Takeaways:**
- ✅ Real-time collaboration from launch
- ✅ Mobile-first responsive layout
- ✅ Social features (share, fork, remix)
- ✅ Audio context management (user gesture requirement)
- ⚠️ Don't limit track count — be a real DAW, not a toy
- ⚠️ Piano roll must match desktop quality

---

### 2.6 Suno / Udio / AI Music Tools

**Suno UX patterns:**
- **Prompt → Generate → Listen → Iterate** cycle
- Text prompt input (lyrics + style description)
- Two generations per prompt (A/B comparison built-in)
- Generation takes 30-60 seconds → progress animation
- "Extend" feature to continue a generation
- "Remix" to regenerate with variations
- Social feed of public creations for inspiration
- **No fine-grained editing** — generate and accept/reject

**Udio UX patterns:**
- Similar prompt-based flow
- More audio quality controls
- Inpainting: select a section, regenerate just that part
- Better style transfer UX

**Key UX insights from AI music tools:**
- **A/B generation is essential** — never show just one result
- **Progress must be visible and honest** (fake progress bars destroy trust)
- **"Extend"/"Continue" is a core action** — not just "generate new"
- **Prompt history must be saved and browsable**
- **Style/genre selection should be visual**, not just text
- **The listen → refine → regenerate loop** must be tight (< 3 clicks to iterate)

**ACE-Step Takeaways:**
- ✅ Always generate 2+ variations for comparison
- ✅ Progress indicator with estimated time remaining
- ✅ Inline regeneration (select region → regenerate)
- ✅ Prompt history panel
- ✅ Style browser with audio previews
- ✅ But ALSO give fine-grained editing (our differentiator over Suno)

---

## 3. Core UX Principles

### 3.1 Temporal Interaction

**Scrubbing:**
- Click-drag on timeline ruler to scrub audio
- Scrub speed proportional to drag velocity
- Visual playhead follows immediately (audio may have slight latency — that's ok)
- **Agent equivalent:** `transport.seek(time)` with immediate state update

**Zooming:**
- Horizontal zoom: `Cmd+Scroll` or pinch on trackpad/touch
- Vertical zoom: `Cmd+Shift+Scroll`
- Zoom-to-selection: `Z` key
- Zoom-to-fit: `Shift+Z`
- Minimap overview always visible at top of timeline
- Zoom level persisted per project
- **Agent equivalent:** `view.setZoom({ horizontal: 4, vertical: 2 })`

**Loop Regions:**
- Click-drag on loop bar above timeline
- `L` toggles loop on/off
- Double-click loop region to zoom to it
- Loop region snaps to grid (quantize)
- Visual: loop region shown as colored band with clear start/end handles
- **Agent equivalent:** `transport.setLoop(startBeat, endBeat)`

**Snap/Grid:**
- Grid resolution: 1/1, 1/2, 1/4, 1/8, 1/16, 1/32, triplets, dotted
- Toggle snap: `Cmd+G` (or click snap button)
- Hold `Cmd` while dragging to temporarily disable snap
- Grid lines should be subtle but readable (low contrast, dotted)
- Adaptive grid: auto-adjust resolution based on zoom level

### 3.2 Non-Destructive Editing

**Every edit must be reversible:**
- Audio edits create virtual cuts (trim points), never delete source audio
- Effects are applied non-destructively via processing chain
- AI generations stored as versions, original always preserved
- "Flatten" / "Bounce" is an explicit, opt-in action

**Implementation pattern:**
```typescript
interface EditAction {
  type: string;
  target: TrackId | ClipId | RegionId;
  params: Record<string, any>;
  previousState: Snapshot;  // For undo
  timestamp: number;
}
```

**Undo Architecture (P0):**
- **Scoped undo stacks:**
  - Global stack (arrangement-level changes)
  - Per-track stack (track-level edits)
  - Piano roll stack (note-level edits)
  - Mixer stack (mix parameter changes)
- Active scope determined by UI focus
- `Cmd+Z` undoes in active scope; `Cmd+Shift+Z` redoes
- Undo history panel (like Photoshop) showing named actions
- Branching undo (tree, not linear) — preserve discarded branches for 24h
- **Agent equivalent:** `history.undo(scope?)`, `history.getStack(scope)`

### 3.3 Real-Time Feedback

**Visual feedback budget:**
- UI response to input: **< 16ms** (single frame)
- Waveform rendering update: **< 33ms** (30fps minimum)
- Meter/level updates: **< 50ms** (20fps minimum, 60fps ideal)
- Audio latency: **< 20ms** ideal, **< 50ms** acceptable (Web Audio API constraint)

**Visual feedback patterns:**
- Waveform highlight on hover (subtle glow/brightness increase)
- Drag ghost showing where clip will land
- Parameter value tooltip on hover/drag
- Playhead with glow trail (not just a line — a 2px soft glow for visibility)
- Recording: pulsing red border on recording track + growing waveform

**Audio feedback:**
- Click track during recording (adjustable volume, sound)
- Preview on hover in loop browser (play on hover with 300ms delay)
- Audition on drag (hear the audio as you drag it)

### 3.4 Progressive Disclosure

**Three Complexity Tiers:**

**Tier 1 — Creator (Beginner):**
- Single-screen layout: timeline + simple mixer
- Max 8 tracks visible
- Instruments as presets (not synthesizers)
- AI generation front and center
- "Suggest" button generates AI ideas
- No automation lanes, no piano roll unless opened
- Loop browser prominent

**Tier 2 — Producer (Intermediate):**
- Multi-panel layout: timeline + piano roll + mixer + browser
- Automation lanes visible
- Effects chain editing
- MIDI editing with quantize tools
- AI as assistant (suggestions in sidebar)
- Export/bounce options

**Tier 3 — Engineer (Advanced):**
- Full modular routing
- Sidechain, bus routing, sends
- Per-note expressions
- Scripting console for agents
- Plugin hosting (if available)
- Multi-project support

**Transition between tiers:**
- Settings toggle: "Complexity: Simple / Standard / Advanced"
- Or: features unlock as user performs actions (adaptive disclosure)
- Hidden features still accessible via Command Palette (`Cmd+K`)

### 3.5 Color & Visual Language

**Track colors:**
- Auto-assign from a curated palette of 16 colors
- Colors should be:
  - High saturation (60-80%) for clip bodies
  - Lower saturation for track headers
  - Consistent hue mapping: drums → warm (orange/red), bass → cool (blue/indigo), vocals → warm neutral (coral/peach), synths → vibrant (purple/green)
- User-overridable per track

**Clip visual language:**
- Audio clips: show waveform inside colored rectangle
- MIDI clips: show note bars (mini piano roll) inside colored rectangle
- AI-generated clips: subtle sparkle/gradient overlay ✨ to distinguish from manual
- Loop points: triangle markers at clip boundaries
- Muted clips: 50% opacity
- Selected clips: bright border + slight elevation (shadow)

**State indicators:**
- Recording: red pulse
- Soloed: yellow highlight
- Muted: grayed out
- Armed: red ring on record button
- AI processing: animated gradient border (purple → blue shimmer)

---

## 4. Browser-Specific Design

### 4.1 Audio Latency Strategy

**The problem:** Web Audio API introduces 128-sample buffer minimum (~2.9ms at 44.1kHz), but real-world browser latency is 10-50ms depending on OS/browser/hardware.

**Mitigation strategies:**
1. **AudioWorklet for custom processing** — move DSP off main thread
2. **Shared ArrayBuffer** for zero-copy audio data sharing between threads
3. **Double-buffering waveform renders** — Canvas/WebGL for waveform display, separate from audio thread
4. **Lookahead scheduling** — schedule Tone.js events 100ms ahead; visual playhead compensates
5. **Latency compensation display** — show user their detected latency; auto-calibrate on first use
6. **Web Audio output latency API** — `audioContext.outputLatency` + `audioContext.baseLatency` for accurate compensation

**Tone.js-specific patterns:**
```typescript
// Use Tone.js Transport for all scheduling
Tone.Transport.scheduleRepeat((time) => {
  // Schedule slightly ahead for glitch-free playback
  synth.triggerAttackRelease("C4", "8n", time);
}, "4n");

// Use lookAhead to balance latency vs timing accuracy
Tone.context.lookAhead = 0.1; // 100ms lookahead
```

### 4.2 File Handling

**Drag from OS:**
```typescript
// Handle native file drops
element.addEventListener('drop', async (e) => {
  const files = e.dataTransfer.files;
  for (const file of files) {
    if (file.type.startsWith('audio/')) {
      const buffer = await file.arrayBuffer();
      const audioBuffer = await Tone.context.decodeAudioData(buffer);
      // Create clip at drop position
    }
  }
});
```

**Import/Export:**
- Import: WAV, MP3, OGG, MIDI, project files (JSON-based custom format)
- Export: WAV (full mix), stems (per-track), MIDI, project file
- Use `showSaveFilePicker` (File System Access API) for native save dialogs where available
- Fallback to download link for unsupported browsers
- **Project format:** JSON metadata + audio files as blobs in IndexedDB

**File System Access API progressive enhancement:**
```typescript
async function saveProject() {
  if ('showSaveFilePicker' in window) {
    const handle = await window.showSaveFilePicker({
      types: [{ description: 'ACE-Step Project', accept: { 'application/json': ['.ace'] } }]
    });
    // Native save
  } else {
    // Fallback: download blob
  }
}
```

### 4.3 Offline Support (PWA)

**Service Worker strategy:**
- Cache app shell (HTML, CSS, JS) — offline-first
- Cache audio assets on first use (loop library)
- IndexedDB for project data
- Sync queue for collaboration changes when back online
- Show clear offline indicator in UI

**Storage management:**
- Estimate storage with `navigator.storage.estimate()`
- Show user storage usage in settings
- Auto-cleanup old project caches with user consent
- Request persistent storage: `navigator.storage.persist()`

### 4.4 Touch/Tablet Support

**Touch gesture mapping:**
| Desktop | Touch | Context |
|---------|-------|---------|
| Click | Tap | Select, toggle |
| Double-click | Double-tap | Open detail editor |
| Right-click | Long-press | Context menu |
| Drag | Touch-drag | Move clips, draw notes |
| Scroll | Two-finger pan | Navigate timeline |
| Cmd+Scroll | Pinch | Zoom |
| Hover | N/A (no hover on touch) | Use tap-and-hold for tooltips |

**Touch-specific UI:**
- Minimum touch target: **44x44px** (Apple HIG)
- Fader/knob handles enlarged on touch devices
- Dedicated touch mode toggle in settings
- Floating toolbar that follows selection
- Gesture hints for new users (animated overlay)

### 4.5 Performance at Scale

**For 100+ tracks / long sessions:**
- **Virtualized track rendering** — only render visible tracks in DOM (react-window/react-virtuoso)
- **Canvas/WebGL for waveforms** — don't use DOM elements for waveform rendering
- **Audio streaming** — don't load entire project audio into memory; stream from IndexedDB
- **Web Workers** — offload audio analysis, waveform computation to workers
- **Lazy effect instantiation** — only instantiate effects when track is playing/soloed
- **Zustand store slicing** — subscribe to specific track slices, not entire state

**Performance budgets:**
| Metric | Target |
|--------|--------|
| Initial load | < 3s (app shell) |
| Project open (20 tracks) | < 2s |
| Project open (100 tracks) | < 8s |
| Playback start latency | < 100ms |
| UI interaction response | < 16ms |
| Waveform render (per track) | < 5ms |

---

## 5. AI-Agent Interaction Design

### 5.1 Dual-Surface Architecture

**Principle: Every mouse click has an API call.**

The Zustand store IS the API. Agent actions dispatch the same actions that UI components dispatch.

```typescript
// This is the SINGLE interface for both UI and Agent
interface DAWActions {
  // Transport
  play(): void;
  pause(): void;
  stop(): void;
  seek(time: number): void;
  setTempo(bpm: number): void;
  setLoop(start: number, end: number): void;

  // Tracks
  createTrack(type: 'audio' | 'midi' | 'bus', options?: TrackOptions): TrackId;
  deleteTrack(id: TrackId): void;
  setTrackVolume(id: TrackId, db: number): void;
  setTrackPan(id: TrackId, value: number): void; // -1 to 1
  soloTrack(id: TrackId, solo: boolean): void;
  muteTrack(id: TrackId, mute: boolean): void;

  // Clips
  createClip(trackId: TrackId, startBeat: number, lengthBeats: number): ClipId;
  moveClip(id: ClipId, toTrack: TrackId, toBeat: number): void;
  trimClip(id: ClipId, startOffset: number, endOffset: number): void;
  splitClip(id: ClipId, atBeat: number): [ClipId, ClipId];
  duplicateClip(id: ClipId, toBeat?: number): ClipId;

  // MIDI
  addNote(clipId: ClipId, note: MIDINote): NoteId;
  removeNote(clipId: ClipId, noteId: NoteId): void;
  quantizeNotes(clipId: ClipId, grid: GridResolution, strength: number): void;

  // Effects
  addEffect(trackId: TrackId, type: EffectType, position?: number): EffectId;
  removeEffect(trackId: TrackId, effectId: EffectId): void;
  setEffectParam(effectId: EffectId, param: string, value: number): void;

  // AI
  generateClip(prompt: AIPrompt): Promise<ClipId[]>; // Returns multiple variations
  extendClip(clipId: ClipId, beats: number): Promise<ClipId>;
  regenerateRegion(start: number, end: number, prompt: AIPrompt): Promise<ClipId[]>;
  suggestNext(context: 'chord' | 'melody' | 'rhythm' | 'arrangement'): Promise<Suggestion[]>;

  // Selection
  select(ids: (TrackId | ClipId | NoteId)[]): void;
  selectAll(): void;
  selectNone(): void;

  // View
  setZoom(horizontal: number, vertical: number): void;
  scrollTo(beat: number): void;
  focusTrack(trackId: TrackId): void;

  // History
  undo(scope?: UndoScope): void;
  redo(scope?: UndoScope): void;
  getUndoStack(scope?: UndoScope): EditAction[];
}
```

### 5.2 Agent State Observation

**How an AI agent "sees" the DAW:**

```typescript
interface DAWState {
  // Readable by agent at any time
  project: {
    name: string;
    bpm: number;
    timeSignature: [number, number];
    key: MusicalKey;
    duration: number; // beats
  };

  transport: {
    playing: boolean;
    position: number; // current beat
    loop: { start: number; end: number; enabled: boolean };
  };

  tracks: Track[]; // All track data with clips, effects, routing

  selection: {
    tracks: TrackId[];
    clips: ClipId[];
    notes: NoteId[];
    timeRange: [number, number] | null;
  };

  // Semantic summary for LLM agents
  summary: string; // e.g., "8 tracks, 120 BPM, key of C minor. Drums on track 1 (4 clips), bass on track 2..."

  // Analysis data agents can query
  analysis: {
    chordProgression: ChordEvent[];
    energyCurve: number[]; // energy per beat
    sections: Section[]; // verse, chorus, etc.
  };
}
```

**Key design decision: Include a natural-language `summary` field.**
LLM agents don't need raw MIDI data to understand context. The `summary` gives them semantic understanding: "This is a chill lo-fi beat with drums, bass, piano, and a vocal sample. The chorus starts at bar 9."

### 5.3 Agent Error Handling

**Errors must be self-correcting for agents:**

```typescript
// BAD: Generic error
throw new Error("Invalid operation");

// GOOD: Error with context, suggestion, and valid alternatives
throw new DAWError({
  code: "CLIP_OVERLAP",
  message: "Cannot place clip at beat 16 — overlaps with existing clip (beats 14-18)",
  context: {
    attemptedPosition: 16,
    conflictingClip: "clip_abc123",
    conflictingRange: [14, 18],
  },
  suggestions: [
    { action: "moveClip", params: { toBeat: 18 }, description: "Place after conflicting clip" },
    { action: "moveClip", params: { toBeat: 10 }, description: "Place before conflicting clip" },
    { action: "splitClip", params: { clipId: "clip_abc123", atBeat: 16 }, description: "Split conflicting clip and insert" },
  ],
});
```

**Agent error response format:**
```json
{
  "success": false,
  "error": {
    "code": "CLIP_OVERLAP",
    "message": "Human-readable description",
    "context": { "...relevant state..." },
    "suggestions": [
      { "action": "...", "params": {}, "confidence": 0.9 }
    ]
  }
}
```

### 5.4 State Machine for Complex Operations

**Multi-step operations need explicit state machines:**

Example: AI-assisted arrangement generation

```
┌─────────────┐
│  IDLE        │ ← User/agent triggers "Generate arrangement"
└──────┬──────┘
       │ generateArrangement(prompt)
       ▼
┌─────────────┐
│  ANALYZING   │ ← Analyzing existing clips, key, BPM
└──────┬──────┘
       │ analysis complete
       ▼
┌─────────────┐
│  GENERATING  │ ← AI model generating new content
└──────┬──────┘
       │ generation complete
       ▼
┌─────────────┐
│  PREVIEWING  │ ← User/agent can listen, compare variations
└──────┬──────┘
       │ accept / reject / modify
       ▼ accept              ▼ reject         ▼ modify
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│  APPLYING    │  │  IDLE        │  │  GENERATING  │ (re-enter with modified prompt)
└──────┬──────┘  └─────────────┘  └─────────────┘
       │ applied
       ▼
┌─────────────┐
│  IDLE        │ ← Clips added to timeline, undo point created
└─────────────┘
```

**Agent can query state machine at any point:**
```typescript
const status = await daw.getOperationStatus(operationId);
// { state: "GENERATING", progress: 0.65, estimatedTimeRemaining: 12000 }
```

### 5.5 Command Palette (Cmd+K)

**Critical for both humans and agents.** Every action in the DAW should be discoverable and executable via a command palette.

```
Cmd+K → "add reverb to vocals"
  → Matched actions:
    1. Add Reverb effect to Track "Vocals" (position: end of chain)
    2. Add Convolution Reverb to Track "Vocals"
    3. Search presets for "reverb"
```

**This serves dual purpose:**
- **Humans:** discover features, execute without mouse
- **Agents:** can use same fuzzy-match command interface
- Index every action, parameter, and preset

---

## 6. AI Generation UX

### 6.1 Generation Flow

**The Generation Panel (sidebar or modal):**

```
┌──────────────────────────────────────┐
│ 🤖 AI Generate                       │
├──────────────────────────────────────┤
│ What do you want?                     │
│ ┌──────────────────────────────────┐ │
│ │ "Chill lofi piano melody in      │ │
│ │  C minor, 8 bars, jazzy chords"  │ │
│ └──────────────────────────────────┘ │
│                                      │
│ Generate for:                        │
│ ○ New track  ● Selected region       │
│ ○ Continue from playhead             │
│                                      │
│ Style:  [Lo-fi ▼]  Key: [Cm ▼]      │
│ Length: [8 bars ▼]  Energy: [Low ▼]  │
│                                      │
│ [Advanced ▾]                         │
│   Temperature: ────●──── 0.7         │
│   Variations:  [4 ▼]                 │
│   Reference:  [Drop audio here]      │
│                                      │
│ [ ✨ Generate ]                      │
│                                      │
│ History ▾                            │
│  • "Funky bass line" — 2 min ago     │
│  • "Drum pattern, trap" — 15 min ago │
└──────────────────────────────────────┘
```

### 6.2 Progress & Comparison

**During generation:**
```
┌──────────────────────────────────────┐
│ Generating 4 variations...           │
│ ████████████░░░░░░░░ 60% (~15s)     │
│                                      │
│ ✅ Variation 1 ready  [▶ Play]      │
│ ✅ Variation 2 ready  [▶ Play]      │
│ ⏳ Variation 3...                    │
│ ⏳ Variation 4...                    │
│                                      │
│ [Cancel]                             │
└──────────────────────────────────────┘
```

**Key UX decisions:**
- Show variations as they complete (don't wait for all)
- Each variation plays in context (over the existing mix, not isolated)
- A/B switcher: keyboard shortcuts `1`, `2`, `3`, `4` to switch between variations during playback
- "Like" (👍) variations to train future generations
- After selection, unselected variations go to "Discarded" (recoverable for 24h)

### 6.3 Inline Regeneration

**Select a region on the timeline → right-click → "Regenerate with AI"**

This is ACE-Step's killer feature: surgical AI editing within a traditional DAW workflow.

```
Timeline:
[====Drums====][====Drums====][====Drums====][====Drums====]
[====Bass=====][====Bass=====][====Bass=====][====Bass=====]
[===Piano=====][===Piano=====][  🔄 REGEN   ][===Piano=====]
                               ↑ Selected region
                               "Make this more energetic"
```

The regenerated region:
- Maintains tempo/key/time signature
- Crossfades at boundaries (auto 50ms crossfade)
- Created as a new clip (original preserved underneath)
- Toggle between original/regenerated with eye icon

### 6.4 AI Suggestions

**Passive suggestions (non-intrusive):**
- Small sparkle icon (✨) appears near the playhead when AI has a suggestion
- Click to see: "Try adding a hi-hat pattern here" or "This section could use a key change"
- Suggestions based on arrangement analysis (energy curve, repetition, genre conventions)
- **Never auto-apply** — always require user confirmation
- Dismissable with `Esc` or click-away
- Settings to adjust suggestion frequency (Off / Subtle / Active)

**Active suggestions (on request):**
- `Tab` in an empty region → AI suggests fill
- Right-click clip → "Suggest variations"
- "What should come next?" button at end of arrangement

### 6.5 Prompt Engineering UX for Music

**Help users write better prompts:**
- Autocomplete for musical terms (genres, instruments, moods, techniques)
- Tag-based input: click tags instead of typing `[Lofi] [Piano] [Chill] [C minor]`
- Reference track: drag an audio file as style reference
- "Describe this clip" button: AI describes what's already there, user modifies description
- Prompt templates: "Make a ___ that sounds like ___ but more ___"

---

## 7. Accessibility & Inclusive Design

### 7.1 Screen Reader Support

**ARIA landmarks for DAW layout:**
```html
<main role="application" aria-label="ACE-Step DAW">
  <nav role="toolbar" aria-label="Transport controls">
    <button aria-label="Play" aria-pressed="false">▶</button>
    <button aria-label="Stop">⏹</button>
    <button aria-label="Record" aria-pressed="false">⏺</button>
    <output aria-live="polite" aria-label="Current position">Bar 4, Beat 1</output>
    <output aria-live="polite" aria-label="Tempo">120 BPM</output>
  </nav>

  <section role="grid" aria-label="Timeline">
    <div role="row" aria-label="Track 1: Drums, 4 clips">
      <div role="gridcell" aria-label="Clip: Drums intro, bars 1 to 4, audio">
      </div>
    </div>
  </section>

  <section aria-label="Mixer">
    <div role="slider" aria-label="Track 1 volume"
         aria-valuemin="-60" aria-valuemax="6" aria-valuenow="-3"
         aria-valuetext="minus 3 decibels">
    </div>
  </section>
</main>
```

**Key accessibility patterns:**
- All clips announced with: track name, clip type, position, length
- Parameter changes announced via `aria-live="polite"`
- Spatial audio description: "Panned 30% left"
- Keyboard navigation: `Tab` between panels, `Arrow` keys within panels
- Audio cues: play a tone when navigating to clips (optional, toggleable)

### 7.2 Color-Blind Safe Palette

**Track color palette (16 colors) optimized for deuteranopia, protanopia, tritanopia:**

| Slot | Color | Hex | Use |
|------|-------|-----|-----|
| 1 | Blue | `#4A90D9` | Default track 1 |
| 2 | Orange | `#E8913A` | Drums |
| 3 | Teal | `#3DBFA5` | Bass |
| 4 | Coral | `#E8636E` | Vocals |
| 5 | Purple | `#9B6EC6` | Synths |
| 6 | Gold | `#D4A843` | Keys |
| 7 | Cyan | `#45B8D4` | Pads |
| 8 | Rose | `#D46B8A` | Strings |
| 9 | Lime | `#7EC845` | Guitar |
| 10 | Slate | `#7B8FA1` | FX/Aux |
| 11 | Amber | `#C9873A` | Perc |
| 12 | Indigo | `#5C6BC0` | Lead |
| 13 | Sage | `#6DAF7C` | Choir |
| 14 | Brick | `#C0635A` | Brass |
| 15 | Lavender | `#A084C9` | Woodwinds |
| 16 | Steel | `#8B9DAF` | Bus/Master |

**Additional measures:**
- Shape coding alongside color: drum tracks get a hexagon icon, melodic get a wave, etc.
- Pattern fills (hatching/dots) as optional setting for clips
- High-contrast mode toggle
- Color-blind simulation in settings to preview

### 7.3 Keyboard-Only Operation

**Full keyboard workflow:**

| Action | Keys |
|--------|------|
| Play/Pause | `Space` |
| Stop (go to start) | `Space` twice / `Home` |
| Record | `R` |
| Undo | `Cmd+Z` |
| Redo | `Cmd+Shift+Z` |
| Navigate tracks | `↑` / `↓` |
| Navigate clips | `←` / `→` |
| Select clip | `Enter` |
| Multi-select | `Shift+Arrow` |
| Open piano roll | `Enter` on MIDI clip |
| Toggle solo | `S` |
| Toggle mute | `M` |
| Delete selected | `Backspace` / `Delete` |
| Duplicate | `Cmd+D` |
| Split at playhead | `Cmd+E` |
| Command palette | `Cmd+K` |
| Zoom in/out | `Cmd+=` / `Cmd+-` |
| Zoom to fit | `Shift+Z` |
| Loop toggle | `L` |
| Toggle panels | `Cmd+1` through `Cmd+5` |

### 7.4 Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  /* Disable all decorative animations */
  .playhead-glow,
  .clip-shimmer,
  .ai-sparkle,
  .meter-animation {
    animation: none;
    transition: none;
  }

  /* Keep functional animations but simplify */
  .clip-drag {
    transition: transform 0.1s linear; /* Minimal, functional */
  }

  /* Replace animated progress with static */
  .ai-progress {
    animation: none;
    /* Show percentage text instead of animated bar */
  }
}
```

---

## 8. Design System

### 8.1 Design Tokens

```css
:root {
  /* === Spacing === */
  --space-1: 2px;    /* Tight */
  --space-2: 4px;    /* Element padding */
  --space-3: 8px;    /* Component padding */
  --space-4: 12px;   /* Panel padding */
  --space-5: 16px;   /* Section gap */
  --space-6: 24px;   /* Panel gap */
  --space-7: 32px;   /* Major section gap */
  --space-8: 48px;   /* Page-level gap */

  /* === Typography === */
  --font-mono: 'JetBrains Mono', 'SF Mono', monospace;
  --font-sans: 'Inter', -apple-system, sans-serif;
  --font-size-xs: 10px;   /* Meter labels, tiny annotations */
  --font-size-sm: 11px;   /* Track names, clip labels */
  --font-size-md: 13px;   /* Default UI text */
  --font-size-lg: 15px;   /* Panel headers */
  --font-size-xl: 18px;   /* Section titles */

  /* === Dark Theme Colors === */
  --bg-app: #1a1a2e;          /* App background */
  --bg-panel: #222240;         /* Panel background */
  --bg-surface: #2a2a4a;       /* Cards, dialogs */
  --bg-elevated: #333360;      /* Elevated surfaces */
  --bg-track-odd: #252545;     /* Alternating track bg */
  --bg-track-even: #222240;    /* Alternating track bg */
  --bg-timeline: #1e1e38;      /* Timeline background */

  --text-primary: #e8e8f0;     /* Primary text */
  --text-secondary: #a0a0b8;   /* Secondary text */
  --text-tertiary: #707088;    /* Disabled/hint text */

  --border-subtle: #3a3a5a;    /* Subtle borders */
  --border-focus: #6C63FF;     /* Focus ring */
  --border-divider: #2e2e4e;   /* Panel dividers */

  --accent-primary: #6C63FF;   /* Primary brand (purple) */
  --accent-ai: #8B5CF6;        /* AI features (lighter purple) */
  --accent-success: #4ADE80;   /* Success green */
  --accent-warning: #FBBF24;   /* Warning amber */
  --accent-danger: #F87171;    /* Danger red */
  --accent-record: #EF4444;    /* Recording red */

  /* === DAW-Specific === */
  --playhead-color: #FFFFFF;
  --playhead-width: 2px;
  --grid-line-major: rgba(255,255,255,0.08);
  --grid-line-minor: rgba(255,255,255,0.03);
  --loop-region-color: rgba(108,99,255,0.15);
  --selection-color: rgba(108,99,255,0.25);

  --meter-green: #4ADE80;
  --meter-yellow: #FBBF24;
  --meter-red: #EF4444;
  --meter-bg: #1a1a2e;

  --waveform-color: currentColor;
  --waveform-opacity: 0.7;
  --waveform-selected-opacity: 1.0;

  /* === Transitions === */
  --transition-fast: 100ms ease-out;
  --transition-normal: 200ms ease-out;
  --transition-slow: 400ms ease-out;

  /* === Z-Index Scale === */
  --z-track: 1;
  --z-clip: 10;
  --z-playhead: 100;
  --z-toolbar: 200;
  --z-panel: 300;
  --z-modal: 400;
  --z-tooltip: 500;
  --z-toast: 600;
  --z-command-palette: 700;
}
```

### 8.2 Component Patterns

**Knob:**
- Radial control (270° sweep, from 7 o'clock to 5 o'clock)
- Drag interaction: vertical drag to change value (not rotational — more precise)
- Double-click to reset to default
- Right-click for exact value input
- Display value below/inside knob
- Arc indicator showing current position
- Touch: enlarge on press (1.5x), use vertical drag
- Size variants: S (24px), M (32px), L (48px)

**Fader:**
- Vertical slide (for volume) or horizontal (for pan)
- Track/groove line with tickmarks at 0dB, -6, -12, -24, -∞
- Thumb/cap grabbable, highlighted on hover
- Double-click to reset to 0dB (volume) or center (pan)
- Touch: 44px minimum thumb target

**Level Meter:**
- Vertical bar with green → yellow → red gradient
- Peak hold indicator (line that falls slowly)
- RMS + Peak display
- -60dB to +6dB range
- Clip indicator (red dot) at top, click to reset
- 60fps animation target, fall off with `requestAnimationFrame`

**Waveform Display:**
- Rendered on Canvas or WebGL (never SVG for performance)
- Two rendering modes:
  - Overview: peaks only (fast, for zoomed-out view)
  - Detailed: full waveform (for zoomed-in editing)
- Color matches track color at 70% opacity
- Selection highlight: brighter version of track color
- Muted: 30% opacity

**Piano Roll Notes:**
- Rectangles with rounded corners (2px radius)
- Color = velocity (lighter = softer, more saturated = harder)
- Resize handles on left/right edges (horizontal = length, vertical = not used)
- Ghost notes from other tracks at 15% opacity
- Pitch bend/expression shown as curves below notes

### 8.3 Responsive Breakpoints

```css
/* DAW-specific breakpoints */
@media (max-width: 768px) {
  /* Mobile: single panel view, tab switching */
  /* Hide mixer detail, show simplified track list */
  /* Timeline takes full width, compact track headers */
}

@media (min-width: 769px) and (max-width: 1200px) {
  /* Tablet: two-panel layout */
  /* Timeline + one side panel (browser or mixer or piano roll) */
}

@media (min-width: 1201px) and (max-width: 1600px) {
  /* Desktop: standard layout */
  /* Timeline + bottom panel (piano roll/mixer) + side panel (browser) */
}

@media (min-width: 1601px) {
  /* Large desktop / dual monitor: expanded layout */
  /* All panels can be visible simultaneously */
  /* Wider track headers with more inline controls */
}
```

**Layout architecture:**
- Panels are dockable and resizable (like VS Code panels)
- Panels can be popped out to separate windows (Window.open for multi-monitor)
- Layout state persisted in Zustand → localStorage
- Preset layouts: "Arrangement", "Mixing", "Editing", "AI Studio"

### 8.4 Dark Theme Best Practices

**Why DAWs are dark:**
- Reduced eye strain in long sessions (studios are dark rooms)
- Better contrast for waveforms and meters
- Colored elements (clips, notes) pop more against dark backgrounds
- Professional aesthetic expectation

**Dark theme rules:**
1. **Never use pure black (#000)** — use dark blues/purples (#1a1a2e) for depth
2. **Never use pure white (#fff) for text** — use off-white (#e8e8f0) to reduce harshness
3. **Elevation = lighter** — higher surfaces are slightly lighter (opposite of light theme)
4. **Borders are subtle** — 1px borders with low-opacity whites, not stark lines
5. **Accent colors should be medium-high saturation** — too bright hurts in dark UI
6. **Shadows still work** — use very dark, large shadows for elevation
7. **Ensure 4.5:1 contrast ratio minimum** for text readability (WCAG AA)
8. **Test in actual dark rooms** — laptop screen brightness varies dramatically

---

## 9. Onboarding & Progressive Disclosure

### 9.1 First-Run Experience

**Step 1: Genre Selection (sets defaults)**
```
┌──────────────────────────────────────┐
│ What are you making today?           │
│                                      │
│  🎵 Hip Hop    🎸 Rock              │
│  🎹 Lo-Fi     🎧 Electronic         │
│  🎤 Pop       🎻 Cinematic          │
│  🤖 Let AI decide  📦 Blank project │
│                                      │
└──────────────────────────────────────┘
```
Selection sets: BPM, key, pre-loaded instruments, template tracks

**Step 2: Complexity Selection**
```
┌──────────────────────────────────────┐
│ How experienced are you?             │
│                                      │
│  🌱 New to music production          │
│     → Simple mode, AI-forward       │
│                                      │
│  🎵 I know my way around             │
│     → Standard mode, all tools       │
│                                      │
│  ⚡ Give me everything                │
│     → Advanced mode, full control    │
│                                      │
└──────────────────────────────────────┘
```

**Step 3: Interactive Tutorial (optional, skippable)**
- 5-step overlay tutorial:
  1. "This is the timeline — drag loops here" (highlight timeline)
  2. "Press Space to play/stop" (highlight transport)
  3. "Click here to generate AI music" (highlight AI panel)
  4. "These are your tracks — each has volume and effects" (highlight mixer)
  5. "Ready! Press Cmd+K anytime for help" (highlight command palette)

### 9.2 Contextual Tips

- Show tips when user first encounters a feature (stored in localStorage)
- Tips are dismissible and don't return
- Tips appear as small, non-modal tooltips attached to the relevant UI element
- Examples:
  - First time opening piano roll: "Tip: Right-click to draw notes. Use ghost notes (👻 icon) to see other tracks."
  - First time using AI generate: "Tip: Be specific! 'funky bass line, 120 BPM, slap technique' works better than 'bass'."
  - First time dragging a clip: "Tip: Hold Cmd to disable snap for fine positioning."

---

## 10. Keyboard & Shortcut Design

### 10.1 Philosophy

**Three tiers of shortcuts:**

1. **Universal (always active):**
   - `Space` — Play/Pause
   - `Cmd+Z` / `Cmd+Shift+Z` — Undo/Redo
   - `Cmd+S` — Save
   - `Cmd+K` — Command palette
   - `Cmd+C/V/X` — Copy/Paste/Cut
   - `Delete/Backspace` — Delete selection

2. **Context-sensitive (depend on focus):**
   - `←/→` — In timeline: navigate clips. In piano roll: nudge notes.
   - `Enter` — In timeline: open clip detail. In piano roll: confirm edit.
   - `B` — In timeline: split clip. In piano roll: draw tool.

3. **Power user (discoverable via Cmd+K):**
   - `Cmd+Shift+D` — Duplicate to next bar
   - `Cmd+Alt+M` — Bounce in place
   - `Q` — Quick quantize (in piano roll)

### 10.2 Customization

- Full keyboard shortcut editor in settings
- Import/export shortcut presets
- Presets for users coming from: Ableton, Logic, FL Studio, Pro Tools
- Search shortcuts by action name
- Conflict detection when assigning

### 10.3 Preventing Browser Conflicts

**Problem:** Browser has its own shortcuts (Cmd+W closes tab, Cmd+T opens tab, etc.)

**Solutions:**
- PWA mode eliminates most conflicts
- In browser mode, remap conflicting actions:
  - Don't use `Cmd+W` (close tab) — use `Cmd+Shift+W` for close track
  - Don't use `Cmd+T` (new tab) — use `T` (solo?) or `Cmd+Shift+T`
  - Don't use `Cmd+L` (address bar) — use `L` for loop
- Use `e.preventDefault()` on known DAW shortcuts
- Show warning if user has unsaved work and tries to leave (`beforeunload`)

---

## Appendix A: Glossary

| Term | Definition |
|------|-----------|
| Clip | A segment of audio or MIDI on the timeline |
| Region | A selected time range on the timeline |
| Track | A horizontal lane holding clips and routing to mixer channel |
| Bus | A track that receives audio from other tracks for group processing |
| Send | Routing a copy of a track's audio to a bus |
| Sidechain | Using one audio signal to control an effect on another |
| Quantize | Snap note timing to a grid |
| Bounce | Render audio in place (destructive commit) |
| Stem | An exported audio file for one track/group |
| Ghost notes | Notes from other tracks shown as transparent overlay |

## Appendix B: Agent API Quick Reference

```
# Transport
daw.play()
daw.pause()
daw.stop()
daw.seek(beat)
daw.setTempo(bpm)
daw.setLoop(start, end)

# Tracks
daw.createTrack(type, options?)
daw.deleteTrack(id)
daw.setTrackVolume(id, db)
daw.setTrackPan(id, value)
daw.soloTrack(id, bool)
daw.muteTrack(id, bool)

# Clips
daw.createClip(trackId, start, length)
daw.moveClip(id, toTrack, toBeat)
daw.splitClip(id, atBeat)
daw.duplicateClip(id, toBeat?)

# AI
daw.generateClip(prompt) → Promise<ClipId[]>
daw.extendClip(id, beats) → Promise<ClipId>
daw.regenerateRegion(start, end, prompt) → Promise<ClipId[]>
daw.suggestNext(context) → Promise<Suggestion[]>

# State
daw.getState() → DAWState
daw.getState().summary → string
daw.history.undo(scope?)
daw.history.redo(scope?)
```

---

*This is a living document. Update as features are implemented and user feedback is gathered.*
