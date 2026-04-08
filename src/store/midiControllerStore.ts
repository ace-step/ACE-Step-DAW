/**
 * midiControllerStore — Zustand store for MIDI controller state.
 *
 * Manages: connected devices, controller mappings, MIDI Learn mode,
 * last activity indicator, and mapping presets (import/export).
 * Persists mappings and enabled state to localStorage.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';
import type {
  MidiControlType,
  MidiDevice,
  MidiLearnState,
  MidiMapping,
  MidiMappingPreset,
  MidiMessage,
} from '../types/midiController';

export interface MidiControllerState {
  /** Whether MIDI controller input is enabled. */
  enabled: boolean;
  /** Currently connected MIDI devices. */
  devices: MidiDevice[];
  /** Active controller-to-parameter mappings. */
  mappings: MidiMapping[];
  /** MIDI Learn mode state. */
  learnMode: MidiLearnState;
  /** Last received MIDI message (for activity indicator). */
  lastActivity: MidiMessage | null;

  // ── Device Actions ──────────────────────────────────────
  setDevices: (devices: MidiDevice[]) => void;
  updateDeviceState: (deviceId: string, state: 'connected' | 'disconnected') => void;

  // ── Mapping Actions ─────────────────────────────────────
  addMapping: (mapping: MidiMapping) => void;
  removeMapping: (mappingId: string) => void;
  updateMapping: (mappingId: string, updates: Partial<MidiMapping>) => void;
  clearAllMappings: () => void;
  findMapping: (
    deviceId: string,
    channel: number,
    controlType: MidiControlType,
    controlNumber: number,
  ) => MidiMapping | undefined;

  // ── Learn Mode ──────────────────────────────────────────
  startLearnMode: (targetParam: string, targetLabel: string) => void;
  cancelLearnMode: () => void;
  completeLearnMode: (
    deviceId: string,
    deviceName: string,
    channel: number,
    controlType: MidiControlType,
    controlNumber: number,
  ) => void;

  // ── State ───────────────────────────────────────────────
  setEnabled: (enabled: boolean) => void;
  setLastActivity: (msg: MidiMessage) => void;

  // ── Import/Export ───────────────────────────────────────
  exportMappings: (name: string) => MidiMappingPreset;
  importMappings: (preset: MidiMappingPreset) => void;
}

const INITIAL_LEARN_STATE: MidiLearnState = {
  active: false,
  targetParam: null,
  targetLabel: null,
};

export const useMidiControllerStore = create<MidiControllerState>()(
  persist(
    (set, get) => ({
      enabled: true,
      devices: [],
      mappings: [],
      learnMode: { ...INITIAL_LEARN_STATE },
      lastActivity: null,

      // ── Device Actions ────────────────────────────────────

      setDevices: (devices) => set({ devices }),

      updateDeviceState: (deviceId, state) =>
        set((s) => ({
          devices: s.devices.map((d) =>
            d.id === deviceId ? { ...d, state } : d,
          ),
        })),

      // ── Mapping Actions ───────────────────────────────────

      addMapping: (mapping) =>
        set((s) => {
          // Replace existing mapping with same device+channel+controlType+controlNumber
          const filtered = s.mappings.filter(
            (m) =>
              !(
                m.deviceId === mapping.deviceId &&
                m.channel === mapping.channel &&
                m.controlType === mapping.controlType &&
                m.controlNumber === mapping.controlNumber
              ),
          );
          return { mappings: [...filtered, mapping] };
        }),

      removeMapping: (mappingId) =>
        set((s) => ({ mappings: s.mappings.filter((m) => m.id !== mappingId) })),

      updateMapping: (mappingId, updates) =>
        set((s) => ({
          mappings: s.mappings.map((m) =>
            m.id === mappingId ? { ...m, ...updates } : m,
          ),
        })),

      clearAllMappings: () => set({ mappings: [] }),

      findMapping: (deviceId, channel, controlType, controlNumber) =>
        get().mappings.find(
          (m) =>
            m.deviceId === deviceId &&
            m.channel === channel &&
            m.controlType === controlType &&
            m.controlNumber === controlNumber,
        ),

      // ── Learn Mode ────────────────────────────────────────

      startLearnMode: (targetParam, targetLabel) =>
        set({
          learnMode: { active: true, targetParam, targetLabel },
        }),

      cancelLearnMode: () =>
        set({ learnMode: { ...INITIAL_LEARN_STATE } }),

      completeLearnMode: (deviceId, deviceName, channel, controlType, controlNumber) => {
        const { learnMode } = get();
        if (!learnMode.active || !learnMode.targetParam) return;

        const mapping: MidiMapping = {
          id: uuidv4(),
          deviceId,
          deviceName,
          channel,
          controlType,
          controlNumber,
          targetParam: learnMode.targetParam,
          targetLabel: learnMode.targetLabel ?? learnMode.targetParam,
          min: 0,
          max: 1,
        };

        // Use addMapping which handles dedup
        get().addMapping(mapping);
        set({ learnMode: { ...INITIAL_LEARN_STATE } });
      },

      // ── State ─────────────────────────────────────────────

      setEnabled: (enabled) => set({ enabled }),

      setLastActivity: (msg) => set({ lastActivity: msg }),

      // ── Import/Export ─────────────────────────────────────

      exportMappings: (name) => ({
        version: 1,
        name,
        mappings: [...get().mappings],
        exportedAt: new Date().toISOString(),
      }),

      importMappings: (preset) =>
        set({ mappings: [...preset.mappings] }),
    }),
    {
      name: 'ace-step-daw-midi-controller',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        enabled: state.enabled,
        mappings: state.mappings,
      }),
    },
  ),
);
