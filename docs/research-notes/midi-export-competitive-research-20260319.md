# MIDI Export Competitive Research

Date: 2026-03-19
Feature: Issue #215, MIDI clip export as `.mid`

## User Story

As a user, I want to export a piano roll clip as a standard MIDI file, so that I can reuse the performance in another DAW or send it to collaborators.

As an AI agent, I want MIDI export to be reachable through a stable store action, so that browser automation can trigger the exact same workflow without coordinate-based canvas interaction.

## Ableton Reference

Ableton’s knowledge base documents the expected interaction clearly:

- The clip-level action lives on the MIDI clip context menu, not in the global mix export flow.
- The command name is `Export MIDI Clip...`.
- The result is a standard MIDI file containing the clip’s MIDI content, distinct from Live Clip `.alc` export.

Source reviewed:

- Ableton Knowledge Base, `Using Live Clips (.alc files)`, section `Exporting MIDI Clips as MIDI files`

Implementation takeaway:

- Copy the interaction model: right-click a MIDI clip and export only that clip’s MIDI data.
- Do not overload the existing project-level audio export dialog with clip-only MIDI export.
- Keep the output format portable: standard MIDI file with tempo and time-signature metadata.

## Product Decision

Copy from Ableton:

- Clip-level context-menu entry named `Export MIDI Clip…`
- Export only the selected MIDI clip’s note data

Improve on current ACE-Step architecture:

- Add `exportMidiClip(clipId)` to `window.__store` so the same feature works for browser automation and agent-driven testing.
- Reuse the existing MIDI utility layer for encoding, instead of embedding byte-writing logic in a React component.

Skip for v1:

- Batch-exporting multiple MIDI clips
- Exporting per-clip automation or device-chain state
- Tempo-map and time-signature-map changes beyond the first project value
