# Scoped Undo History Competitive Research

Date: 2026-03-19
Issue: #334

## User Story

As a producer, I want undo to follow the panel I am actively editing, so that MIDI edits, mixer moves, and arrangement changes do not feel coupled into one risky global stack.

## Competitive Findings

### Ableton Live 12

- Undo trust is reinforced by clear editor context: piano-roll note edits happen inside a dedicated MIDI editor, mixer adjustments happen in channel strips, and arrangement edits happen on the timeline.
- The interaction design implication for ACE-Step is that `Cmd/Ctrl+Z` should follow the current editing surface, not just the latest project mutation anywhere in the app.
- Fast iteration requires recognizable history steps. “Edit MIDI note” or “Adjust mixer” is more usable than an opaque generic checkpoint.

### DAW UX takeaway

- Users expect scoped mental models even when the engine stores one project document.
- A visible history surface reduces fear during destructive-feeling workflows such as MIDI transformations, effect changes, and AI-assisted clip updates.
- Agent workflows need the same benefit: scoped APIs and readable labels make scripted edits debuggable and reversible.

## ACE-Step Implications

- Add explicit history scopes for arrangement, track, piano roll, and mixer.
- Route keyboard undo/redo through the current focused scope.
- Surface readable labels and timestamps in a visible panel instead of hiding history in a private store array.
- Keep agent access CLI-first through `window.__store.getState().getUndoHistory(scope)` and `jumpToHistoryEntry(...)`.
