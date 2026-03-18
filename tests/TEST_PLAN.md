# ACE-Step DAW — Test Plan

> Test-driven development. No release without passing tests.
> Run this plan before every PR merge and fully every 5 versions.

---

## Test Categories

### 1. Build Verification (every PR)
- [ ] `npx tsc --noEmit` — 0 type errors
- [ ] `npm run build` — passes with 0 errors
- [ ] No new warnings introduced

### 2. Code Quality (every PR)
- [ ] Zero unused imports across all changed files
- [ ] Zero `console.log` (except in error catch blocks)
- [ ] Zero untyped `any` (except with explicit eslint-disable comment)
- [ ] Zero TODO/FIXME without linked issue number
- [ ] All new functions have JSDoc comments
- [ ] Components under 600 lines (split if larger)

### 3. Existing Feature Regression Tests (every PR)

#### 3.1 Project Management
- [ ] Create new project with name, BPM, key, time signature
- [ ] Open existing project from project list
- [ ] Project settings persist after reload
- [ ] Delete project works

#### 3.2 Track Operations
- [ ] Add Stems track
- [ ] Add Sample track
- [ ] Add Sequencer track
- [ ] Add Piano Roll track
- [ ] Delete track (verify audio engine cleanup)
- [ ] Rename track
- [ ] Reorder tracks (drag)
- [ ] Mute/Solo per track
- [ ] Volume/Pan per track

#### 3.3 Timeline
- [ ] Zoom in/out (Ctrl+Scroll)
- [ ] Scroll horizontally and vertically
- [ ] Playhead moves during playback
- [ ] Click timeline ruler to seek
- [ ] Clip blocks render correctly
- [ ] Clip drag to move
- [ ] Clip resize (trim)

#### 3.4 Transport
- [ ] Play/Pause (Space)
- [ ] Stop
- [ ] Record
- [ ] Loop toggle
- [ ] Metronome toggle
- [ ] BPM change updates playback speed
- [ ] Position display updates in real-time

#### 3.5 AI Generation
- [ ] Generate clip on Stems track (requires API)
- [ ] Batch generate all tracks
- [ ] Add Layer to existing track
- [ ] Generation status shows on clip (spinner + progress)
- [ ] Cancel generation (if supported)
- [ ] Error state displays correctly when API unreachable

#### 3.6 Piano Roll
- [ ] Opens when double-clicking MIDI clip
- [ ] Draw notes (double-click or draw mode)
- [ ] Select notes (click, box select, Shift+click)
- [ ] Move notes (drag horizontally/vertically)
- [ ] Resize notes (drag right edge)
- [ ] Delete notes (Delete key)
- [ ] Velocity editor (drag bars)
- [ ] Grid snap works
- [ ] Grid size selector works
- [ ] Synth preview on note add/move
- [ ] Close piano roll

#### 3.7 Step Sequencer
- [ ] Opens for Sequencer track
- [ ] Toggle steps on/off
- [ ] Velocity per step
- [ ] Add/remove rows
- [ ] Swing control
- [ ] Steps per bar selector
- [ ] Beat pad triggers sounds
- [ ] Beat pad keyboard mapping

#### 3.8 Effect Chain
- [ ] Add effect to track
- [ ] Each effect type renders correct UI (EQ curve, compressor meter, etc.)
- [ ] Adjust parameters (knobs, sliders)
- [ ] Bypass toggle per effect
- [ ] Remove effect
- [ ] Reorder effects (drag)
- [ ] Preset selector per effect

#### 3.9 Mixer
- [ ] All tracks show in mixer
- [ ] Volume faders work
- [ ] Pan knobs work
- [ ] Mute/Solo from mixer
- [ ] Mixer panel resize

#### 3.10 Cover / Repaint / Vocal2BGM
- [ ] Right-click clip → "Create Cover" opens modal
- [ ] Cover modal fields work (caption, lyrics, strength slider)
- [ ] Right-click clip → "Repaint Selection" opens modal
- [ ] Repaint range selector works
- [ ] Right-click vocal clip → "Generate Accompaniment" opens modal
- [ ] Vocal2BGM style presets load

#### 3.11 Audio Analysis
- [ ] Right-click clip → "Analyze Audio" opens panel
- [ ] Shows detected BPM, key, time signature
- [ ] "Apply to Project" button works

#### 3.12 Loop Browser
- [ ] Toggle loop browser panel
- [ ] Search filters loops
- [ ] Category filter works
- [ ] Preview plays loop
- [ ] Drag loop to timeline creates region

#### 3.13 Settings
- [ ] Open settings dialog
- [ ] Model selector shows available models
- [ ] Backend URL configurable
- [ ] Settings persist

### 4. New Feature Tests (per version)
- [ ] Test each new feature listed in the PR description
- [ ] Test edge cases specific to new features
- [ ] Test interaction with existing features

### 5. Visual Regression (every 5 versions)
- [ ] Screenshot every major panel/view
- [ ] Compare against previous version screenshots
- [ ] Check: alignment, spacing, color consistency, text readability
- [ ] Dark theme consistency across all panels
- [ ] No overlapping elements
- [ ] Button states (hover, active, disabled)

### 6. Performance (every 5 versions)
- [ ] Page load time < 3 seconds
- [ ] 10+ tracks without lag
- [ ] Timeline scroll smooth at all zoom levels
- [ ] No memory leaks (check with DevTools)
- [ ] Audio playback without glitches

### 7. Browser Compatibility (every 5 versions)
- [ ] Chrome (primary)
- [ ] Safari
- [ ] Firefox (best effort)

---

## Test Execution

### Per-PR Quick Test
Run categories 1, 2, 3 (relevant subsections), and 4.

### Every 5 Versions Full Test
Run ALL categories 1-7.

### How to Run Browser Tests
```bash
# Start dev server
npm run dev

# Open browser tool
openclaw browser open http://127.0.0.1:5174

# Take screenshots
openclaw browser screenshot --type png

# Click elements
openclaw browser snapshot  # get refs
openclaw browser click <ref>

# Record GIF
# Take sequential screenshots → ffmpeg → GIF
```

### Test Report Template
```markdown
## Test Report — v0.0.X

### Build: PASS/FAIL
### Type Check: PASS/FAIL (X errors)
### Code Quality: X issues found

### Feature Tests
| Test | Status | Notes |
|------|--------|-------|
| Create project | ✅ | |
| Add track | ✅ | |
| ... | ... | ... |

### Issues Found
1. [CRITICAL] Description — fixed in commit abc123
2. [WARNING] Description — tracked in issue #X
3. [INFO] Description

### Screenshots
- [screenshot descriptions and paths]

### Verdict: PASS / FAIL (with conditions)
```

---

_No release without a passing test report._
