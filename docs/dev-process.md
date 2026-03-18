# ACE-Step DAW — Development Process

> Repository: ace-step/ACE-Step-DAW
> This document supplements AGENTS.md with detailed operational procedures.

---

## Competitive Research Index

### Ableton Live 12 (Primary Reference)
- Mixing: https://www.ableton.com/en/live-manual/12/mixing/
- Arrangement View: https://www.ableton.com/en/live-manual/12/arrangement-view/
- Session View: https://www.ableton.com/en/live-manual/12/session-view/
- MIDI Editing: https://www.ableton.com/en/live-manual/12/editing-midi/
- Audio Clips & Warping: https://www.ableton.com/en/live-manual/12/audio-clips-tempo-and-warping/
- Instruments & Effects: https://www.ableton.com/en/live-manual/12/working-with-instruments-and-effects/
- Audio Effect Reference: https://www.ableton.com/en/live-manual/12/live-audio-effect-reference/
- MIDI Effect Reference: https://www.ableton.com/en/live-manual/12/live-midi-effect-reference/
- Instrument Reference: https://www.ableton.com/en/live-manual/12/live-instrument-reference/
- Routing & I/O: https://www.ableton.com/en/live-manual/12/routing-and-i-o/
- Automation: https://www.ableton.com/en/live-manual/12/automation-and-editing-envelopes/
- Recording: https://www.ableton.com/en/live-manual/12/recording-new-clips/
- Browser: https://www.ableton.com/en/live-manual/12/working-with-the-browser/

### FL Studio
- Features: https://www.image-line.com/fl-studio/features/

### GarageBand
- User Guide: https://support.apple.com/guide/garageband/welcome/mac

### REAPER
- User Guide: https://www.reaper.fm/userguide.php

### ACE-Step
- DAW (upstream): https://github.com/ace-step/ACE-Step-DAW
- ACE-Step 1.5 API: https://github.com/ace-step/ACE-Step-1.5
- Local API docs: docs/research-notes/ace-step-api-details.md

---

## Research Depth Standard

Every feature must be researched at interaction-detail level before coding.

### Bad (too shallow)
> "Ableton has Group Tracks"

### Good (deep enough)
> "Ableton Group Track: nestable, folded view shows sub-clip overview, Session View group slots have independent launch/stop, Cmd+Click for multi-select grouping, group color can be applied to all sub-tracks, output defaults to Group Track but can be rerouted, can serve as pure folder, deleting Group deletes all contents, Ungroup reverts to individual tracks"

### Research output
- Save to `docs/research-notes/<feature>-details.md`
- Include: interaction details, parameter ranges, edge cases, shortcuts, visual feedback, error handling

---

## System Test Checklist (Every 5 Versions)

### Cold Start
- [ ] Clear browser cache / IndexedDB
- [ ] Open app from scratch
- [ ] Verify all components render correctly

### Full User Journey
- [ ] Create new project (name, BPM, key, time signature)
- [ ] Add Stems track → generate with AI → verify playback
- [ ] Add Piano Roll track → draw MIDI notes → verify synth playback
- [ ] Add Sequencer track → program drum pattern → verify playback
- [ ] Add Sample track → import audio file → verify playback
- [ ] Open Mixer → adjust volume/pan/mute/solo per track
- [ ] Add effects to a track → verify effect chain UI
- [ ] Multi-track playback → verify all tracks play in sync
- [ ] Export project to WAV → verify output file
- [ ] Save project → close → reopen → verify all data persists

### AI Features
- [ ] Generate track via LEGO pipeline (context-aware)
- [ ] Create Cover from existing clip
- [ ] Repaint selection on a clip
- [ ] Vocal2BGM generation
- [ ] Audio Analysis (BPM/key detection)
- [ ] Model selector in Settings

### Edge Cases
- [ ] Rapid button clicking (transport, add track, etc.)
- [ ] Extreme zoom (min/max)
- [ ] Empty project with all operations
- [ ] 10+ tracks performance
- [ ] Browser resize / responsive behavior
- [ ] Network offline behavior (generation should show clear error)

### Visual Audit
- [ ] Dark theme consistency across all panels
- [ ] Button states (hover, active, disabled) all correct
- [ ] Text readability (no truncated labels)
- [ ] Alignment and spacing consistency
- [ ] No overlapping elements

### Code Quality
- [ ] `npx tsc --noEmit` — 0 errors
- [ ] `npm run build` — passes
- [ ] Zero unused imports
- [ ] Zero console.log (except error handlers)
- [ ] Zero untyped `any`
- [ ] Components under 600 lines (split if larger)
- [ ] All useEffect have cleanup returns where needed
- [ ] All event listeners properly removed

---

_Refer to AGENTS.md for the complete development workflow and rules._
