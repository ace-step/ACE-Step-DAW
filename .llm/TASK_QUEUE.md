# ACE-Step DAW — Task Queue

> Auto-managed by the orchestrator agent. Pick from top, always keep pipeline full.
> Format: [priority] [type] description

## Ready (pick next)

- [P0] [feat] Audio context resume overlay on first user gesture
- [P0] [feat] Cmd+Z / Cmd+Shift+Z undo/redo — ensure works in every context
- [P0] [feat] DAWState.summary — auto-generated natural language project summary for agents
- [P1] [feat] Timeline minimap — project overview strip at top
- [P1] [feat] Zoom gestures — Cmd+Scroll horizontal, Cmd+Shift+Scroll vertical
- [P1] [feat] Adaptive grid — auto grid resolution based on zoom level
- [P1] [feat] Ghost notes in piano roll (FL Studio style)
- [P1] [feat] OS file drop — drag audio files from Finder into timeline
- [P1] [feat] Drag preview ghost — translucent clip preview during drag
- [P1] [refactor] Extract drag math from ClipBlock into dragMath.ts (use existing utils)
- [P2] [feat] Scrubbing — click-drag on timeline ruler
- [P2] [feat] Chord stamp tool for piano roll
- [P2] [feat] Prompt history panel for AI generation
- [P2] [test] Playwright E2E: keyboard shortcuts
- [P2] [test] Playwright E2E: effect chain operations

## In Progress

(auto-populated by orchestrator)

## Done Today

(auto-populated)

## Subagent Queue (research/heavy tasks to parallelize)

- [P1] [research] ACE-Step 1.5 model — how to start, switch to base model
- [P2] [research] Electron packaging strategy for browser DAW
- [P2] [research] CLAP/VST plugin hosting in WASM
