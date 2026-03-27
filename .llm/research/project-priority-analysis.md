# ACE-Step DAW — Project Priority Analysis

> Generated: 2026-03-27
> Scope: Full codebase review + 60 open issues + 27 open PRs + TASK_QUEUE.md

---

## Executive Summary

ACE-Step DAW is at **~65-70% production readiness**. The project has strong architecture (Zustand + Tone.js + React), comprehensive type system (249+ types), and solid AI generation pipeline (LEGO context-aware generation). However, several **foundational DAW capabilities** remain unimplemented or disconnected, which block the product from being usable for real music production.

**Key finding:** The TASK_QUEUE.md contains 8 Sprint 1 P0 items that have NO corresponding GitHub issues — these represent the most critical untracked work.

---

## Current State Snapshot

| Metric | Value |
|--------|-------|
| Source files | ~107 TS/TSX |
| React components | ~140 |
| Unit tests | 94 (Vitest) |
| E2E tests | 21 (Playwright) |
| Open issues | 60 |
| Open PRs | 27 (many stalled) |
| Closed issues | 100 |
| Merged PRs | 71 |
| Track types | 5 (Stems, Sample, Sequencer, Piano Roll, Strudel) |

---

## Gap Analysis: What's NOT Tracked by Existing Issues

### Tier 1 — Blocks Basic DAW Usability (P0)

These items are in TASK_QUEUE.md but have **no GitHub issue**, meaning they're invisible to project management:

| Gap | TASK_QUEUE ref | Impact |
|-----|---------------|--------|
| ~~Effects not connected to live audio path~~ | S1-03 | **Already implemented** — `useEffectsSync` + `spliceEffects()` |
| ~~Effects not applied in WAV export~~ | S1-04 | **Already implemented** — `buildOfflineEffects()` in exportMix.ts |
| Audio context resume overlay | S1-01 | No sound on first visit — users think app is broken |
| Auto-save + crash recovery | S1-06 | Users lose work on browser crash/reload |
| Recording workflow not wired to UI | S1-08 | Record button non-functional despite engine existing |
| MIDI file import/export (SMF) | none | Cannot exchange MIDI with any other DAW |

### Tier 2 — Competitive Parity (P1)

| Gap | Existing coverage | What's missing |
|-----|-------------------|---------------|
| Latency calibration | TASK_QUEUE backlog | No GitHub issue; critical for recording use case |
| Keyboard shortcut consolidation | S1-07 in TASK_QUEUE | No issue; shortcuts partially implemented but not unified |
| Error boundaries | todo.md debt | No issue; lazy-loaded components can white-screen |
| Performance at scale (20+ tracks) | #855, #856 partial | No audio engine stress testing or AudioWorklet path |

### Tier 3 — Process & Quality (P1-P2)

| Gap | Impact |
|-----|--------|
| 27 stalled open PRs | Review bottleneck; code divergence risk |
| 47 skipped tests (#1079) | False confidence in test suite |
| 282 weak assertions (#1078) | Tests pass but don't verify behavior |
| E2E tests non-blocking in CI (#1081) | Regressions merge to main undetected |

---

## Existing Issues — Priority Reassessment

### Currently Open Issues by Category

**Infrastructure & Quality (should be P0):**
- #1081 — E2E non-blocking in CI (regressions merge freely)
- #1080 — No coverage threshold
- #1079 — 47 skipped tests
- #1078 — 282 weak assertions

**Architecture (P1, high ROI):**
- #1025 — projectStore.ts is 8400 lines (decompose)
- #1026-#1028 — ClipBlock, Timeline, PianoRollCanvas each 1000+ lines
- #1031 — Unify instrument engines

**AI Model Evolution (P0-P1, core differentiator):**
- #737 — Upgrade stem separation to BS-RoFormer
- #738 — AI auto-mixing with GRAFX
- #739 — MIDI AI generation in Piano Roll
- #741 — Unified AI model service architecture

**Session View (P1-P2, Ableton parity):**
- #920, #925, #926, #929 — Follow actions, mixer, recording, scene properties
- #1032-#1034 — Launch quantization, scene properties, MIDI retroactive capture

**Synth/Sound Design (P2-P3, nice-to-have):**
- #944-#963 — Wavetable, granular, additive, physical modeling, MPE, spectral

---

## Recommended Priority Order

### Phase 1: "Make It Work" (next 2 sprints)

> Goal: A user can open the DAW, hear effects, record audio, save safely, and export a proper mix.

1. ~~**Effects in live playback**~~ — **Already implemented** (closed #1100)
2. ~~**Effects in WAV export**~~ — **Already implemented** (closed #1101)
3. **Audio context resume** — First-visit experience; zero effort, high impact
4. **Auto-save + crash recovery** — Users WILL lose work without this
5. **Recording workflow wiring** — Engine exists, just needs UI connection
6. **CI quality gates** — #1081 + #1080; stop regressions from merging

### Phase 2: "Make It Interoperable" (sprint 3-4)

> Goal: Users can bring work from other DAWs and collaborate.

7. **MIDI import/export** — Standard SMF format; table-stakes for any DAW
8. **Latency calibration** — Required for recording to be useful
9. **Error boundaries** — Prevent white-screen crashes
10. **PR backlog triage** — Review/merge/close the 27 open PRs

### Phase 3: "Make It Competitive" (sprint 5+)

> Goal: Feature parity with browser DAW competitors (BandLab, Soundtrap).

11. **AI model upgrades** — #737, #738, #739 (core differentiator)
12. **projectStore decomposition** — #1025 (unblocks team scaling)
13. **Performance optimization** — AudioWorklet, virtualized rendering
14. **Session view completion** — #920, #925, #926
15. **Onboarding experience** — #970

### Phase 4: "Make It Exceptional" (long-term)

16. **Collaboration** — #974
17. **Advanced synthesis** — Wavetable, granular, physical modeling
18. **VST3 ecosystem** — #821, #888
19. **Accessibility** — #975
20. **Mobile/responsive** — Currently desktop-only

---

## Open PR Triage Recommendation

| PR | Status | Recommendation |
|----|--------|---------------|
| #1072 | Persistence optimization | **Merge priority** — fixes #856 |
| #1052 | ClipBlock decomposition | **Merge** — addresses #1026 |
| #1050 | PianoRoll decomposition | **Merge** — addresses #1028 |
| #1049 | Timeline decomposition | **Merge** — addresses #1027 |
| #1046 | projectStore MIDI extract | **Merge** — step toward #1025 |
| #1039 | Aux sends wiring | **Merge** — audio routing improvement |
| #1038 | Instrument engine interface | **Merge** — prerequisite for #1031 |
| #1077, #1075, #1073, #1071 | New synth features | **Hold** — nice-to-have, merge after Phase 1 |
| #1063 | Clip edit mode | **Review** — touches core clip system |
| #983 | ONNX BPM detection | **Hold** — large dependency, needs perf review |
| #918 | Audio drop fix | **Merge** — bug fix |

---

## New Issues to Create

Based on this analysis, the following GitHub issues should be created for the highest-priority untracked gaps:

1. ~~`feat: Connect effects engine to live audio playback path`~~ — **Closed: already implemented**
2. ~~`feat: Apply effects chain in WAV/stem export via OfflineAudioContext`~~ — **Closed: already implemented**
3. `feat: Audio context resume overlay on first user gesture`
4. `feat: Auto-save to IndexedDB with crash recovery`
5. `feat: Wire RecordingEngine to UI (record button, arm, mic permissions)`
6. `feat: MIDI file import/export (Standard MIDI File format)`
7. `feat: Latency calibration UI with auto-detection`
8. `chore: Triage and resolve 27 stalled open PRs`
