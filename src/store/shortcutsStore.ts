import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  BrowserShortcutRule,
  KeyCombo,
  ShortcutImportExportPayload,
  ShortcutImportResult,
  ShortcutMap,
} from '../types/shortcuts';
import { SHORTCUT_ACTIONS, SHORTCUT_ACTION_MAP } from '../constants/shortcutDefaults';
import { SHORTCUT_PRESET_MAP } from '../constants/shortcutPresets';
import { comboEquals, findBrowserShortcutConflict, normalizeCombo } from '../constants/shortcutConflicts';

interface ShortcutsState {
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
  /** Check whether a combo clashes with a browser-reserved binding. */
  findBrowserConflict: (combo: KeyCombo) => BrowserShortcutRule | null;
  /** Export the current shortcuts as a portable JSON payload. */
  exportBindings: () => ShortcutImportExportPayload;
  /** Import shortcut bindings from a portable JSON payload. */
  importBindings: (payload: unknown) => ShortcutImportResult;
}

export { comboEquals };

function buildEffectiveBindings(overrides: ShortcutMap): ShortcutMap {
  return Object.fromEntries(
    SHORTCUT_ACTIONS.map((action) => [
      action.id,
      normalizeCombo(overrides[action.id] ?? action.defaultCombo),
    ]),
  );
}

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
        set((s) => ({
          overrides: { ...s.overrides, [actionId]: normalizeCombo(combo) },
          activePresetId: 'custom',
        })),

      clearBinding: (actionId) =>
        set((s) => {
          const next = { ...s.overrides };
          delete next[actionId];
          return { overrides: next };
        }),

      applyPreset: (presetId) => {
        const preset = SHORTCUT_PRESET_MAP[presetId];
        if (!preset) return;
        const safeOverrides = Object.fromEntries(
          Object.entries(preset.map).filter(([, combo]) => {
            const browserConflict = findBrowserShortcutConflict(combo);
            return browserConflict?.severity !== 'error';
          }),
        );
        set({ overrides: safeOverrides, activePresetId: presetId });
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

      findBrowserConflict: (combo) => findBrowserShortcutConflict(combo),

      exportBindings: () => {
        const state = get();
        return {
          version: 1,
          presetId: state.activePresetId,
          exportedAt: new Date().toISOString(),
          overrides: { ...state.overrides },
          bindings: buildEffectiveBindings(state.overrides),
        };
      },

      importBindings: (payload) => {
        const blockedActionIds: string[] = [];
        const skippedActionIds: string[] = [];
        const nextOverrides: ShortcutMap = {};

        if (!payload || typeof payload !== 'object') {
          return {
            importedCount: 0,
            blockedActionIds,
            skippedActionIds: ['invalid-payload'],
            activePresetId: get().activePresetId,
          };
        }

        const data = payload as Partial<ShortcutImportExportPayload> & {
          bindings?: ShortcutMap;
          overrides?: ShortcutMap;
        };
        const source = data.overrides && typeof data.overrides === 'object'
          ? data.overrides
          : data.bindings && typeof data.bindings === 'object'
            ? data.bindings
            : null;

        if (!source) {
          return {
            importedCount: 0,
            blockedActionIds,
            skippedActionIds: ['missing-bindings'],
            activePresetId: get().activePresetId,
          };
        }

        for (const [actionId, rawCombo] of Object.entries(source)) {
          const action = SHORTCUT_ACTION_MAP[actionId];
          if (!action || !rawCombo || typeof rawCombo !== 'object') {
            skippedActionIds.push(actionId);
            continue;
          }

          const combo = normalizeCombo(rawCombo as KeyCombo);
          if (!combo.code) {
            skippedActionIds.push(actionId);
            continue;
          }

          const browserConflict = findBrowserShortcutConflict(combo);
          if (browserConflict?.severity === 'error') {
            blockedActionIds.push(actionId);
            continue;
          }

          if (!comboEquals(combo, action.defaultCombo)) {
            nextOverrides[actionId] = combo;
          }
        }

        const importedPresetId =
          typeof data.presetId === 'string' && data.presetId in SHORTCUT_PRESET_MAP
            ? data.presetId
            : 'custom';

        set({
          overrides: nextOverrides,
          activePresetId: Object.keys(nextOverrides).length === 0 ? 'ace-step' : importedPresetId,
        });

        return {
          importedCount: Object.keys(nextOverrides).length,
          blockedActionIds,
          skippedActionIds,
          activePresetId: get().activePresetId,
        };
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
