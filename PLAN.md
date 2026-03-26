# Deep Research Plan: ACE-Step DAW Competitive Analysis

## Summary

ACE-Step DAW is a React 19 + Tone.js browser DAW with AI-powered stem generation. The initial synth/sampler gap analysis (issues #942-#963) covered synthesis engines but lacked depth in UI design, UX workflows, feature completeness, and interaction quality. This plan decomposes deep research into 12 independent units covering every dimension a modern DAW must excel in.

### Current State (from codebase exploration)
- **UI**: Dark-themed Tailwind CSS, ~60+ components. Mixer, timeline, piano roll, sequencer, drum machine, effects chain, Strudel editor all exist. No accessibility audit. Limited responsive design. Knob/slider controls are basic.
- **Audio**: Tone.js-based with SynthEngine (6 presets), SamplerEngine (single-sample), DrumEngine (4 kits, synthesis-only), StrudelEngine (Strudel DSL), EffectsEngine (10 effect types, UI exists but not wired to live audio). MIDI input support. WAV/MP3 export.
- **State**: Zustand stores (project, transport, generation, UI). IndexedDB for audio blobs. Undo/redo via history. Automation system with breakpoint envelopes.
- **Services**: AI generation pipeline (ACE-Step model), audio storage, generation queue management.

## Work Units (12 research tasks)

### Unit 1: Synth UI Design Research
**Files**: Write to `.llm/research/synth-ui-design.md`
**Description**: Research how Ableton Wavetable, Serum, Vital, Logic Alchemy, and Surge XT design their synth editing UIs. Focus on: layout patterns (oscillator section, filter section, envelope visualizers, mod matrix), knob/slider interaction design, visual feedback for modulation, preset browsing UX, how they handle complexity (progressive disclosure, tabs, expanding panels). Compare with ACE-Step's current synth UI (just a preset dropdown). Create annotated wireframe descriptions for an ideal ACE-Step synth editor.

### Unit 2: Mixer & Channel Strip UI Research
**Files**: Write to `.llm/research/mixer-channel-strip-ui.md`
**Description**: Research mixer UI design in Ableton (Session/Arrangement mixer), Logic Pro (channel strips), FL Studio (Mixer), Pro Tools (Mix window), and web DAWs (BandLab, Soundtrap). Focus on: fader design (linear vs log), meter types (peak, RMS, LUFS), send/return routing UI, insert effect slot design, bus/group routing visualization, aux/return tracks, I/O routing panels. Compare with ACE-Step's MixerPanel component. Document best practices for responsive mixer layouts in browser.

### Unit 3: Timeline & Arrangement UX Research
**Files**: Write to `.llm/research/timeline-arrangement-ux.md`
**Description**: Research arrangement view UX in Ableton (Arrangement View), Logic (Tracks area), FL Studio (Playlist), Reaper (Arrange), and web DAWs. Focus on: clip display (waveform rendering, MIDI preview, color coding), zoom behavior (horizontal/vertical, anchoring), scrolling patterns (smooth scroll, follow playhead), selection models (lasso, rubber-band, multi-select), clip operations (split, trim, fade, crossfade, time-stretch handles), track header design, lane management (automation lanes, take lanes). Compare with ACE-Step's Timeline component.

### Unit 4: Piano Roll & MIDI Editing UX Research
**Files**: Write to `.llm/research/piano-roll-midi-ux.md`
**Description**: Research MIDI editor UX in Ableton (MIDI Clip editor), Logic (Piano Roll), FL Studio (Piano Roll — widely regarded as best-in-class), Bitwig, and web DAWs. Focus on: note drawing tools (pencil, brush, select), velocity editing UI (bottom lane, color gradient, stem display), quantize workflows, note expression/MPE editing, chord tools, scale highlighting, ghost notes from other tracks, snap grid options, zoom behavior, multi-note editing (transpose, stretch), MIDI effects panel integration. Compare with ACE-Step's PianoRollEditor.

### Unit 5: Drum Machine & Step Sequencer UX Research
**Files**: Write to `.llm/research/drum-machine-sequencer-ux.md`
**Description**: Research drum machine/sequencer UX in Ableton (Drum Rack + step sequencer), MPC/Maschine (pad workflow), Logic (Drum Machine Designer + Step Sequencer), FL Studio (Channel Rack), Roland TR-series, Elektron workflow. Focus on: pad grid layout and feel, velocity-per-step UI, swing/groove controls, pattern management (A/B/fill patterns), per-pad sample assignment UX, choke group configuration, pad performance mode (finger drumming), probability/randomization per step. Compare with ACE-Step's SequencerEditor and DrumMachineEditor.

### Unit 6: Effects Chain & Plugin UI Research
**Files**: Write to `.llm/research/effects-plugin-ui.md`
**Description**: Research effects chain UX in Ableton (Device View — drag-and-drop chain), Logic (Channel Strip plugins), FL Studio (Mixer insert slots), Bitwig (device chain with nesting). Focus on: how effects are added/removed/reordered (drag vs menu), effect rack visualization, parallel processing UI (racks/layers), macro knob mapping, preset management per effect, bypass/wet-dry controls, A/B comparison, how web DAWs (AudioTool, Amped Studio) handle plugin chains. Compare with ACE-Step's EffectsChainEditor.

### Unit 7: Onboarding, Workflow & Learning Curve Research
**Files**: Write to `.llm/research/onboarding-workflow-ux.md`
**Description**: Research how DAWs handle onboarding and workflow efficiency. Focus on: first-run experience (Ableton's "Learn Live", Logic's "Quick Help"), template/starter projects, tooltip systems, keyboard shortcut discoverability, command palette (Bitwig, Reaper), context-sensitive help, project templates, browser/library panel design (Ableton's browser, Splice integration), quick-start workflows ("I want to make a beat" → shortest path). Compare with ACE-Step's current onboarding (none) and identify the minimum viable onboarding experience.

### Unit 8: Sample Browser & Library Management Research
**Files**: Write to `.llm/research/sample-browser-library.md`
**Description**: Research sample/preset browsing in Ableton (Browser with categories, collections, search), Logic (Loop Browser, Sound Library), FL Studio (Browser), Splice, LANDR, Loopcloud. Focus on: folder/tag navigation, audio preview (hover-to-preview, sync-to-tempo), favorites/collections, search with filters (key, BPM, instrument type), drag-from-browser-to-timeline workflow, cloud sample integration, how web DAWs handle large sample libraries. Compare with ACE-Step's LoopLibrary and SampleBrowser components.

### Unit 9: Recording & Input Monitoring UX Research
**Files**: Write to `.llm/research/recording-input-monitoring-ux.md`
**Description**: Research audio recording UX in Ableton, Logic, Pro Tools, Reaper, and web DAWs. Focus on: input selection and routing UI, monitoring modes (input monitoring, software monitoring, direct monitoring), latency display and compensation, count-in/metronome UX, punch-in/punch-out recording, loop recording with take management, comping (take lane selection), recording level metering, buffer size selection UI. Compare with ACE-Step's RecordingEngine and recording UI.

### Unit 10: Automation & Parameter Control UX Research
**Files**: Write to `.llm/research/automation-parameter-ux.md`
**Description**: Research automation editing in Ableton (breakpoint envelopes, automation lanes), Logic (automation curves, relative/absolute modes), FL Studio (automation clips, link to controller), Bitwig (per-clip modulation). Focus on: automation lane display, curve types (linear, bezier, step), automation recording (touch, latch, write modes), parameter selection UI, automation clip vs track automation, relative vs absolute, automation thinning, copy/paste automation. Compare with ACE-Step's AutomationEditor and automation system.

### Unit 11: Collaboration & Project Management UX Research
**Files**: Write to `.llm/research/collaboration-project-ux.md`
**Description**: Research collaboration and project management in BandLab (real-time collab), Soundtrap (real-time collab), Splice (version control for music), Ableton (export/import), FL Studio (project bones). Focus on: real-time multi-user editing, project versioning, stem sharing, comment/annotation systems, project templates, cloud sync, export/share workflows, how AI DAWs (Suno, Udio, AIVA) handle project management. Compare with ACE-Step's current project save/load and AI generation workflow. Identify opportunities unique to AI-first DAWs.

### Unit 12: Accessibility, Performance & Cross-Platform UX Research
**Files**: Write to `.llm/research/accessibility-performance-ux.md`
**Description**: Research accessibility and performance in DAWs and web apps. Focus on: screen reader support in DAWs (Reaper is gold standard for accessibility), keyboard navigation patterns, high-contrast/color-blind modes, Web Audio performance limits (max tracks, effects, at what point does Chrome struggle), mobile/tablet DAW design (GarageBand iOS, Koala Sampler, BandLab mobile), PWA capabilities for DAWs, offline support, touch interaction patterns for DAW controls. Compare with ACE-Step's current accessibility (likely minimal) and identify critical gaps.

## E2E Test Recipe

This is a **research-only** batch — no code changes, only markdown research files. Skip e2e testing. Verification = each research file exists, is well-structured, has competitive analysis with specific examples, and ends with prioritized recommendations for ACE-Step DAW.

## Worker Instructions Template

Each worker receives:
1. The specific research topic and output file path
2. Instructions to use WebSearch and WebFetch for external research
3. Instructions to read relevant ACE-Step source code for comparison
4. Instructions to create GitHub issues for the top findings
5. The commit/push instructions below
