import type {
  BrowserShortcutRule,
  KeyCombo,
} from '../types/shortcuts';

export function normalizeCombo(combo: KeyCombo): KeyCombo {
  return {
    code: combo.code,
    mod: combo.mod || undefined,
    shift: combo.shift || undefined,
    alt: combo.alt || undefined,
  };
}

export function comboEquals(a: KeyCombo, b: KeyCombo): boolean {
  const left = normalizeCombo(a);
  const right = normalizeCombo(b);
  return (
    left.code === right.code &&
    left.mod === right.mod &&
    left.shift === right.shift &&
    left.alt === right.alt
  );
}

export const BROWSER_RESERVED_SHORTCUTS: BrowserShortcutRule[] = [
  {
    id: 'browser.closeTab',
    combo: { code: 'KeyW', mod: true },
    severity: 'error',
    reason: 'Browsers close the current tab before the DAW can safely respond.',
    suggestion: { code: 'KeyW', shift: true },
  },
  {
    id: 'browser.newTab',
    combo: { code: 'KeyT', mod: true },
    severity: 'error',
    reason: 'Browsers open a new tab and steal focus from the project.',
    suggestion: { code: 'KeyT', shift: true },
  },
  {
    id: 'browser.newWindow',
    combo: { code: 'KeyN', mod: true },
    severity: 'error',
    reason: 'Browsers open a new window instead of keeping focus in the DAW.',
    suggestion: { code: 'KeyN', shift: true },
  },
  {
    id: 'browser.openFile',
    combo: { code: 'KeyO', mod: true },
    severity: 'error',
    reason: 'Browsers open the native file picker and interrupt the session.',
    suggestion: { code: 'KeyO', shift: true },
  },
  {
    id: 'browser.locationBar',
    combo: { code: 'KeyL', mod: true },
    severity: 'error',
    reason: 'Browsers focus the address bar, so the shortcut never reaches the DAW.',
    suggestion: { code: 'KeyL', shift: true },
  },
  {
    id: 'browser.reload',
    combo: { code: 'KeyR', mod: true },
    severity: 'error',
    reason: 'Browsers reload the page and can destroy unsaved context.',
    suggestion: { code: 'KeyR', shift: true },
  },
  {
    id: 'browser.hardReload',
    combo: { code: 'KeyR', mod: true, shift: true },
    severity: 'error',
    reason: 'Browsers hard-reload the page and can wipe transient state.',
    suggestion: { code: 'KeyR', alt: true, shift: true },
  },
  {
    id: 'browser.print',
    combo: { code: 'KeyP', mod: true },
    severity: 'error',
    reason: 'Browsers open the print dialog instead of dispatching the shortcut.',
    suggestion: { code: 'KeyP', shift: true },
  },
  {
    id: 'browser.preferences',
    combo: { code: 'Comma', mod: true },
    severity: 'warning',
    reason: 'Some browsers capture this for preferences, so the shortcut can be unreliable.',
    suggestion: { code: 'Comma', alt: true },
  },
];

export function findBrowserShortcutConflict(combo: KeyCombo): BrowserShortcutRule | null {
  return BROWSER_RESERVED_SHORTCUTS.find((rule) => comboEquals(rule.combo, combo)) ?? null;
}
