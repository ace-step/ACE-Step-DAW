# Bounce In Place Competitive Research — 2026-03-19

## User Story

As a producer, I want to commit a track to editable audio without leaving the arrangement, so that I can slice, reverse, resample, and reduce instrument complexity quickly.

## Competitor Notes

### Ableton Live 12

- Freeze/Flatten is track-scoped and explicitly destructive only at the flatten step.
- Bounce-related actions are available close to the track context, not buried in export flows.
- The core mental model is "commit this lane to audio, then continue arranging."

### Logic Pro

- Bounce in Place is region-oriented and designed as a creative workflow, not only a CPU optimization tool.
- The flow exposes options before rendering so users decide whether the result replaces the source or creates a sibling audio result.
- The default expectation is immediate editability after render.

### FL Studio

- "Render as audio clip" keeps the operation close to the playlist workflow.
- The result is an audio clip the user can manipulate immediately inside the arrangement.
- Keeping the original material available is treated as a practical option for experimentation.

## Product Decisions For ACE-Step

- Keep bounce in the track-header context menu to match DAW expectations.
- Add a preflight dialog instead of a one-click destructive action.
- Support both destructive replace and non-destructive sibling-track creation.
- Expose the action through `window.__store.getState().bounceInPlace(trackId, options)` so agents can drive the same workflow without canvas clicks.
- Reuse the offline render pipeline already used by export/freeze instead of inventing a second rendering stack.
