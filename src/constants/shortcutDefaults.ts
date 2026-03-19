import type { ShortcutAction, ShortcutCategory } from '../types/shortcuts';

/**
 * Canonical list of every re-bindable shortcut action in ACE-Step DAW.
 *
 * The `id` field is the stable key used in the shortcuts store; the
 * `defaultCombo` is the factory-default binding that ships with ACE-Step.
 */
export const SHORTCUT_ACTIONS: ShortcutAction[] = [
  // ── Transport ──────────────────────────────────────────────────
  { id: 'transport.playPause',   category: 'transport', label: 'Play / Pause',            defaultCombo: { code: 'Space' } },
  { id: 'transport.stop',        category: 'transport', label: 'Stop + Return to 0',      defaultCombo: { code: 'Enter' } },
  { id: 'transport.loop',        category: 'transport', label: 'Toggle Loop',              defaultCombo: { code: 'KeyL' } },
  { id: 'transport.metronome',   category: 'transport', label: 'Toggle Metronome',         defaultCombo: { code: 'KeyK' } },
  { id: 'transport.record',      category: 'transport', label: 'Toggle Record',            defaultCombo: { code: 'KeyR' } },
  { id: 'transport.home',        category: 'transport', label: 'Jump to Start',            defaultCombo: { code: 'Home' } },
  { id: 'transport.end',         category: 'transport', label: 'Jump to End',              defaultCombo: { code: 'End' } },
  { id: 'transport.nudgeLeft',   category: 'transport', label: 'Nudge Playhead Left',      defaultCombo: { code: 'ArrowLeft' } },
  { id: 'transport.nudgeRight',  category: 'transport', label: 'Nudge Playhead Right',     defaultCombo: { code: 'ArrowRight' } },
  { id: 'transport.punchIn',     category: 'transport', label: 'Set Punch-In Point',       defaultCombo: { code: 'KeyI' } },
  { id: 'transport.punchOut',    category: 'transport', label: 'Set Punch-Out Point',      defaultCombo: { code: 'KeyO' } },

  // ── Clips ──────────────────────────────────────────────────────
  { id: 'clips.delete',          category: 'clips',     label: 'Delete Selected Clips',    defaultCombo: { code: 'Delete' } },
  { id: 'clips.duplicate',       category: 'clips',     label: 'Duplicate Clip',           defaultCombo: { code: 'KeyD', mod: true } },
  { id: 'clips.split',           category: 'clips',     label: 'Split Clip at Playhead',   defaultCombo: { code: 'KeyS' } },
  { id: 'clips.selectAll',       category: 'clips',     label: 'Select All Clips',         defaultCombo: { code: 'KeyA', mod: true } },
  { id: 'clips.edit',            category: 'clips',     label: 'Edit Selected Clip',       defaultCombo: { code: 'KeyE' } },
  { id: 'clips.generate',        category: 'clips',     label: 'Generate Selected Clip',   defaultCombo: { code: 'Enter', mod: true } },

  // ── View ───────────────────────────────────────────────────────
  { id: 'view.zoomIn',           category: 'view',      label: 'Zoom In',                  defaultCombo: { code: 'Equal', mod: true } },
  { id: 'view.zoomOut',          category: 'view',      label: 'Zoom Out',                 defaultCombo: { code: 'Minus', mod: true } },
  { id: 'view.zoomReset',        category: 'view',      label: 'Reset Zoom',               defaultCombo: { code: 'Digit0', mod: true } },
  { id: 'view.zoomToFit',        category: 'view',      label: 'Zoom to Fit Project',      defaultCombo: { code: 'KeyZ' } },
  { id: 'view.toggleSnap',       category: 'view',      label: 'Toggle Snap',              defaultCombo: { code: 'KeyN' } },

  // ── Generation ─────────────────────────────────────────────────
  { id: 'generation.silence',    category: 'generation', label: 'Generate from Silence',   defaultCombo: { code: 'KeyG', mod: true } },
  { id: 'generation.context',    category: 'generation', label: 'Generate from Context',   defaultCombo: { code: 'KeyG', mod: true, shift: true } },

  // ── Panels ─────────────────────────────────────────────────────
  { id: 'panels.mixer',          category: 'panels',    label: 'Toggle Mixer',              defaultCombo: { code: 'KeyX' } },
  { id: 'panels.smartControls',  category: 'panels',    label: 'Toggle Smart Controls',     defaultCombo: { code: 'KeyB' } },
  { id: 'panels.library',        category: 'panels',    label: 'Toggle Library',            defaultCombo: { code: 'KeyY' } },
  { id: 'panels.tempoLane',      category: 'panels',    label: 'Toggle Tempo Lane',         defaultCombo: { code: 'KeyT' } },
  { id: 'panels.aiAssistant',    category: 'panels',    label: 'Toggle AI Assistant',       defaultCombo: { code: 'Slash', mod: true } },

  // ── Project ────────────────────────────────────────────────────
  { id: 'project.new',           category: 'project',   label: 'New Project',               defaultCombo: { code: 'KeyN', mod: true } },
  { id: 'project.open',          category: 'project',   label: 'Open Project List',         defaultCombo: { code: 'KeyO', mod: true } },
  { id: 'project.bounceInPlace', category: 'project',   label: 'Bounce Selected/Focused Track', defaultCombo: { code: 'KeyB', mod: true } },
  { id: 'project.settings',      category: 'project',   label: 'Settings',                  defaultCombo: { code: 'Comma', mod: true } },
  { id: 'project.export',        category: 'project',   label: 'Export',                    defaultCombo: { code: 'KeyE', mod: true, shift: true } },
  { id: 'project.addTrack',      category: 'project',   label: 'Add Track',                 defaultCombo: { code: 'KeyI', mod: true, shift: true } },
  { id: 'project.help',          category: 'project',   label: 'Keyboard Shortcuts Help',   defaultCombo: { code: 'Slash', shift: true } },

  // ── Piano Roll ─────────────────────────────────────────────────
  { id: 'pianoRoll.delete',       category: 'pianoRoll', label: 'Delete Selected Notes',    defaultCombo: { code: 'Delete' } },
  { id: 'pianoRoll.transposeUp',  category: 'pianoRoll', label: 'Transpose Up 1 Semitone',  defaultCombo: { code: 'ArrowUp', shift: true } },
  { id: 'pianoRoll.transposeDown',category: 'pianoRoll', label: 'Transpose Down 1 Semitone',defaultCombo: { code: 'ArrowDown', shift: true } },
  { id: 'pianoRoll.quantize',     category: 'pianoRoll', label: 'Quantize Selected Notes',  defaultCombo: { code: 'KeyQ' } },
  { id: 'pianoRoll.quantizeOpts', category: 'pianoRoll', label: 'Quantize with Options',    defaultCombo: { code: 'KeyQ', mod: true } },
  { id: 'pianoRoll.selectAll',    category: 'pianoRoll', label: 'Select All Notes',         defaultCombo: { code: 'KeyA', mod: true } },
];

/** Quick lookup: actionId → ShortcutAction */
export const SHORTCUT_ACTION_MAP: Record<string, ShortcutAction> = Object.fromEntries(
  SHORTCUT_ACTIONS.map((a) => [a.id, a]),
);

/** Ordered list of categories for UI display. */
export const SHORTCUT_CATEGORIES: { id: ShortcutCategory; label: string }[] = [
  { id: 'transport',  label: 'Transport' },
  { id: 'clips',      label: 'Clips' },
  { id: 'view',       label: 'View' },
  { id: 'generation', label: 'Generation' },
  { id: 'panels',     label: 'Panels' },
  { id: 'project',    label: 'Project' },
  { id: 'pianoRoll',  label: 'Piano Roll' },
];
