# Piano Roll Power Tools Competitive Research

Date: 2026-03-19
Feature: Issue #341, piano roll power tools for fast MIDI editing

## User Story

As a composer, I want pencil, paint, erase, resize, and slide-note tools to behave predictably, so that dense MIDI editing feels immediate instead of mode-heavy.

As an AI agent, I want the same edit primitives represented in the note data model and store actions, so that programmatic MIDI authoring matches what human users can do in the canvas.

## Ableton Live 12 MIDI Editor Notes

Source reviewed:

- Ableton Live 12 Manual, `10. Editing MIDI`, especially sections `10.2`, `10.4`, and `10.5`

Interaction details worth copying:

- Draw mode is an explicit mode with a keyboard toggle (`B`), not an implicit side effect hidden inside other gestures.
- In draw mode, dragging adds notes continuously and clicking an existing note removes it. That makes paint and erase part of one fast workflow instead of forcing toolbar detours.
- Grid snapping is the default behavior for note creation and resize, with a temporary modifier to bypass snap. This preserves speed without blocking loose input.
- The velocity lane is integrated directly below the note editor, resizable by dragging the divider, so note dynamics stay visible while editing pitch and timing.
- Notes can be selected first and then moved or transposed with keyboard actions. The editor is selection-centric, not canvas-only.

## ACE-Step Product Decision

Copy from competitor:

- Explicit tool model instead of a single draw toggle
- Number-key tool switching for immediate editing
- Draw/paint behavior that can also erase by acting directly on notes
- Integrated velocity lane and snap-first editing

Improve for ACE-Step:

- Keep all note-edit primitives agent-usable by extending the `MidiNote` model with slide metadata instead of making slide notes a canvas-only visual trick.
- Add left-edge resize, because the current editor already supports right-edge resize and selection-first workflows.
- Make slide notes visually distinct in both the note body and velocity lane so they are readable in dense patterns.

Skip for this issue:

- MPE per-note expressions
- Probability/chance lanes
- Advanced FL-style stamp libraries beyond the existing chord/pattern foundations
