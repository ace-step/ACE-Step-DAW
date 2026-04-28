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
  /** Last Web MIDI connection error, shown in the controller panel. */
  connectionError: string | null;

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
  setConnectionError: (error: string | null) => void;

  // ── Import/Export ───────────────────────────────────────
  exportMappings: (name: string) => MidiMappingPreset;
  importMappings: (preset: MidiMappingPreset) => void;
}

const INITIAL_LEARN_STATE: MidiLearnState = {
  active: false,
  targetParam: null,
  targetLabel: null,
};

const MIDI_CONTROL_TYPES: MidiControlType[] = ['cc', 'note', 'pitchBend'];

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function validateImportedMapping(value: unknown): MidiMapping | null {
  if (!value || typeof value !== 'object') return null;
  const mapping = value as Partial<MidiMapping>;
  if (typeof mapping.id !== 'string' || mapping.id.trim() === '') return null;
  if (typeof mapping.deviceId !== 'string' || mapping.deviceId.trim() === '') return null;
  if (typeof mapping.deviceName !== 'string' || mapping.deviceName.trim() === '') return null;
  if (typeof mapping.targetParam !== 'string' || mapping.targetParam.trim() === '') return null;
  if (typeof mapping.targetLabel !== 'string' || mapping.targetLabel.trim() === '') return null;
  if (!mapping.controlType || !MIDI_CONTROL_TYPES.includes(mapping.controlType)) return null;
  if (!isFiniteNumber(mapping.channel) || !isFiniteNumber(mapping.controlNumber)) return null;

  const channel = clampInt(mapping.channel, 0, 15);
  const maxControl = mapping.controlType === 'pitchBend' ? 0 : 127;
  const controlNumber = clampInt(mapping.controlNumber, 0, maxControl);
  const min = isFiniteNumber(mapping.min) ? mapping.min : 0;
  const max = isFiniteNumber(mapping.max) ? mapping.max : 1;

  return {
    id: mapping.id,
    deviceId: mapping.deviceId,
    deviceName: mapping.deviceName,
    channel,
    controlType: mapping.controlType,
    controlNumber,
    targetParam: mapping.targetParam,
    targetLabel: mapping.targetLabel,
    min,
    max,
  };
}

export const useMidiControllerStore = create<MidiControllerState>()(
  persist(
    (set, get) => ({
      enabled: false,
      devices: [],
      mappings: [],
      learnMode: { ...INITIAL_LEARN_STATE },
      lastActivity: null,
      connectionError: null,

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

      setConnectionError: (error) => set({ connectionError: error }),

      // ── Import/Export ─────────────────────────────────────

      exportMappings: (name) => ({
        version: 1,
        name,
        mappings: [...get().mappings],
        exportedAt: new Date().toISOString(),
      }),

      importMappings: (preset) => {
        if (!preset || preset.version !== 1 || !Array.isArray(preset.mappings)) return;

        const seen = new Set<string>();
        const validated: MidiMapping[] = [];
        for (const value of preset.mappings) {
          const mapping = validateImportedMapping(value);
          if (!mapping) continue;
          const key = `${mapping.deviceId}:${mapping.channel}:${mapping.controlType}:${mapping.controlNumber}`;
          if (seen.has(key)) continue;
          seen.add(key);
          validated.push(mapping);
        }

        set({ mappings: validated });
      },
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
