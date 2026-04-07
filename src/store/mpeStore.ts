/**
 * MPE (MIDI Polyphonic Expression) Zustand store.
 *
 * Manages MPE zone configuration, active note tracking, and
 * expression state for the UI layer.
 *
 * @see https://github.com/ace-step/ACE-Step-DAW/issues/960
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { MpeZoneManager, type MpeNoteState } from '../services/mpeService';

export interface MpeStoreState {
  /** Whether MPE mode is enabled by the user. */
  enabled: boolean;
  /** Lower zone member channel count (0 = disabled). */
  lowerZoneMembers: number;
  /** Upper zone member channel count (0 = disabled). */
  upperZoneMembers: number;
  /** Pitch bend range in semitones (default 48 for MPE). */
  pitchBendRange: number;
  /** Currently active MPE notes (live expression state). */
  activeNotes: MpeNoteState[];
  /** Whether an MPE-capable device was auto-detected. */
  autoDetected: boolean;
}

export interface MpeStoreActions {
  setEnabled: (enabled: boolean) => void;
  setLowerZoneMembers: (count: number) => void;
  setUpperZoneMembers: (count: number) => void;
  setPitchBendRange: (semitones: number) => void;
  setActiveNotes: (notes: MpeNoteState[]) => void;
  setAutoDetected: (detected: boolean) => void;
  resetZones: () => void;
}

/** Singleton zone manager — shared between store and services. */
let _zoneManager: MpeZoneManager | null = null;

export function getMpeZoneManager(): MpeZoneManager {
  if (!_zoneManager) {
    _zoneManager = new MpeZoneManager();
  }
  return _zoneManager;
}

/** Replace the singleton (for testing). */
export function setMpeZoneManager(mgr: MpeZoneManager): void {
  _zoneManager = mgr;
}

export const useMpeStore = create<MpeStoreState & MpeStoreActions>()(
  persist(
    (set) => ({
      // ── State ──
      enabled: false,
      lowerZoneMembers: 0,
      upperZoneMembers: 0,
      pitchBendRange: 48,
      activeNotes: [],
      autoDetected: false,

      // ── Actions ──
      setEnabled: (enabled) => {
        set({ enabled });
        const mgr = getMpeZoneManager();
        if (!enabled) {
          mgr.configureLowerZone(0);
          mgr.configureUpperZone(0);
          mgr.reset();
          set({ activeNotes: [] });
        } else {
          // Re-apply stored zone config
          const state = useMpeStore.getState();
          if (state.lowerZoneMembers > 0) mgr.configureLowerZone(state.lowerZoneMembers);
          if (state.upperZoneMembers > 0) mgr.configureUpperZone(state.upperZoneMembers);
          mgr.setPitchBendRange(state.pitchBendRange);
        }
      },

      setLowerZoneMembers: (count) => {
        const clamped = Math.max(0, Math.min(14, count));
        set({ lowerZoneMembers: clamped });
        getMpeZoneManager().configureLowerZone(clamped);
      },

      setUpperZoneMembers: (count) => {
        const clamped = Math.max(0, Math.min(14, count));
        set({ upperZoneMembers: clamped });
        getMpeZoneManager().configureUpperZone(clamped);
      },

      setPitchBendRange: (semitones) => {
        const clamped = Math.max(1, Math.min(96, semitones));
        set({ pitchBendRange: clamped });
        getMpeZoneManager().setPitchBendRange(clamped);
      },

      setActiveNotes: (notes) => set({ activeNotes: notes }),

      setAutoDetected: (detected) => set({ autoDetected: detected }),

      resetZones: () => {
        set({ lowerZoneMembers: 0, upperZoneMembers: 0, activeNotes: [] });
        const mgr = getMpeZoneManager();
        mgr.configureLowerZone(0);
        mgr.configureUpperZone(0);
        mgr.reset();
      },
    }),
    {
      name: 'ace-mpe-settings',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        enabled: state.enabled,
        lowerZoneMembers: state.lowerZoneMembers,
        upperZoneMembers: state.upperZoneMembers,
        pitchBendRange: state.pitchBendRange,
      }),
    },
  ),
);
