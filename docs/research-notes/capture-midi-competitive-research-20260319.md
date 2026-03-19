# Capture MIDI Competitive Research

Date: 2026-03-19
Feature: Issue #336, Capture MIDI retroactive recording workflow

## User Story

As a musician, I want to recover the phrase I just played even if I forgot to press Record, so that good ideas are not lost.

As an AI agent, I want a rolling MIDI buffer and a capture action exposed through the store, so that assisted composition and browser automation can recover recent input without canvas-only interaction.

## Ableton Live 12 Capture MIDI Notes

Source reviewed:

- Ableton Live 12 Manual, `19.10 Capturing MIDI`

Interaction details worth copying:

- Capture MIDI is always listening on armed or input-monitored MIDI tracks. The user does not have to enter a special "capture mode" first.
- Capture is a dedicated control-bar action, not a buried menu command. The workflow is "play first, decide later."
- In an empty set with the transport stopped, Capture creates a new clip from the phrase, chooses loop boundaries, and uses the captured material to infer a sensible loop length.
- In an existing set or while transport is running, Capture uses the current song tempo instead of retiming the project. It still extracts a musically meaningful phrase from the recent performance.
- Capture can add notes on top of an existing playing clip, so retroactive capture is not limited to new-clip creation.
- Notes played before the detected loop start are still preserved in the clip data, which lets users adjust loop boundaries after capture.

## ACE-Step Product Decision

Copy from competitor:

- Always-on rolling buffer for MIDI input on eligible piano-roll tracks
- Dedicated toolbar action and keyboard shortcut for capture
- Capture behavior that prefers the current project tempo instead of mutating song tempo
- Overdub into an existing open or overlapping MIDI clip when that is the most obvious target

Improve for ACE-Step:

- Expose rolling-buffer ingestion and capture through Zustand store actions so agents can drive and verify the feature directly from `window.__store`.
- Keep capture as a single store mutation so Undo removes the captured result cleanly in one step.
- Provide a deterministic fallback phrase window and bar-snapped clip creation when no transport-aligned context exists.

Skip for this issue:

- Tempo inference from the performed phrase
- Multi-track simultaneous clip creation from one capture press
- Capturing notes outside the active project context into a separate session view model
