import { beforeEach, describe, expect, it } from 'vitest';
import { useShortcutsStore, comboEquals } from '../../src/store/shortcutsStore';
import { SHORTCUT_ACTIONS, SHORTCUT_ACTION_MAP } from '../../src/constants/shortcutDefaults';
import { SHORTCUT_PRESETS, SHORTCUT_PRESET_MAP } from '../../src/constants/shortcutPresets';
import type { KeyCombo, ShortcutBindingExport } from '../../src/types/shortcuts';

beforeEach(() => {
  useShortcutsStore.setState({ overrides: {}, activePresetId: 'ace-step' });
});

// ── comboEquals ──────────────────────────────────────────────────

describe('comboEquals', () => {
  it('matches identical combos', () => {
    const a: KeyCombo = { code: 'KeyG', mod: true, shift: true };
    const b: KeyCombo = { code: 'KeyG', mod: true, shift: true };
    expect(comboEquals(a, b)).toBe(true);
  });

  it('treats undefined and false the same for modifier flags', () => {
    const a: KeyCombo = { code: 'Space' };
    const b: KeyCombo = { code: 'Space', mod: false, shift: false, alt: false };
    expect(comboEquals(a, b)).toBe(true);
  });

  it('returns false when codes differ', () => {
    expect(comboEquals({ code: 'KeyA' }, { code: 'KeyB' })).toBe(false);
  });

  it('returns false when modifiers differ', () => {
    expect(comboEquals({ code: 'KeyA', mod: true }, { code: 'KeyA' })).toBe(false);
  });
});

// ── getCombo ─────────────────────────────────────────────────────

describe('getCombo', () => {
  it('returns the default combo when no override is set', () => {
    const combo = useShortcutsStore.getState().getCombo('transport.playPause');
    const action = SHORTCUT_ACTION_MAP['transport.playPause'];
    expect(combo).toEqual(action.defaultCombo);
  });

  it('returns the override when one is set', () => {
    const custom: KeyCombo = { code: 'F5' };
    useShortcutsStore.getState().setBinding('transport.playPause', custom);
    expect(useShortcutsStore.getState().getCombo('transport.playPause')).toEqual(custom);
  });

  it('returns empty combo for unknown action ids', () => {
    expect(useShortcutsStore.getState().getCombo('nonexistent.action')).toEqual({ code: '' });
  });
});

// ── setBinding / clearBinding ────────────────────────────────────

describe('setBinding / clearBinding', () => {
  it('adds an override and sets activePresetId to custom', () => {
    const custom: KeyCombo = { code: 'F5' };
    useShortcutsStore.getState().setBinding('transport.record', custom);

    const state = useShortcutsStore.getState();
    expect(state.overrides['transport.record']).toEqual(custom);
    expect(state.activePresetId).toBe('custom');
  });

  it('clearBinding removes the override', () => {
    useShortcutsStore.getState().setBinding('transport.record', { code: 'F5' });
    useShortcutsStore.getState().clearBinding('transport.record');
    expect(useShortcutsStore.getState().overrides['transport.record']).toBeUndefined();
  });

  it('rejects unsafe browser-reserved shortcuts', () => {
    expect(() => useShortcutsStore.getState().setBinding('project.export', { code: 'KeyW', mod: true }))
      .toThrow(/close the current tab/i);
  });
});

// ── applyPreset ──────────────────────────────────────────────────

describe('applyPreset', () => {
  it('applies a named preset and updates activePresetId', () => {
    useShortcutsStore.getState().applyPreset('ableton-live');

    const state = useShortcutsStore.getState();
    expect(state.activePresetId).toBe('ableton-live');
    // Ableton sets clips.split to Cmd+E
    const splitCombo = state.overrides['clips.split'];
    expect(splitCombo).not.toBeUndefined();
    expect(splitCombo.code).toBe('KeyE');
    expect(splitCombo.mod).toBe(true);
  });

  it('does nothing for an unknown preset id', () => {
    useShortcutsStore.getState().applyPreset('nonexistent');
    expect(useShortcutsStore.getState().activePresetId).toBe('ace-step');
  });
});

// ── resetAll ─────────────────────────────────────────────────────

describe('resetAll', () => {
  it('clears all overrides and resets preset to ace-step', () => {
    useShortcutsStore.getState().setBinding('transport.record', { code: 'F5' });
    useShortcutsStore.getState().resetAll();

    const state = useShortcutsStore.getState();
    expect(Object.keys(state.overrides)).toHaveLength(0);
    expect(state.activePresetId).toBe('ace-step');
  });
});

describe('exportBindings / importBindings', () => {
  it('exports the current preset metadata and overrides', () => {
    useShortcutsStore.getState().setBinding('transport.record', { code: 'F5' });
    const exported = useShortcutsStore.getState().exportBindings();

    expect(exported.version).toBe(1);
    expect(exported.presetId).toBe('custom');
    expect(exported.overrides['transport.record']).toEqual({ code: 'F5' });
  });

  it('imports overrides from a payload object', () => {
    const payload: ShortcutBindingExport = {
      version: 1,
      presetId: 'custom',
      exportedAt: new Date().toISOString(),
      overrides: {
        'tracks.mute': { code: 'F6' },
      },
    };

    useShortcutsStore.getState().importBindings(payload);

    expect(useShortcutsStore.getState().getCombo('tracks.mute')).toEqual({ code: 'F6' });
  });

  it('rejects imported unsafe browser-reserved combos', () => {
    const payload: ShortcutBindingExport = {
      version: 1,
      presetId: 'custom',
      exportedAt: new Date().toISOString(),
      overrides: {
        'tracks.mute': { code: 'KeyT', mod: true },
      },
    };

    expect(() => useShortcutsStore.getState().importBindings(payload)).toThrow(/new tab/i);
  });
});

// ── findConflict ─────────────────────────────────────────────────

describe('findConflict', () => {
  it('returns null when no conflict exists', () => {
    const combo: KeyCombo = { code: 'F20' }; // not used by anything
    expect(useShortcutsStore.getState().findConflict(combo)).toBeNull();
  });

  it('detects conflict with a default binding', () => {
    // Space is bound to transport.playPause by default
    const conflict = useShortcutsStore.getState().findConflict({ code: 'Space' }, 'some.other.action');
    expect(conflict).toBe('transport.playPause');
  });

  it('excludes the specified action from conflict detection', () => {
    const conflict = useShortcutsStore.getState().findConflict({ code: 'Space' }, 'transport.playPause');
    expect(conflict).toBeNull();
  });

  it('detects conflict with an overridden binding', () => {
    useShortcutsStore.getState().setBinding('transport.record', { code: 'F5' });
    const conflict = useShortcutsStore.getState().findConflict({ code: 'F5' }, 'some.action');
    expect(conflict).toBe('transport.record');
  });
});

// ── SHORTCUT_ACTIONS ─────────────────────────────────────────────

describe('SHORTCUT_ACTIONS', () => {
  it('contains at least 30 actions', () => {
    expect(SHORTCUT_ACTIONS.length).toBeGreaterThanOrEqual(30);
  });

  it('every action has a unique id', () => {
    const ids = SHORTCUT_ACTIONS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every action has a non-empty label and code', () => {
    for (const action of SHORTCUT_ACTIONS) {
      expect(action.label.length).toBeGreaterThan(0);
      expect(action.defaultCombo.code.length).toBeGreaterThan(0);
    }
  });
});

// ── SHORTCUT_PRESETS ─────────────────────────────────────────────

describe('SHORTCUT_PRESETS', () => {
  it('includes ace-step, ableton-live, logic-pro, fl-studio, pro-tools', () => {
    const ids = SHORTCUT_PRESETS.map((p) => p.id);
    expect(ids).toContain('ace-step');
    expect(ids).toContain('ableton-live');
    expect(ids).toContain('logic-pro');
    expect(ids).toContain('fl-studio');
    expect(ids).toContain('pro-tools');
  });

  it('ace-step preset has an empty map (all defaults)', () => {
    expect(Object.keys(SHORTCUT_PRESET_MAP['ace-step'].map)).toHaveLength(0);
  });

  it('each preset only references valid action ids', () => {
    for (const preset of SHORTCUT_PRESETS) {
      for (const actionId of Object.keys(preset.map)) {
        expect(SHORTCUT_ACTION_MAP[actionId]).not.toBeUndefined();
      }
    }
  });

  it('each preset entry has a non-empty code for every binding', () => {
    for (const preset of SHORTCUT_PRESETS) {
      for (const [, combo] of Object.entries(preset.map)) {
        expect(combo.code.length).toBeGreaterThan(0);
      }
    }
  });
});
