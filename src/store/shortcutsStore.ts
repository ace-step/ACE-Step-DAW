import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { KeyCombo, ShortcutBindingExport, ShortcutMap } from '../types/shortcuts';
import { SHORTCUT_ACTIONS, SHORTCUT_ACTION_MAP } from '../constants/shortcutDefaults';
import { SHORTCUT_PRESET_MAP } from '../constants/shortcutPresets';
import { getUnsafeBrowserComboReason, parseShortcutBindings, serializeShortcutBindings } from '../utils/shortcutUtils';

export interface ShortcutsState {
  /** User overrides keyed by actionId. Missing keys fall back to defaults. */
  overrides: ShortcutMap;
  /** The currently active preset id (for display purposes). */
  activePresetId: string;

  // ── Actions ──────────────────────────────────────────────────
  /** Resolve the effective combo for an action, falling back to the default. */
  getCombo: (actionId: string) => KeyCombo;
  /** Set a single shortcut override. */
  setBinding: (actionId: string, combo: KeyCombo) => void;
  /** Remove a single override (revert to default). */
  clearBinding: (actionId: string) => void;
  /** Apply a preset — replaces all overrides with the preset's map. */
  applyPreset: (presetId: string) => void;
  /** Reset all overrides to factory defaults. */
  resetAll: () => void;
  /** Check whether a combo is already used by another action. */
  findConflict: (combo: KeyCombo, excludeActionId?: string) => string | null;
  /** Check whether a combo should be blocked due to browser conflicts. */
  getUnsafeReason: (combo: KeyCombo) => string | null;
  /** Export current bindings as JSON text. */
  exportBindings: () => ShortcutBindingExport;
  /** Import bindings from JSON text or payload. */
  importBindings: (payload: string | ShortcutBindingExport) => void;
}

function comboEquals(a: KeyCombo, b: KeyCombo): boolean {
  return (
    a.code === b.code &&
    !!a.mod === !!b.mod &&
    !!a.shift === !!b.shift &&
    !!a.alt === !!b.alt
  );
}

export { comboEquals };

export const useShortcutsStore = create<ShortcutsState>()(
  persist(
    (set, get) => ({
      overrides: {},
      activePresetId: 'ace-step',

      getCombo: (actionId: string): KeyCombo => {
        const state = get();
        if (state.overrides[actionId]) return state.overrides[actionId];
        const action = SHORTCUT_ACTION_MAP[actionId];
        if (action) return action.defaultCombo;
        return { code: '' };
      },

      setBinding: (actionId, combo) =>
        set((s) => {
          const unsafeReason = getUnsafeBrowserComboReason(combo);
          if (unsafeReason) {
            throw new Error(unsafeReason);
          }
          return {
            overrides: { ...s.overrides, [actionId]: combo },
            activePresetId: 'custom',
          };
        }),

      clearBinding: (actionId) =>
        set((s) => {
          const next = { ...s.overrides };
          delete next[actionId];
          return { overrides: next };
        }),

      applyPreset: (presetId) => {
        const preset = SHORTCUT_PRESET_MAP[presetId];
        if (!preset) return;
        set({ overrides: { ...preset.map }, activePresetId: presetId });
      },

      resetAll: () => set({ overrides: {}, activePresetId: 'ace-step' }),

      findConflict: (combo, excludeActionId) => {
        const state = get();
        for (const action of SHORTCUT_ACTIONS) {
          if (action.id === excludeActionId) continue;
          const effective = state.overrides[action.id] ?? action.defaultCombo;
          if (comboEquals(combo, effective)) {
            return action.id;
          }
        }
        return null;
      },

      getUnsafeReason: (combo) => getUnsafeBrowserComboReason(combo),

      exportBindings: () => ({
        version: 1,
        presetId: get().activePresetId,
        overrides: { ...get().overrides },
        exportedAt: new Date().toISOString(),
      }),

      importBindings: (payload) => {
        const parsed = typeof payload === 'string' ? parseShortcutBindings(payload) : payload;

        for (const [actionId, combo] of Object.entries(parsed.overrides)) {
          if (!SHORTCUT_ACTION_MAP[actionId]) {
            throw new Error(`Unknown shortcut action: ${actionId}`);
          }
          const unsafeReason = getUnsafeBrowserComboReason(combo);
          if (unsafeReason) {
            throw new Error(`${actionId}: ${unsafeReason}`);
          }
        }

        set({
          overrides: { ...parsed.overrides },
          activePresetId: parsed.presetId || 'custom',
        });
      },
    }),
    {
      name: 'ace-step-daw-shortcuts',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        overrides: state.overrides,
        activePresetId: state.activePresetId,
      }),
    },
  ),
);

export function exportShortcutBindings(): string {
  return serializeShortcutBindings(useShortcutsStore.getState().exportBindings());
}
