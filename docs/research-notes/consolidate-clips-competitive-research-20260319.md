# Consolidate / Glue Clips Competitive Research (2026-03-19)

## User stories

- As a producer, I want to merge split arrangement clips back into one clip, so that further edits are simpler and less error-prone.
- As an AI agent, I want to call `window.__store.getState().consolidateClips(trackId, clipIds)`, so that I can complete clip-editing workflows without canvas-only interactions.

## Ableton Live 12

Source: https://www.ableton.com/en/live-manual/12/arrangement-view/

- `Consolidate` is available from the Edit menu, the Arrangement clip context menu, and the keyboard shortcut `Cmd+J` / `Ctrl+J`.
- It combines selected material from adjacent clips into one new clip.
- It works per track and can also consolidate selections across multiple tracks, producing one new sample per track.
- The resulting clip behaves like a normal clip after creation and is commonly used to create a reusable loop from several edited regions.
- For audio, the rendered result includes in-clip attenuation, time-warping, pitch shifting, and clip envelopes.
- For audio, the rendered result does not include downstream track effects or mixer processing. That is a separate export workflow.

## Product decision for ACE-Step DAW #330

- Match the single-track consolidate workflow first.
- Support both audio clips and MIDI clips on the same track.
- Keep the render scope aligned with Ableton's clip-level behavior:
  - Include silence between selected clips.
  - Include clip offsets, clip gain envelopes, and fades in the rendered audio.
  - Do not bake track FX or mixer state into the consolidated clip.
- Reject mixed audio+MIDI selections and cross-track selections with a clear error, because the issue scope and current data model are track-local.

## UX implications

- `Cmd+J` / `Ctrl+J` should operate on the current timeline selection.
- Right-clicking a selected clip should expose `Consolidate` without forcing users into a separate toolbar flow.
- After consolidation, the new clip should remain selected so the next action is immediate.
- Undo must restore the original clip set in one step.
