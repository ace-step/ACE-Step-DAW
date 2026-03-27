# Recording & Input Monitoring UX Research

> Date: 2026-03-27 | Scope: Audio recording, comping, and input monitoring in DAWs vs ACE-Step

---

## 1. Pro Tools — Recording Gold Standard

### Punch Recording
- **Quick Punch (Cmd+Shift+P)**: Instant punch in/out while playing — no pre-roll needed
- **Pre/Post Roll**: Configurable lead-in/out time for context before punch
- **Destructive Punch**: Records directly to file (broadcast/post-production)
- **Non-Destructive Punch**: New region on top, original preserved underneath

### Loop Recording
- **Define loop region**: Set in/out markers on timeline
- **Each pass = new take**: Stacked automatically in playlist/take lanes
- **Playlist system**: Up to 999 playlists per track — each is a complete alternate take history
- **Clip ratings**: Star rating (1-5) per take for quick evaluation

### Comping (Take Management)
- **Playlist view**: Expand track to show all takes stacked vertically
- **Swipe comping**: Click-drag across best sections of each take
- **Composite playlist**: Automatically created from selected sections
- **Crossfade at boundaries**: Automatic crossfades between comped sections
- **Flatten comp**: Consolidate final comp into single audio file

### Input Monitoring
- **3 modes**: Auto (follows record state), Input Only, Playback Only
- **Low-latency monitoring**: Hardware monitoring bypass (when interface supports it)
- **Record-safe**: Prevent accidental recording on armed tracks
- **Gain staging**: Input trim per track, independent of fader

## 2. Logic Pro Recording

### Take Folders
- **Loop recording → take folder**: Multiple takes auto-stacked
- **Quick Swipe Comping**: Click-drag to select best parts visually — best comping UX in any DAW
- **Color-coded takes**: Each take has distinct color for visual clarity
- **Flatten and Merge**: Consolidate comp or keep editable
- **Move between takes**: Up/Down arrows to audition different takes

### Replace vs Merge Recording
- **Replace mode**: New recording replaces existing content
- **Merge mode**: New recording layers on top (useful for building drum patterns)
- **Cycle recording**: Each cycle creates new take in take folder

### Count-In & Metronome
- **1-bar count-in**: Configurable (1-4 bars)
- **Metronome options**: Tone, click, or external MIDI
- **Only during count-in**: Option to mute click after recording starts

## 3. Ableton Live Recording

### Session View Recording
- **Per-clip recording**: Arm slot → record into specific clip
- **Fixed-length recording**: Set clip length before recording
- **Overdub in clip**: Layer recordings in same clip slot
- **MIDI overdub**: Add notes to existing clip by playing

### Arrangement Recording
- **Punch in/out**: Set loop braces as punch region
- **Session → Arrangement**: Record session clip launches into arrangement
- **Capture MIDI**: Retroactively capture what was just played (even without arming!)
- **Latency compensation**: Automatic delay compensation across all tracks

### Capture MIDI (Unique Feature)
- **Played something great but wasn't recording?**: Press Capture button
- **Retroactively records**: Last ~30 seconds of MIDI input saved
- **Tempo detection**: Analyzes played timing to set project BPM
- **Game-changer**: Eliminates "I forgot to press record" frustration

## 4. FL Studio Recording

### Edison (Built-In Audio Editor)
- **Record directly into Edison**: Per-track audio recording
- **Non-destructive editing**: Cut, trim, normalize, pitch-shift
- **Spectral display**: View frequency content over time
- **Convolution reverb**: Record impulse → apply as reverb

### Playlist Recording
- **Audio recording tracks**: Record directly to playlist as audio clips
- **Loop recording**: Stacked takes on same track
- **Slip editing**: Adjust clip start point without cutting

## 5. Modern AI Recording Features

### Melodyne/Auto-Tune Integration
- **Real-time pitch correction**: During or after recording
- **ARA2 integration**: Direct plugin access to audio in DAW (Logic, Studio One)
- **Note-level editing**: Pitch, timing, vibrato per note

### AI Transcription
- **Audio → MIDI**: Transcribe recorded audio to MIDI notes
- **Drum separation**: Extract kick/snare/hat from mixed drum recording
- **Chord detection**: Identify chord progression from audio

## 6. ACE-Step Current State

### RecordingEngine.ts (522 lines)
- **MediaRecorder API**: Captures from getUserMedia (microphone input)
- **WebM/Opus codec**: Browser-supported format
- **Arm track → record**: Basic record/stop functionality
- **Audio stored as Blob**: Saved to project store
- **Metronome**: Exists in transport (Tone.js MetalSynth click)

### Key Gaps
| Feature | Competitors | ACE-Step |
|---|---|---|
| Punch in/out | Pro Tools, Logic, Ableton | No |
| Loop recording | All | No |
| Take lanes / comping | Pro Tools (best), Logic | No UI (data model exists) |
| Count-in (bars) | All | No configurable count-in |
| Input monitoring modes | Pro Tools (3 modes) | Basic |
| Capture MIDI (retroactive) | Ableton | No |
| Latency compensation | All | No |
| Clip ratings | Pro Tools | No |
| Non-destructive punch | Pro Tools | No |
| Audio → MIDI transcription | Logic, Ableton 12 | No |
| Overdub / merge recording | Logic, Ableton | No |

---

## 7. Recommendations for ACE-Step

### Phase 1: Core Recording
- **Count-in**: 1-4 bar count-in before recording starts
- **Punch in/out**: Set markers for record region
- **Loop recording**: Cycle over region, stack takes
- **Input level meter**: Visual input level before/during recording

### Phase 2: Take Management
- **Take lane UI**: Show stacked takes below track
- **Swipe comping**: Click-drag to select best sections (Logic-style)
- **Crossfade at comp boundaries**: Automatic 4ms crossfades
- **Clip ratings**: Star rating per take

### Phase 3: Advanced
- **MIDI capture**: Retroactive MIDI recording (Ableton-style)
- **Latency compensation**: Measure and offset recording latency
- **Overdub mode**: Layer MIDI recordings in same clip
- **Audio → MIDI**: Basic pitch detection for monophonic audio

---

## Sources

- [Pro Tools Recording Modes — Avid Knowledge Base](https://resources.avid.com/SupportFiles/PT/Pro_Tools_Reference_Guide_2024.pdf)
- [Logic Pro: Record Using Cycle Mode — Apple Support](https://support.apple.com/guide/logicpro/record-using-cycle-mode-lgcp31714849/mac)
- [Quick Swipe Comping in Logic Pro — Apple Support](https://support.apple.com/guide/logicpro/quick-swipe-comping-lgce587b14f7/mac)
- [Ableton Live: Capturing MIDI — Ableton Manual](https://www.ableton.com/en/manual/capturing-midi/)
- [Recording Audio in Ableton Live — Ableton Manual](https://www.ableton.com/en/manual/recording-new-clips/)
