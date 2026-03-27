/**
 * Tests for useKeyboardShortcuts utility functions:
 * - eventMatchesCombo: matches KeyboardEvent against a KeyCombo
 * - isInputFocused: detects when an editable element has focus
 * - shouldDeferToPianoRollTools: defers certain keys when piano roll is active
 * - shouldDeferToDrumMachine: (already tested in drumMachineKeyboardScope.test.ts)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  eventMatchesCombo,
  isInputFocused,
  shouldDeferToPianoRollTools,
} from '../useKeyboardShortcuts';
import { useUIStore } from '../../store/uiStore';
import type { KeyCombo } from '../../types/shortcuts';

/** Helper to build a minimal KeyboardEvent-like object. */
function makeKeyEvent(
  code: string,
  opts: {
    metaKey?: boolean;
    ctrlKey?: boolean;
    altKey?: boolean;
    shiftKey?: boolean;
    target?: EventTarget | null;
  } = {},
): KeyboardEvent {
  return {
    code,
    key: '',
    metaKey: opts.metaKey ?? false,
    ctrlKey: opts.ctrlKey ?? false,
    altKey: opts.altKey ?? false,
    shiftKey: opts.shiftKey ?? false,
    target: opts.target ?? document.body,
    preventDefault: () => {},
  } as unknown as KeyboardEvent;
}

// ---------------------------------------------------------------------------
// eventMatchesCombo
// ---------------------------------------------------------------------------
describe('eventMatchesCombo', () => {
  it('matches a plain key with no modifiers', () => {
    const combo: KeyCombo = { code: 'Space' };
    const event = makeKeyEvent('Space');
    expect(eventMatchesCombo(event, combo)).toBe(true);
  });

  it('rejects when code differs', () => {
    const combo: KeyCombo = { code: 'Space' };
    const event = makeKeyEvent('Enter');
    expect(eventMatchesCombo(event, combo)).toBe(false);
  });

  it('matches combo with mod flag using metaKey', () => {
    const combo: KeyCombo = { code: 'KeyZ', mod: true };
    const event = makeKeyEvent('KeyZ', { metaKey: true });
    expect(eventMatchesCombo(event, combo)).toBe(true);
  });

  it('matches combo with mod flag using ctrlKey', () => {
    const combo: KeyCombo = { code: 'KeyZ', mod: true };
    const event = makeKeyEvent('KeyZ', { ctrlKey: true });
    expect(eventMatchesCombo(event, combo)).toBe(true);
  });

  it('rejects when mod is expected but not pressed', () => {
    const combo: KeyCombo = { code: 'KeyZ', mod: true };
    const event = makeKeyEvent('KeyZ');
    expect(eventMatchesCombo(event, combo)).toBe(false);
  });

  it('rejects when mod is pressed but not expected', () => {
    const combo: KeyCombo = { code: 'KeyZ' };
    const event = makeKeyEvent('KeyZ', { metaKey: true });
    expect(eventMatchesCombo(event, combo)).toBe(false);
  });

  it('matches combo with shift flag', () => {
    const combo: KeyCombo = { code: 'KeyG', shift: true };
    const event = makeKeyEvent('KeyG', { shiftKey: true });
    expect(eventMatchesCombo(event, combo)).toBe(true);
  });

  it('rejects when shift is expected but not pressed', () => {
    const combo: KeyCombo = { code: 'KeyG', shift: true };
    const event = makeKeyEvent('KeyG');
    expect(eventMatchesCombo(event, combo)).toBe(false);
  });

  it('rejects when shift is pressed but not expected', () => {
    const combo: KeyCombo = { code: 'KeyG' };
    const event = makeKeyEvent('KeyG', { shiftKey: true });
    expect(eventMatchesCombo(event, combo)).toBe(false);
  });

  it('matches combo with alt flag', () => {
    const combo: KeyCombo = { code: 'KeyA', alt: true };
    const event = makeKeyEvent('KeyA', { altKey: true });
    expect(eventMatchesCombo(event, combo)).toBe(true);
  });

  it('rejects when alt is expected but not pressed', () => {
    const combo: KeyCombo = { code: 'KeyA', alt: true };
    const event = makeKeyEvent('KeyA');
    expect(eventMatchesCombo(event, combo)).toBe(false);
  });

  it('rejects when alt is pressed but not expected', () => {
    const combo: KeyCombo = { code: 'KeyA' };
    const event = makeKeyEvent('KeyA', { altKey: true });
    expect(eventMatchesCombo(event, combo)).toBe(false);
  });

  it('matches combo with all three modifiers', () => {
    const combo: KeyCombo = { code: 'KeyS', mod: true, shift: true, alt: true };
    const event = makeKeyEvent('KeyS', { metaKey: true, shiftKey: true, altKey: true });
    expect(eventMatchesCombo(event, combo)).toBe(true);
  });

  it('rejects when one modifier is missing from a three-modifier combo', () => {
    const combo: KeyCombo = { code: 'KeyS', mod: true, shift: true, alt: true };
    // Missing alt
    const event = makeKeyEvent('KeyS', { metaKey: true, shiftKey: true });
    expect(eventMatchesCombo(event, combo)).toBe(false);
  });

  it('treats undefined modifier flags as false', () => {
    // combo with no mod/shift/alt properties at all
    const combo: KeyCombo = { code: 'KeyP' };
    const event = makeKeyEvent('KeyP');
    expect(eventMatchesCombo(event, combo)).toBe(true);
  });

  it('treats explicit false modifier flags same as undefined', () => {
    const combo: KeyCombo = { code: 'KeyP', mod: false, shift: false, alt: false };
    const event = makeKeyEvent('KeyP');
    expect(eventMatchesCombo(event, combo)).toBe(true);
  });

  it('matches mod via ctrlKey even when metaKey is false', () => {
    const combo: KeyCombo = { code: 'KeyC', mod: true };
    const event = makeKeyEvent('KeyC', { ctrlKey: true, metaKey: false });
    expect(eventMatchesCombo(event, combo)).toBe(true);
  });

  it('matches mod when both metaKey and ctrlKey are true', () => {
    const combo: KeyCombo = { code: 'KeyV', mod: true };
    const event = makeKeyEvent('KeyV', { metaKey: true, ctrlKey: true });
    expect(eventMatchesCombo(event, combo)).toBe(true);
  });

  it('handles digit key codes', () => {
    const combo: KeyCombo = { code: 'Digit0' };
    expect(eventMatchesCombo(makeKeyEvent('Digit0'), combo)).toBe(true);
    expect(eventMatchesCombo(makeKeyEvent('Digit1'), combo)).toBe(false);
  });

  it('is case-sensitive on code', () => {
    const combo: KeyCombo = { code: 'KeyA' };
    // Event with lowercase — should not match
    expect(eventMatchesCombo(makeKeyEvent('keya'), combo)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isInputFocused
// ---------------------------------------------------------------------------
describe('isInputFocused', () => {
  it('returns true when event target is an input element', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    const event = makeKeyEvent('KeyA', { target: input });
    expect(isInputFocused(event)).toBe(true);
    document.body.removeChild(input);
  });

  it('returns true when event target is a textarea', () => {
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    const event = makeKeyEvent('KeyA', { target: textarea });
    expect(isInputFocused(event)).toBe(true);
    document.body.removeChild(textarea);
  });

  it('returns true when event target is a select element', () => {
    const select = document.createElement('select');
    document.body.appendChild(select);
    const event = makeKeyEvent('KeyA', { target: select });
    expect(isInputFocused(event)).toBe(true);
    document.body.removeChild(select);
  });

  it('returns true when event target is contenteditable', () => {
    const div = document.createElement('div');
    div.setAttribute('contenteditable', 'true');
    document.body.appendChild(div);
    const event = makeKeyEvent('KeyA', { target: div });
    // isEditableShortcutTarget checks isContentEditable and closest('[contenteditable="true"]')
    // In jsdom, isContentEditable may not be reliable, but closest works with setAttribute
    expect(isInputFocused(event)).toBe(true);
    document.body.removeChild(div);
  });

  it('returns true when event target has role="slider"', () => {
    const div = document.createElement('div');
    div.setAttribute('role', 'slider');
    document.body.appendChild(div);
    const event = makeKeyEvent('KeyA', { target: div });
    expect(isInputFocused(event)).toBe(true);
    document.body.removeChild(div);
  });

  it('returns true when event target is inside a contenteditable parent', () => {
    const parent = document.createElement('div');
    parent.setAttribute('contenteditable', 'true');
    const child = document.createElement('span');
    parent.appendChild(child);
    document.body.appendChild(parent);
    const event = makeKeyEvent('KeyA', { target: child });
    expect(isInputFocused(event)).toBe(true);
    document.body.removeChild(parent);
  });

  it('returns true when event target is inside a role="textbox" parent', () => {
    const parent = document.createElement('div');
    parent.setAttribute('role', 'textbox');
    const child = document.createElement('span');
    parent.appendChild(child);
    document.body.appendChild(parent);
    const event = makeKeyEvent('KeyA', { target: child });
    expect(isInputFocused(event)).toBe(true);
    document.body.removeChild(parent);
  });

  it('returns false when event target is a plain div', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    const event = makeKeyEvent('KeyA', { target: div });
    expect(isInputFocused(event)).toBe(false);
    document.body.removeChild(div);
  });

  it('returns false when event target is document.body', () => {
    const event = makeKeyEvent('KeyA', { target: document.body });
    expect(isInputFocused(event)).toBe(false);
  });

  it('also checks document.activeElement', () => {
    // If the target is body but activeElement is an input, returns true
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    const event = makeKeyEvent('KeyA', { target: document.body });
    // activeElement is the input, so isInputFocused should return true
    expect(isInputFocused(event)).toBe(true);
    input.blur();
    document.body.removeChild(input);
  });
});

// ---------------------------------------------------------------------------
// shouldDeferToPianoRollTools
// ---------------------------------------------------------------------------
describe('shouldDeferToPianoRollTools', () => {
  beforeEach(() => {
    useUIStore.getState().setKeyboardContext('timeline', null);
  });

  it('returns true for tool keys when scope is pianoRoll', () => {
    useUIStore.getState().setKeyboardContext('pianoRoll', 'track-1');
    const toolKeys = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'KeyV', 'KeyB', 'KeyX'];
    for (const code of toolKeys) {
      expect(shouldDeferToPianoRollTools(makeKeyEvent(code))).toBe(true);
    }
  });

  it('returns false when scope is not pianoRoll', () => {
    useUIStore.getState().setKeyboardContext('timeline', null);
    expect(shouldDeferToPianoRollTools(makeKeyEvent('Digit1'))).toBe(false);
    expect(shouldDeferToPianoRollTools(makeKeyEvent('KeyV'))).toBe(false);
  });

  it('returns false when scope is mixer', () => {
    useUIStore.getState().setKeyboardContext('mixer', 'track-1');
    expect(shouldDeferToPianoRollTools(makeKeyEvent('Digit1'))).toBe(false);
  });

  it('returns false when scope is drumMachine', () => {
    useUIStore.getState().setKeyboardContext('drumMachine', 'track-1');
    expect(shouldDeferToPianoRollTools(makeKeyEvent('KeyV'))).toBe(false);
  });

  it('returns false when modifier keys are pressed in pianoRoll scope', () => {
    useUIStore.getState().setKeyboardContext('pianoRoll', 'track-1');
    expect(shouldDeferToPianoRollTools(makeKeyEvent('Digit1', { metaKey: true }))).toBe(false);
    expect(shouldDeferToPianoRollTools(makeKeyEvent('Digit1', { ctrlKey: true }))).toBe(false);
    expect(shouldDeferToPianoRollTools(makeKeyEvent('Digit1', { altKey: true }))).toBe(false);
  });

  it('returns false for non-tool keys in pianoRoll scope', () => {
    useUIStore.getState().setKeyboardContext('pianoRoll', 'track-1');
    expect(shouldDeferToPianoRollTools(makeKeyEvent('Space'))).toBe(false);
    expect(shouldDeferToPianoRollTools(makeKeyEvent('KeyG'))).toBe(false);
    expect(shouldDeferToPianoRollTools(makeKeyEvent('Escape'))).toBe(false);
    expect(shouldDeferToPianoRollTools(makeKeyEvent('ArrowLeft'))).toBe(false);
    expect(shouldDeferToPianoRollTools(makeKeyEvent('Digit6'))).toBe(false);
    expect(shouldDeferToPianoRollTools(makeKeyEvent('Digit9'))).toBe(false);
  });

  it('returns false for shiftKey even in pianoRoll scope (no shiftKey check in function)', () => {
    // The function only checks metaKey, ctrlKey, altKey — not shiftKey
    useUIStore.getState().setKeyboardContext('pianoRoll', 'track-1');
    // shiftKey alone should still defer (function does not gate on shiftKey)
    expect(shouldDeferToPianoRollTools(makeKeyEvent('Digit1', { shiftKey: true }))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// eventMatchesCombo — edge cases & modifier combinations
// ---------------------------------------------------------------------------
describe('eventMatchesCombo edge cases', () => {
  it('mod+shift combo rejects when only mod is pressed', () => {
    const combo: KeyCombo = { code: 'KeyG', mod: true, shift: true };
    const event = makeKeyEvent('KeyG', { metaKey: true });
    expect(eventMatchesCombo(event, combo)).toBe(false);
  });

  it('mod+shift combo rejects when only shift is pressed', () => {
    const combo: KeyCombo = { code: 'KeyG', mod: true, shift: true };
    const event = makeKeyEvent('KeyG', { shiftKey: true });
    expect(eventMatchesCombo(event, combo)).toBe(false);
  });

  it('mod+alt combo matches correctly', () => {
    const combo: KeyCombo = { code: 'KeyZ', mod: true, alt: true };
    const event = makeKeyEvent('KeyZ', { metaKey: true, altKey: true });
    expect(eventMatchesCombo(event, combo)).toBe(true);
  });

  it('mod+alt combo rejects when shift is also pressed', () => {
    const combo: KeyCombo = { code: 'KeyZ', mod: true, alt: true };
    const event = makeKeyEvent('KeyZ', { metaKey: true, altKey: true, shiftKey: true });
    expect(eventMatchesCombo(event, combo)).toBe(false);
  });

  it('shift+alt combo without mod matches correctly', () => {
    const combo: KeyCombo = { code: 'KeyA', shift: true, alt: true };
    const event = makeKeyEvent('KeyA', { shiftKey: true, altKey: true });
    expect(eventMatchesCombo(event, combo)).toBe(true);
  });

  it('shift+alt combo rejects when mod is also pressed', () => {
    const combo: KeyCombo = { code: 'KeyA', shift: true, alt: true };
    const event = makeKeyEvent('KeyA', { shiftKey: true, altKey: true, metaKey: true });
    expect(eventMatchesCombo(event, combo)).toBe(false);
  });

  it('handles Escape key with no modifiers', () => {
    const combo: KeyCombo = { code: 'Escape' };
    expect(eventMatchesCombo(makeKeyEvent('Escape'), combo)).toBe(true);
  });

  it('handles function keys', () => {
    const combo: KeyCombo = { code: 'F5', mod: true };
    expect(eventMatchesCombo(makeKeyEvent('F5', { ctrlKey: true }), combo)).toBe(true);
    expect(eventMatchesCombo(makeKeyEvent('F5'), combo)).toBe(false);
  });
});
