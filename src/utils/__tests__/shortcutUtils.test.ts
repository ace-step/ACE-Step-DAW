import { describe, it, expect } from 'vitest';
import {
  comboToId,
  getUnsafeBrowserComboReason,
  codeToLabel,
  comboToDisplay,
  keyEventToCombo,
  serializeShortcutBindings,
  parseShortcutBindings,
} from '../shortcutUtils';
import type { KeyCombo, ShortcutBindingExport } from '../../types/shortcuts';

// ---------- comboToId ----------

describe('comboToId', () => {
  it('returns just the code when no modifiers are set', () => {
    expect(comboToId({ code: 'Space' })).toBe('Space');
  });

  it('prepends mod when mod is true', () => {
    expect(comboToId({ code: 'KeyZ', mod: true })).toBe('mod+KeyZ');
  });

  it('prepends shift when shift is true', () => {
    expect(comboToId({ code: 'KeyA', shift: true })).toBe('shift+KeyA');
  });

  it('prepends alt when alt is true', () => {
    expect(comboToId({ code: 'KeyB', alt: true })).toBe('alt+KeyB');
  });

  it('orders modifiers as mod > shift > alt', () => {
    expect(
      comboToId({ code: 'KeyC', mod: true, shift: true, alt: true }),
    ).toBe('mod+shift+alt+KeyC');
  });

  it('combines mod and alt without shift', () => {
    expect(comboToId({ code: 'KeyD', mod: true, alt: true })).toBe(
      'mod+alt+KeyD',
    );
  });

  it('ignores falsy modifier values (undefined / false)', () => {
    expect(comboToId({ code: 'KeyE', mod: undefined, shift: false } as KeyCombo)).toBe('KeyE');
  });
});

// ---------- getUnsafeBrowserComboReason ----------

describe('getUnsafeBrowserComboReason', () => {
  it('returns reason string for mod+KeyW', () => {
    const reason = getUnsafeBrowserComboReason({ code: 'KeyW', mod: true });
    expect(reason).toBe('Reserved by the browser to close the current tab.');
  });

  it('returns reason string for mod+KeyT', () => {
    const reason = getUnsafeBrowserComboReason({ code: 'KeyT', mod: true });
    expect(reason).toBe('Reserved by the browser to open a new tab.');
  });

  it('returns reason string for mod+KeyL', () => {
    const reason = getUnsafeBrowserComboReason({ code: 'KeyL', mod: true });
    expect(reason).toBe('Reserved by the browser to focus the address bar.');
  });

  it('returns reason string for mod+KeyR', () => {
    const reason = getUnsafeBrowserComboReason({ code: 'KeyR', mod: true });
    expect(reason).toBe('Reserved by the browser to reload the page.');
  });

  it('returns reason string for mod+KeyP', () => {
    const reason = getUnsafeBrowserComboReason({ code: 'KeyP', mod: true });
    expect(reason).toBe('Reserved by the browser to print the page.');
  });

  it('returns null for safe combos', () => {
    expect(getUnsafeBrowserComboReason({ code: 'KeyA', mod: true })).toBe(null);
  });

  it('returns null for unmodified keys even if letter matches unsafe list', () => {
    expect(getUnsafeBrowserComboReason({ code: 'KeyW' })).toBe(null);
  });

  it('returns null for shift+unsafe key (only mod triggers unsafe)', () => {
    expect(
      getUnsafeBrowserComboReason({ code: 'KeyW', shift: true }),
    ).toBe(null);
  });
});

// ---------- codeToLabel ----------

describe('codeToLabel', () => {
  it('maps known codes to their labels', () => {
    expect(codeToLabel('Space')).toBe('Space');
    expect(codeToLabel('Enter')).toBe('Enter');
    expect(codeToLabel('Backspace')).toBe('Backspace');
    expect(codeToLabel('Delete')).toBe('Delete');
    expect(codeToLabel('ArrowLeft')).toBe('Left');
    expect(codeToLabel('ArrowRight')).toBe('Right');
    expect(codeToLabel('ArrowUp')).toBe('Up');
    expect(codeToLabel('ArrowDown')).toBe('Down');
    expect(codeToLabel('Escape')).toBe('Esc');
    expect(codeToLabel('Equal')).toBe('=');
    expect(codeToLabel('Minus')).toBe('-');
    expect(codeToLabel('Comma')).toBe(',');
    expect(codeToLabel('Period')).toBe('.');
    expect(codeToLabel('Slash')).toBe('/');
    expect(codeToLabel('Home')).toBe('Home');
    expect(codeToLabel('End')).toBe('End');
  });

  it('maps Digit codes to their number character', () => {
    for (let i = 0; i <= 9; i++) {
      expect(codeToLabel(`Digit${i}`)).toBe(`${i}`);
    }
  });

  it('strips "Key" prefix from letter codes', () => {
    expect(codeToLabel('KeyA')).toBe('A');
    expect(codeToLabel('KeyZ')).toBe('Z');
    expect(codeToLabel('KeyM')).toBe('M');
  });

  it('returns the code as-is for unknown codes without Key prefix', () => {
    expect(codeToLabel('F1')).toBe('F1');
    expect(codeToLabel('Tab')).toBe('Tab');
  });

  it('handles empty string', () => {
    expect(codeToLabel('')).toBe('');
  });
});

// ---------- comboToDisplay ----------

describe('comboToDisplay', () => {
  // In Node/test env, navigator.platform is not Mac, so isMac = false => Ctrl
  it('shows Ctrl for mod on non-Mac platforms', () => {
    const result = comboToDisplay({ code: 'KeyS', mod: true });
    expect(result).toBe('Ctrl + S');
  });

  it('shows Shift modifier', () => {
    const result = comboToDisplay({ code: 'KeyA', shift: true });
    expect(result).toBe('Shift + A');
  });

  it('shows Alt modifier', () => {
    const result = comboToDisplay({ code: 'KeyB', alt: true });
    expect(result).toBe('Alt + B');
  });

  it('shows all modifiers in order', () => {
    const result = comboToDisplay({
      code: 'KeyC',
      mod: true,
      shift: true,
      alt: true,
    });
    expect(result).toBe('Ctrl + Shift + Alt + C');
  });

  it('displays code labels for special keys', () => {
    expect(comboToDisplay({ code: 'Space' })).toBe('Space');
    expect(comboToDisplay({ code: 'ArrowUp', mod: true })).toBe('Ctrl + Up');
    expect(comboToDisplay({ code: 'Escape' })).toBe('Esc');
  });

  it('displays plain key with no modifiers', () => {
    expect(comboToDisplay({ code: 'KeyG' })).toBe('G');
  });
});

// ---------- keyEventToCombo ----------

describe('keyEventToCombo', () => {
  function makeKeyEvent(overrides: Partial<KeyboardEvent>): KeyboardEvent {
    return {
      key: 'a',
      code: 'KeyA',
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      ...overrides,
    } as KeyboardEvent;
  }

  it('returns null for bare modifier keys', () => {
    expect(keyEventToCombo(makeKeyEvent({ key: 'Meta' }))).toBe(null);
    expect(keyEventToCombo(makeKeyEvent({ key: 'Control' }))).toBe(null);
    expect(keyEventToCombo(makeKeyEvent({ key: 'Shift' }))).toBe(null);
    expect(keyEventToCombo(makeKeyEvent({ key: 'Alt' }))).toBe(null);
  });

  it('returns a combo for a regular key', () => {
    const combo = keyEventToCombo(makeKeyEvent({ key: 'a', code: 'KeyA' }));
    expect(combo).toEqual({ code: 'KeyA', mod: undefined, shift: undefined, alt: undefined });
  });

  it('sets mod when metaKey is pressed', () => {
    const combo = keyEventToCombo(
      makeKeyEvent({ key: 'z', code: 'KeyZ', metaKey: true }),
    );
    expect(combo).not.toBe(null);
    expect(combo!.mod).toBe(true);
  });

  it('sets mod when ctrlKey is pressed', () => {
    const combo = keyEventToCombo(
      makeKeyEvent({ key: 'z', code: 'KeyZ', ctrlKey: true }),
    );
    expect(combo!.mod).toBe(true);
  });

  it('sets shift when shiftKey is pressed', () => {
    const combo = keyEventToCombo(
      makeKeyEvent({ key: 'A', code: 'KeyA', shiftKey: true }),
    );
    expect(combo!.shift).toBe(true);
  });

  it('sets alt when altKey is pressed', () => {
    const combo = keyEventToCombo(
      makeKeyEvent({ key: 'a', code: 'KeyA', altKey: true }),
    );
    expect(combo!.alt).toBe(true);
  });

  it('sets all modifiers together', () => {
    const combo = keyEventToCombo(
      makeKeyEvent({
        key: 'g',
        code: 'KeyG',
        metaKey: true,
        shiftKey: true,
        altKey: true,
      }),
    );
    expect(combo).toEqual({
      code: 'KeyG',
      mod: true,
      shift: true,
      alt: true,
    });
  });

  it('handles Space key event', () => {
    const combo = keyEventToCombo(
      makeKeyEvent({ key: ' ', code: 'Space' }),
    );
    expect(combo).toEqual({ code: 'Space', mod: undefined, shift: undefined, alt: undefined });
  });
});

// ---------- serializeShortcutBindings ----------

describe('serializeShortcutBindings', () => {
  const sampleExport: ShortcutBindingExport = {
    version: 1,
    presetId: 'custom-1',
    overrides: {
      'transport.playPause': { code: 'Space' },
    },
    exportedAt: '2026-01-01T00:00:00.000Z',
  };

  it('returns valid JSON', () => {
    const serialized = serializeShortcutBindings(sampleExport);
    const parsed = JSON.parse(serialized);
    expect(parsed.version).toBe(1);
    expect(parsed.presetId).toBe('custom-1');
  });

  it('pretty-prints with 2-space indentation', () => {
    const serialized = serializeShortcutBindings(sampleExport);
    // Second line should start with 2 spaces (the indented "version" key)
    const lines = serialized.split('\n');
    expect(lines[1]).toMatch(/^ {2}"/);
  });

  it('round-trips through parseShortcutBindings', () => {
    const serialized = serializeShortcutBindings(sampleExport);
    const roundTripped = parseShortcutBindings(serialized);
    expect(roundTripped.version).toBe(1);
    expect(roundTripped.presetId).toBe('custom-1');
    expect(roundTripped.overrides).toEqual(sampleExport.overrides);
    expect(roundTripped.exportedAt).toBe('2026-01-01T00:00:00.000Z');
  });
});

// ---------- parseShortcutBindings ----------

describe('parseShortcutBindings', () => {
  it('parses valid input correctly', () => {
    const input = JSON.stringify({
      version: 1,
      presetId: 'my-preset',
      overrides: { 'transport.stop': { code: 'Enter' } },
      exportedAt: '2026-03-27T12:00:00.000Z',
    });
    const result = parseShortcutBindings(input);
    expect(result.version).toBe(1);
    expect(result.presetId).toBe('my-preset');
    expect(result.overrides['transport.stop']).toEqual({ code: 'Enter' });
    expect(result.exportedAt).toBe('2026-03-27T12:00:00.000Z');
  });

  it('throws on unsupported version', () => {
    const input = JSON.stringify({
      version: 2,
      presetId: 'x',
      overrides: {},
    });
    expect(() => parseShortcutBindings(input)).toThrow(
      'Unsupported shortcut preset version.',
    );
  });

  it('throws when version is missing', () => {
    const input = JSON.stringify({ presetId: 'x', overrides: {} });
    expect(() => parseShortcutBindings(input)).toThrow(
      'Unsupported shortcut preset version.',
    );
  });

  it('throws when presetId is missing', () => {
    const input = JSON.stringify({ version: 1, overrides: {} });
    expect(() => parseShortcutBindings(input)).toThrow(
      'Shortcut preset is missing a valid preset id.',
    );
  });

  it('throws when presetId is empty string', () => {
    const input = JSON.stringify({ version: 1, presetId: '', overrides: {} });
    expect(() => parseShortcutBindings(input)).toThrow(
      'Shortcut preset is missing a valid preset id.',
    );
  });

  it('throws when presetId is not a string', () => {
    const input = JSON.stringify({ version: 1, presetId: 42, overrides: {} });
    expect(() => parseShortcutBindings(input)).toThrow(
      'Shortcut preset is missing a valid preset id.',
    );
  });

  it('throws when overrides is missing', () => {
    const input = JSON.stringify({ version: 1, presetId: 'x' });
    expect(() => parseShortcutBindings(input)).toThrow(
      'Shortcut preset is missing overrides.',
    );
  });

  it('throws when overrides is not an object', () => {
    const input = JSON.stringify({
      version: 1,
      presetId: 'x',
      overrides: 'not-an-object',
    });
    expect(() => parseShortcutBindings(input)).toThrow(
      'Shortcut preset is missing overrides.',
    );
  });

  it('throws on invalid JSON', () => {
    expect(() => parseShortcutBindings('{')).toThrow();
  });

  it('throws on empty string', () => {
    expect(() => parseShortcutBindings('')).toThrow();
  });

  it('fills in exportedAt when missing from input', () => {
    const input = JSON.stringify({
      version: 1,
      presetId: 'x',
      overrides: {},
    });
    const result = parseShortcutBindings(input);
    // exportedAt should be a valid ISO date string
    expect(typeof result.exportedAt).toBe('string');
    expect(result.exportedAt.length).toBeGreaterThan(0);
    // Should be parseable as a date
    expect(Number.isNaN(Date.parse(result.exportedAt))).toBe(false);
  });

  it('fills in exportedAt when it is not a string', () => {
    const input = JSON.stringify({
      version: 1,
      presetId: 'x',
      overrides: {},
      exportedAt: 12345,
    });
    const result = parseShortcutBindings(input);
    expect(typeof result.exportedAt).toBe('string');
    expect(Number.isNaN(Date.parse(result.exportedAt))).toBe(false);
  });
});
