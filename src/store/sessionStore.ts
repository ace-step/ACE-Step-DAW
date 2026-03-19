import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { SessionClipSlot, SessionScene, BufferedMidiEvent } from '../types/session';
import { MidiCaptureBuffer } from '../utils/midiCaptureBuffer';

const DEFAULT_SCENE_COUNT = 8;
const MIDI_BUFFER_DURATION = 30; // seconds
const MIDI_BUFFER_MAX_EVENTS = 2000;

/** A recorded session event for arrangement capture. */
export interface SessionRecordedEvent {
  slotId: string;
  clipId: string;
  trackId: string;
  action: 'launch' | 'stop';
  timestamp: number;
}

export interface SessionState {
  slots: SessionClipSlot[];
  scenes: SessionScene[];
  sceneCount: number;
  recordingToArrangement: boolean;
  recordedEvents: SessionRecordedEvent[];

  // Actions
  initSession: (trackIds: string[], sceneCount?: number) => void;
  assignClipToSlot: (slotId: string, clipId: string) => void;
  clearSlot: (slotId: string) => void;
  launchSlot: (slotId: string) => void;
  stopSlot: (slotId: string) => void;
  launchScene: (sceneIndex: number) => void;
  stopScene: (sceneIndex: number) => void;
  stopAll: () => void;
  renameScene: (sceneId: string, name: string) => void;
  addScene: (trackIds: string[]) => void;
  setRecordingToArrangement: (v: boolean) => void;
  recordSessionEvent: (event: SessionRecordedEvent) => void;
  clearRecordedEvents: () => void;

  // MIDI capture
  midiNoteOn: (pitch: number, velocity: number, timestamp: number) => void;
  midiNoteOff: (pitch: number, timestamp: number) => void;
  captureMidi: (startTime?: number, endTime?: number) => BufferedMidiEvent[];
  clearMidiBuffer: () => void;
}

// Module-level MIDI buffer (not stored in Zustand to avoid serialization)
const midiBuffer = new MidiCaptureBuffer({
  maxDurationSeconds: MIDI_BUFFER_DURATION,
  maxEvents: MIDI_BUFFER_MAX_EVENTS,
});

function createSlots(trackIds: string[], sceneCount: number): SessionClipSlot[] {
  const slots: SessionClipSlot[] = [];
  for (let sceneIdx = 0; sceneIdx < sceneCount; sceneIdx++) {
    for (const trackId of trackIds) {
      slots.push({
        id: uuidv4(),
        trackId,
        sceneIndex: sceneIdx,
        clipId: null,
        state: 'stopped',
        color: null,
      });
    }
  }
  return slots;
}

function createScenes(count: number): SessionScene[] {
  return Array.from({ length: count }, (_, i) => ({
    id: uuidv4(),
    name: `Scene ${i + 1}`,
    index: i,
  }));
}

export const useSessionStore = create<SessionState>()((set, get) => ({
  slots: [],
  scenes: [],
  sceneCount: 0,
  recordingToArrangement: false,
  recordedEvents: [],

  initSession: (trackIds, sceneCount = DEFAULT_SCENE_COUNT) => {
    set({
      slots: createSlots(trackIds, sceneCount),
      scenes: createScenes(sceneCount),
      sceneCount,
      recordedEvents: [],
    });
  },

  assignClipToSlot: (slotId, clipId) => {
    set((s) => ({
      slots: s.slots.map((slot) =>
        slot.id === slotId ? { ...slot, clipId } : slot,
      ),
    }));
  },

  clearSlot: (slotId) => {
    set((s) => ({
      slots: s.slots.map((slot) =>
        slot.id === slotId ? { ...slot, clipId: null, state: 'stopped' } : slot,
      ),
    }));
  },

  launchSlot: (slotId) => {
    set((s) => {
      const target = s.slots.find((slot) => slot.id === slotId);
      if (!target || !target.clipId) return s;
      return {
        slots: s.slots.map((slot) => {
          if (slot.id === slotId) return { ...slot, state: 'playing' as const };
          // Stop other playing slots on the same track
          if (slot.trackId === target.trackId && slot.state === 'playing') {
            return { ...slot, state: 'stopped' as const };
          }
          return slot;
        }),
      };
    });
  },

  stopSlot: (slotId) => {
    set((s) => ({
      slots: s.slots.map((slot) =>
        slot.id === slotId ? { ...slot, state: 'stopped' as const } : slot,
      ),
    }));
  },

  launchScene: (sceneIndex) => {
    set((s) => ({
      slots: s.slots.map((slot) => {
        if (slot.sceneIndex === sceneIndex && slot.clipId) {
          return { ...slot, state: 'playing' as const };
        }
        // Stop slots on same tracks that belong to other scenes
        if (slot.sceneIndex !== sceneIndex && slot.state === 'playing') {
          return { ...slot, state: 'stopped' as const };
        }
        return slot;
      }),
    }));
  },

  stopScene: (sceneIndex) => {
    set((s) => ({
      slots: s.slots.map((slot) =>
        slot.sceneIndex === sceneIndex ? { ...slot, state: 'stopped' as const } : slot,
      ),
    }));
  },

  stopAll: () => {
    set((s) => ({
      slots: s.slots.map((slot) => ({ ...slot, state: 'stopped' as const })),
    }));
  },

  renameScene: (sceneId, name) => {
    set((s) => ({
      scenes: s.scenes.map((scene) =>
        scene.id === sceneId ? { ...scene, name } : scene,
      ),
    }));
  },

  addScene: (trackIds) => {
    set((s) => {
      const newIndex = s.sceneCount;
      const newSlots: SessionClipSlot[] = trackIds.map((trackId) => ({
        id: uuidv4(),
        trackId,
        sceneIndex: newIndex,
        clipId: null,
        state: 'stopped' as const,
        color: null,
      }));
      return {
        slots: [...s.slots, ...newSlots],
        scenes: [...s.scenes, { id: uuidv4(), name: `Scene ${newIndex + 1}`, index: newIndex }],
        sceneCount: newIndex + 1,
      };
    });
  },

  setRecordingToArrangement: (v) => set({ recordingToArrangement: v }),

  recordSessionEvent: (event) => {
    set((s) => ({ recordedEvents: [...s.recordedEvents, event] }));
  },

  clearRecordedEvents: () => set({ recordedEvents: [] }),

  // MIDI capture (delegates to module-level buffer)
  midiNoteOn: (pitch, velocity, timestamp) => {
    midiBuffer.noteOn(pitch, velocity, timestamp);
  },

  midiNoteOff: (pitch, timestamp) => {
    midiBuffer.noteOff(pitch, timestamp);
  },

  captureMidi: (startTime?: number, endTime?: number) => {
    return midiBuffer.capture(startTime, endTime);
  },

  clearMidiBuffer: () => {
    midiBuffer.clear();
  },
}));
