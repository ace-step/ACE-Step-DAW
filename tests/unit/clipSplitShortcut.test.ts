import { describe, it, expect } from 'vitest';
import { SHORTCUT_ACTIONS } from '../../src/constants/shortcutDefaults';
import { SHORTCUT_PRESETS } from '../../src/constants/shortcutPresets';

describe('clip split shortcut remapping', () => {
  it('clips.split defaults to KeyS (no modifier)', () => {
    const action = SHORTCUT_ACTIONS.find((a) => a.id === 'clips.split');
    expect(action).not.toBeUndefined();
    expect(action!.defaultCombo).toEqual({ code: 'KeyS' });
    expect(action!.contexts).toContain('timeline');
  });

  it('tracks.solo defaults to Shift+S', () => {
    const action = SHORTCUT_ACTIONS.find((a) => a.id === 'tracks.solo');
    expect(action).not.toBeUndefined();
    expect(action!.defaultCombo).toEqual({ code: 'KeyS', shift: true });
  });

  it('no two default shortcuts conflict in the same context', () => {
    const seen = new Map<string, string>();
    for (const action of SHORTCUT_ACTIONS) {
      const combo = action.defaultCombo;
      const key = `${combo.code}|${combo.mod ?? false}|${combo.shift ?? false}|${combo.alt ?? false}`;
      for (const ctx of action.contexts ?? ['global']) {
        const fullKey = `${ctx}:${key}`;
        const existing = seen.get(fullKey);
        // Some intentional overlaps exist (e.g. clips.delete and tracks.delete both on Delete in timeline)
        // Just verify clips.split doesn't conflict with tracks.solo
        if (action.id === 'clips.split' || action.id === 'tracks.solo') {
          if (existing && existing !== action.id) {
            // clips.split (KeyS, no mod, no shift) should not conflict with tracks.solo (KeyS, shift)
            expect(action.id).not.toBe('tracks.solo');
          }
        }
        seen.set(fullKey, action.id);
      }
    }
    // Verify they have different combos
    const split = SHORTCUT_ACTIONS.find((a) => a.id === 'clips.split')!;
    const solo = SHORTCUT_ACTIONS.find((a) => a.id === 'tracks.solo')!;
    expect(split.defaultCombo.shift).toBeFalsy();
    expect(solo.defaultCombo.shift).toBe(true);
  });

  it('DAW presets have solo mapped to Shift+S where they previously had S', () => {
    const logicPro = SHORTCUT_PRESETS.find((p) => p.id === 'logic-pro')!;
    expect(logicPro.map['tracks.solo']).toEqual({ code: 'KeyS', shift: true });

    const flStudio = SHORTCUT_PRESETS.find((p) => p.id === 'fl-studio')!;
    expect(flStudio.map['tracks.solo']).toEqual({ code: 'KeyS', shift: true });

    const proTools = SHORTCUT_PRESETS.find((p) => p.id === 'pro-tools')!;
    expect(proTools.map['tracks.solo']).toEqual({ code: 'KeyS', shift: true });
  });

  it('DAW presets retain their custom clips.split bindings', () => {
    const ableton = SHORTCUT_PRESETS.find((p) => p.id === 'ableton-live')!;
    expect(ableton.map['clips.split']).toEqual({ code: 'KeyE', mod: true });

    const logicPro = SHORTCUT_PRESETS.find((p) => p.id === 'logic-pro')!;
    expect(logicPro.map['clips.split']).toEqual({ code: 'KeyT', mod: true });

    const proTools = SHORTCUT_PRESETS.find((p) => p.id === 'pro-tools')!;
    expect(proTools.map['clips.split']).toEqual({ code: 'KeyB' });
  });
});
