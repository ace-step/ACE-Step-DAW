# Timeline Zoom Best Practices for Native-Feeling DAW UX

Date: 2026-03-21

## Problem

As a user, I want timeline zoom in/out to preserve my spatial context, so that I can stay oriented while arranging.

As an agent, I want all timeline zoom actions to follow one viewport model, so that selection fit, project fit, wheel zoom, and keyboard zoom behave consistently.

## Competitive Notes

### Ableton Live 12

Observed guidance from Ableton's Live 12 help and manual materials:

- Timeline zoom is treated as navigation, not just scale change.
- `Zoom to Selection` is a first-class workflow, not a side feature.
- Returning to the previous zoom state is part of the expected editing loop after drilling into a section.
- Arrangement navigation is built around preserving context while moving between full-song and local-detail views.

Implication for ACE-Step:

- Selection zoom and project zoom should share the same viewport model.
- Users should not need to manually repair scroll position after a zoom action.
- "Detail view" and "back to arrangement" should feel reversible and predictable.

### Logic Pro

Observed guidance from Logic Pro user documentation and workflow references:

- Pointer-centered zoom is the default expectation for detailed editing.
- When the pointer is close to the playhead, zooming around the playhead is more stable than zooming around the pointer.
- Timeline rulers adapt labeling density with zoom level instead of keeping one fixed grid presentation.

Implication for ACE-Step:

- Trackpad or mouse-wheel zoom should anchor to the pointer by default.
- If the pointer is visually near the playhead, the playhead should win as the anchor.
- Keyboard zoom should prefer the visible playhead, then fall back to viewport center.

### REAPER

Observed guidance from REAPER documentation and release notes:

- Horizontal zoom behavior is configurable around meaningful musical anchors such as edit cursor or play cursor.
- Better handling near the project end is explicitly called out as a quality issue.

Implication for ACE-Step:

- The timeline right edge must be clamped by one shared max-scroll rule.
- End-of-project zoom behavior is not a cosmetic detail; it is core editing ergonomics.

## Recommended ACE-Step Zoom Model

1. Wheel or trackpad zoom: pointer-anchored by default.
2. Pointer near playhead: automatically switch to playhead-anchored zoom.
3. Keyboard zoom: playhead-anchored when visible, otherwise viewport-centered.
4. Zoom to selection: fit with breathing room, never edge-to-edge.
5. Zoom to project: fit full arrangement, then clamp scroll to legal bounds.
6. All zoom entry points: use one viewport model for `pixelsPerSecond`, `scrollLeft`, `viewportWidth`, `contentWidth`, and `maxScrollLeft`.

## Anti-Patterns to Avoid

- Updating only the zoom scale and letting scroll drift.
- Having different clamp rules for wheel zoom vs fit-to-selection.
- Letting DOM width and logical scroll width disagree.
- Letting the right edge reveal invalid empty space after zoom changes.

## Sources

- Ableton Live 12 navigation FAQ: https://help.ableton.com/hc/en-us/articles/12243771208092-Navigation-and-View-Options-in-Live-12-FAQ
- Ableton Live 12 manual index: https://www.ableton.com/en/live-manual/12/
- Logic Pro user guide index: https://support.apple.com/guide/logicpro/welcome/mac
- REAPER user guide and release notes archive: https://www.reaper.fm/userguide.php
