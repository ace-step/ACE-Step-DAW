# DAW Interaction Design Standards

> Every UI component MUST follow these interaction patterns. Reference this file when writing any component that handles user interaction.

## Timeline & Clip Interactions
- **Snap to grid**: All drag operations snap to beat/bar grid by default. Hold Alt for free movement.
- **Zoom anchor**: Zoom (Cmd+scroll) anchors to mouse cursor position, not center.
- **Multi-select drag**: Shift+click for additive select, Cmd+click for toggle. Dragging multiple clips maintains relative positions.
- **Ghost preview**: Show a semi-transparent ghost at the snap-to position during drag, BEFORE drop.
- **Cross-track drag**: Clips can be dragged between tracks. Show blue highlight on valid target lanes, red on invalid.
- **Clip resize**: Left/right edges are resize handles (6px). Cursor changes to `col-resize`. Hold Alt for non-snapped resize.

## Knobs, Sliders & Controls
- **Vertical drag for knobs**: Map vertical mouse movement to value changes (UP = increase). Use pointer lock to prevent cursor hitting screen edge.
- **Double-click to reset**: Double-clicking any knob/slider resets to default value.
- **Right-click for precision**: Right-click opens a text input for exact value entry.
- **Scroll to adjust**: Mouse wheel on a focused knob/slider adjusts by fine increments.
- **Visual feedback**: All value changes must reflect in under 100ms with smooth visual transitions.

## Keyboard-First Design
- **Every action is keyboard-accessible**: If a mouse action exists, a keyboard shortcut or tab-navigable path must exist too.
- **Transport always responds**: Space=play/pause, Enter=stop/return-to-start — works regardless of focus (unless in a text input).
- **No shortcut conflicts**: Check `src/components/dialogs/KeyboardShortcutsDialog.tsx` for existing mappings before adding new ones.
- **Modifier conventions**: Cmd/Ctrl = primary action, Shift = additive/extend, Alt = bypass snap/free mode, Cmd+Shift = alternative variant.

## Feedback & Responsiveness
- **< 100ms**: Visual feedback for any user action (click, drag start, hover state change).
- **< 16ms**: Audio parameter changes (volume, pan) must update within one animation frame.
- **Progress indication**: Any operation > 500ms shows a spinner or progress bar.
- **Toast notifications**: Use `useToast()` for success/error/info messages. Auto-dismiss after 3s for success, persist for errors.

## Progressive Disclosure
- **Default = simple**: New users see a clean, uncluttered interface. Advanced features behind toggles/menus.
- **Right-click for power**: Context menus reveal advanced options without cluttering the main UI.
- **Hover for details**: Show tooltips with keyboard shortcut hints after 500ms hover delay.
- **Panel toggles**: All panels (mixer, library, effects) toggle with single-key shortcuts.

## Drag-and-Drop Rules
- **Always provide drag feedback**: Source element shows visual change (opacity, border), cursor changes.
- **Valid/invalid zones**: Clearly indicate where drops are accepted (glow/highlight) vs rejected (no-drop cursor).
- **Cancel support**: Escape during drag cancels and returns to original state.
- **data-* attributes**: All drag targets must have `data-track-id`, `data-clip-id` for both E2E testing and agent interaction.

## Agent-Friendly Design
- **Every UI action = store action**: Every feature must work via `window.__store.getState().actionName()`.
- **State is truth**: UI always derives from Zustand store state. No local state for anything an agent might need.
- **Error messages are actionable**: "Track 'xyz' not found" instead of "Error occurred".
- **Undo everything**: Every user/agent action pushes to history via `_pushHistory()`.

## Color & Visual Language
- **Track colors**: Each track has a unique color (from palette). Used on: left strip, clip backgrounds, waveforms, mixer channel.
- **State indicators**: Green = active/armed, Red = recording/error, Yellow = warning/caution, Blue = selected/focused.
- **Contrast**: All text must meet WCAG AA (4.5:1 ratio) against dark backgrounds.
- **Color-blind safe**: Never use color alone to convey meaning — always pair with shape/icon/label.
