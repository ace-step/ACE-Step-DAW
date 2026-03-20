/**
 * Centralized z-index scale for the DAW.
 *
 * Every z-index used across the application should reference one of these
 * tokens so that stacking order is predictable and easy to audit.
 *
 * The scale leaves gaps (multiples of 10) so new layers can be inserted
 * without renumbering existing ones.
 */
export const Z = {
  /** Gain envelopes, crossfade overlays, warp markers – lowest overlay */
  base: 0,

  /** Labels, automation points, sticky row headers, meter badges */
  trackContent: 10,

  /** Clip text labels, clip badges, resize handles, sequencer playheads */
  clipContent: 20,

  /** Scissor-mode overlays, inline suggestion badges, drop-zone hints */
  overlay: 30,

  /** Playhead line, context-menu backdrop ("click-away" div) */
  playhead: 40,

  /** Context menus, dropdown menus, toolbar menus, generation side panel, autocomplete */
  dropdown: 50,

  /** Panels (AI assistant, undo-history, generation side) */
  panel: 60,

  /** Modals and dialog backdrops */
  modal: 80,

  /** Drag ghost / drag preview */
  dragGhost: 98,

  /** Tooltip & drag-preview top layer */
  tooltip: 100,

  /** Toast notifications */
  toast: 120,

  /** Command palette */
  commandPalette: 160,

  /** App-level overlays (e.g. full-screen loading) */
  appOverlay: 200,

  /** Contextual tips */
  contextualTip: 210,

  /** Onboarding flows */
  onboarding: 240,

  /** Guided tutorial (topmost) */
  tutorial: 250,
} as const;

export type ZIndexToken = keyof typeof Z;
