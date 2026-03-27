/**
 * Keyboard shortcut binding types for the shortcut editor.
 *
 * Each shortcut is identified by a unique `actionId` (e.g. "transport.playPause").
 * A `ShortcutBinding` maps that action to a physical key combo expressed as a
 * `KeyboardEvent.code` value plus modifier flags.
 */

/** A single key combination (e.g. Cmd+Shift+G). */
export interface KeyCombo {
  code: string;          // KeyboardEvent.code — e.g. "KeyG", "Space", "Digit0"
  mod?: boolean;         // Cmd/Ctrl
  shift?: boolean;
  alt?: boolean;
}

/** One shortcut binding — maps an action id to a key combo. */
export interface ShortcutBinding {
  actionId: string;
  combo: KeyCombo;
}

/** Metadata about a shortcut action (for display in the editor). */
export interface ShortcutAction {
  id: string;
  category: ShortcutCategory;
  label: string;
  /** Default combo shipped with ACE-Step. */
  defaultCombo: KeyCombo;
  /** Which keyboard context this shortcut primarily belongs to. */
  contexts?: ShortcutContext[];
}

export type ShortcutCategory =
  | 'transport'
  | 'clips'
  | 'tracks'
  | 'navigation'
  | 'view'
  | 'generation'
  | 'panels'
  | 'project'
  | 'pianoRoll'
  | 'session';

export type ShortcutContext =
  | 'global'
  | 'timeline'
  | 'pianoRoll'
  | 'mixer'
  | 'drumMachine'
  | 'strudel'
  | 'session';

/** A complete set of overrides keyed by actionId. */
export type ShortcutMap = Record<string, KeyCombo>;

/** A named preset that provides a full ShortcutMap override. */
export interface ShortcutPreset {
  id: string;
  name: string;
  description: string;
  map: ShortcutMap;
}

export interface ShortcutBindingExport {
  version: 1;
  presetId: string;
  overrides: ShortcutMap;
  exportedAt: string;
}
