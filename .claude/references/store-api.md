# Store API Reference (for programmatic testing, E2E, and agent interaction)

> Every feature MUST be operable via `window.__store` API in addition to the GUI.

## Quick Reference

```js
// Read project state
window.__store.getState().project.tracks

// Add track
window.__store.getState().addTrack('stems' | 'sample' | 'sequencer' | 'pianoroll')

// Add MIDI note to a clip
window.__store.getState().addMidiNote(clipId, {
  pitch: 60,        // MIDI note number (C4)
  startBeat: 0,     // Beat position
  durationBeats: 1, // Length in beats
  velocity: 0.8     // 0-1
})

// Toggle a sequencer step
window.__store.getState().toggleSequencerStep(trackId, rowId, stepIndex)

// Update project settings
window.__store.getState().updateProjectSettings({ bpm: 140 })
```

## Agent-Usability Mandate (CLI-First)

Every feature MUST be usable by both human users AND AI agents.

### What "CLI-First" Means
- **Every feature must be operable from the command line** — via `window.__store` API, keyboard shortcuts, or browser automation.
- **Development itself is CLI-driven**: agents write plans, execute code, run builds, test via browser automation, commit, PR, merge — all without manual GUI steps.
- **Testing is CLI-driven**: agents open the app in a headless browser, interact via accessibility refs and store API, take screenshots, verify results programmatically.

### Principles
1. **Expose state globally**: `window.__store` provides full Zustand store access.
2. **ARIA labels on interactive elements**: Every clickable element MUST have an `aria-label` or `role` so browser automation tools can discover and interact via accessibility tree.
3. **No canvas-only interactions**: If a feature relies on canvas click events, provide an equivalent store API.
4. **Reasonable defaults**: UI scroll positions, zoom levels, and panel states should open to the most useful position.
5. **Keyboard shortcuts for every action**: Every toolbar button and panel toggle must have a keyboard shortcut.

### Testing Standard
- Bad: "I opened the panel and it rendered" — too shallow
- Good: "I programmed a basic rock beat via store API, verified each step activated" — deep enough
- Tests must cover **full user workflows**, not just UI rendering
