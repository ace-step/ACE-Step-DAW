import { describe, it, expect, beforeEach } from 'vitest';
import { useShortcutsStore, comboEquals } from '../shortcutsStore';
import type { KeyCombo } from '../../types/shortcuts';
import { SHORTCUT_ACTIONS } from '../../constants/shortcutDefaults';

describe('shortcutsStore', () => {
  beforeEach(() => {
    useShortcutsStore.getState().resetAll();
  });

  describe('initial state', () => {
    it('starts with empty overrides', () => {
      expect(useShortcutsStore.getState().overrides).toEqual({});
    });

    it('starts with ace-step preset', () => {
      expect(useShortcutsStore.getState().activePresetId).toBe('ace-step');
    });
  });

  describe('getCombo', () => {
    it('returns the default combo when no override exists', () => {
      const combo = useShortcutsStore.getState().getCombo('transport.playPause');
      expect(combo.code).toBe('Space');
    });

    it('returns the override combo when one exists', () => {
      const custom: KeyCombo = { code: 'KeyQ' };
      useShortcutsStore.getState().setBinding('transport.playPause', custom);
      const combo = useShortcutsStore.getState().getCombo('transport.playPause');
      expect(combo.code).toBe('KeyQ');
    });

    it('returns an empty code for unknown action ids', () => {
      const combo = useShortcutsStore.getState().getCombo('unknown.action');
      expect(combo.code).toBe('');
    });
  });

  describe('setBinding', () => {
    it('sets an override and switches preset to custom', () => {
      useShortcutsStore.getState().setBinding('transport.stop', { code: 'Escape' });
      const state = useShortcutsStore.getState();
      expect(state.overrides['transport.stop']).toEqual({ code: 'Escape' });
      expect(state.activePresetId).toBe('custom');
    });

    it('throws when binding a browser-reserved combo', () => {
      expect(() => {
        useShortcutsStore.getState().setBinding('transport.playPause', { code: 'KeyW', mod: true });
      }).toThrow(/browser/i);
    });
  });

  describe('clearBinding', () => {
    it('removes an override (reverts to default)', () => {
      useShortcutsStore.getState().setBinding('transport.stop', { code: 'Escape' });
      useShortcutsStore.getState().clearBinding('transport.stop');
      expect(useShortcutsStore.getState().overrides['transport.stop']).toBeUndefined();
      // Should now return default
      expect(useShortcutsStore.getState().getCombo('transport.stop').code).toBe('Enter');
    });

    it('is a no-op for actions without overrides', () => {
      useShortcutsStore.getState().clearBinding('transport.stop');
      expect(useShortcutsStore.getState().overrides['transport.stop']).toBeUndefined();
    });
  });

  describe('applyPreset', () => {
    it('applies the ableton-live preset', () => {
      useShortcutsStore.getState().applyPreset('ableton-live');
      const state = useShortcutsStore.getState();
      expect(state.activePresetId).toBe('ableton-live');
      // Ableton maps Cmd+E for split
      const splitCombo = state.getCombo('clips.split');
      expect(splitCombo.code).toBe('KeyE');
      expect(splitCombo.mod).toBe(true);
    });

    it('is a no-op for unknown preset ids', () => {
      useShortcutsStore.getState().setBinding('transport.stop', { code: 'Escape' });
      useShortcutsStore.getState().applyPreset('nonexistent');
      // Should remain unchanged
      expect(useShortcutsStore.getState().overrides['transport.stop']).toEqual({ code: 'Escape' });
    });
  });

  describe('resetAll', () => {
    it('clears all overrides and restores default preset', () => {
      useShortcutsStore.getState().setBinding('transport.stop', { code: 'Escape' });
      useShortcutsStore.getState().resetAll();
      const state = useShortcutsStore.getState();
      expect(state.overrides).toEqual({});
      expect(state.activePresetId).toBe('ace-step');
    });
  });

  describe('findConflict', () => {
    it('returns null when no conflict exists', () => {
      const result = useShortcutsStore.getState().findConflict({ code: 'F12' });
      expect(result).toBeNull();
    });

    it('detects a conflict with an existing default binding', () => {
      // Space is the default for transport.playPause
      const result = useShortcutsStore.getState().findConflict({ code: 'Space' });
      expect(result).toBe('transport.playPause');
    });

    it('excludes the specified action from conflict detection', () => {
      const result = useShortcutsStore.getState().findConflict(
        { code: 'Space' },
        'transport.playPause',
      );
      expect(result).toBeNull();
    });

    it('detects a conflict with an override', () => {
      useShortcutsStore.getState().setBinding('clips.delete', { code: 'F12' });
      const result = useShortcutsStore.getState().findConflict({ code: 'F12' });
      expect(result).toBe('clips.delete');
    });
  });

  describe('getUnsafeReason', () => {
    it('returns a reason for browser-reserved combos', () => {
      const reason = useShortcutsStore.getState().getUnsafeReason({ code: 'KeyW', mod: true });
      expect(reason).toContain('browser');
    });

    it('returns null for safe combos', () => {
      const reason = useShortcutsStore.getState().getUnsafeReason({ code: 'F5' });
      expect(reason).toBeNull();
    });
  });

  describe('exportBindings / importBindings', () => {
    it('exports current bindings as a structured payload', () => {
      useShortcutsStore.getState().setBinding('transport.stop', { code: 'Escape' });
      const exported = useShortcutsStore.getState().exportBindings();
      expect(exported.version).toBe(1);
      expect(exported.presetId).toBe('custom');
      expect(exported.overrides['transport.stop']).toEqual({ code: 'Escape' });
      expect(exported.exportedAt).toBeTruthy();
    });

    it('imports bindings from a payload object', () => {
      const payload = {
        version: 1 as const,
        presetId: 'imported',
        overrides: { 'transport.playPause': { code: 'KeyP' } },
        exportedAt: '2026-01-01T00:00:00Z',
      };
      useShortcutsStore.getState().importBindings(payload);
      const state = useShortcutsStore.getState();
      expect(state.activePresetId).toBe('imported');
      expect(state.getCombo('transport.playPause').code).toBe('KeyP');
    });

    it('imports bindings from a JSON string', () => {
      const payload = JSON.stringify({
        version: 1,
        presetId: 'from-json',
        overrides: { 'transport.stop': { code: 'Escape' } },
        exportedAt: '2026-01-01T00:00:00Z',
      });
      useShortcutsStore.getState().importBindings(payload);
      expect(useShortcutsStore.getState().getCombo('transport.stop').code).toBe('Escape');
    });

    it('throws when importing with unknown action id', () => {
      const payload = {
        version: 1 as const,
        presetId: 'test',
        overrides: { 'totally.fake.action': { code: 'KeyA' } },
        exportedAt: '2026-01-01T00:00:00Z',
      };
      expect(() => {
        useShortcutsStore.getState().importBindings(payload);
      }).toThrow(/Unknown shortcut action/);
    });

    it('throws when importing a browser-reserved combo', () => {
      const payload = {
        version: 1 as const,
        presetId: 'test',
        overrides: { 'transport.playPause': { code: 'KeyW', mod: true } },
        exportedAt: '2026-01-01T00:00:00Z',
      };
      expect(() => {
        useShortcutsStore.getState().importBindings(payload);
      }).toThrow(/browser/i);
    });
  });

  describe('comboEquals', () => {
    it('matches identical combos', () => {
      expect(comboEquals({ code: 'KeyA', mod: true }, { code: 'KeyA', mod: true })).toBe(true);
    });

    it('treats undefined and false modifiers as equal', () => {
      expect(comboEquals({ code: 'KeyA' }, { code: 'KeyA', mod: false, shift: false, alt: false })).toBe(true);
    });

    it('detects different codes', () => {
      expect(comboEquals({ code: 'KeyA' }, { code: 'KeyB' })).toBe(false);
    });

    it('detects different modifiers', () => {
      expect(comboEquals({ code: 'KeyA', shift: true }, { code: 'KeyA' })).toBe(false);
    });
  });
});
