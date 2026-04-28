/**
 * Web MIDI controller service for session view clip/scene launching.
 *
 * Mapping convention (Launchpad-style):
 * - MIDI notes 0–63: clip slot launches (row = note / 8, col = note % 8)
 * - MIDI notes 64–71: scene launches (scene index = note - 64)
 * - CC 1–8: track volume (not implemented yet)
 *
 * Custom mappings can override the defaults via setMapping().
 */

export interface MidiMapping {
  type: 'clip' | 'scene' | 'stop-track' | 'stop-all';
  /** For clips: track index in the sorted track list. */
  trackIndex?: number;
  /** For clips: scene index. For scenes: scene index. */
  sceneIndex?: number;
}

export interface MidiControllerState {
  isAvailable: boolean;
  isConnected: boolean;
  deviceName: string | null;
  inputId: string | null;
}

export type MidiEventHandler = (mapping: MidiMapping) => void;

const DEFAULT_CLIP_NOTE_START = 0;
const DEFAULT_SCENE_NOTE_START = 64;
const DEFAULT_STOP_ALL_NOTE = 127;
const GRID_COLS = 8;

let midiAccess: MIDIAccess | null = null;
let currentInput: MIDIInput | null = null;
let eventHandler: MidiEventHandler | null = null;
let stateChangeHandler: ((state: MidiControllerState) => void) | null = null;
let customMappings: Map<number, MidiMapping> = new Map();

/**
 * Resolve a MIDI note number to a mapping.
 * Custom mappings take precedence over defaults.
 */
export function resolveNoteMapping(note: number): MidiMapping | null {
  // Check custom mappings first
  if (customMappings.has(note)) {
    return customMappings.get(note)!;
  }

  // Default: stop all
  if (note === DEFAULT_STOP_ALL_NOTE) {
    return { type: 'stop-all' };
  }

  // Default: scene launches (notes 64-71)
  if (note >= DEFAULT_SCENE_NOTE_START && note < DEFAULT_SCENE_NOTE_START + 8) {
    return { type: 'scene', sceneIndex: note - DEFAULT_SCENE_NOTE_START };
  }

  // Default: clip grid (notes 0-63)
  if (note >= DEFAULT_CLIP_NOTE_START && note < DEFAULT_CLIP_NOTE_START + 64) {
    const row = Math.floor(note / GRID_COLS);
    const col = note % GRID_COLS;
    return { type: 'clip', trackIndex: col, sceneIndex: row };
  }

  return null;
}

function handleMidiMessage(event: MIDIMessageEvent) {
  if (!eventHandler) return;
  const data = event.data;
  if (!data || data.length < 3) return;

  const status = data[0] & 0xf0;
  const note = data[1];
  const velocity = data[2];

  // Only respond to Note On with velocity > 0
  if (status === 0x90 && velocity > 0) {
    const mapping = resolveNoteMapping(note);
    if (mapping) {
      eventHandler(mapping);
    }
  }
}

function connectToInput(input: MIDIInput) {
  if (currentInput) {
    currentInput.onmidimessage = null;
  }
  currentInput = input;
  currentInput.onmidimessage = handleMidiMessage;
}

/**
 * Initialize the Web MIDI service. Returns the current state.
 */
export async function initMidiController(): Promise<MidiControllerState> {
  if (!navigator.requestMIDIAccess) {
    return { isAvailable: false, isConnected: false, deviceName: null, inputId: null };
  }

  try {
    const access = await navigator.requestMIDIAccess() as MIDIAccess;
    midiAccess = access;
    const inputs = Array.from(access.inputs.values());

    if (inputs.length > 0) {
      connectToInput(inputs[0] as MIDIInput);
      return {
        isAvailable: true,
        isConnected: true,
        deviceName: inputs[0].name ?? 'Unknown Device',
        inputId: inputs[0].id,
      };
    }

    // Listen for new device connections and notify consumers
    access.onstatechange = (event) => {
      if (event.port?.type === 'input' && event.port.state === 'connected' && !currentInput) {
        connectToInput(event.port as MIDIInput);
        const newState: MidiControllerState = {
          isAvailable: true,
          isConnected: true,
          deviceName: event.port.name ?? 'Unknown Device',
          inputId: event.port.id,
        };
        stateChangeHandler?.(newState);
      }
    };

    return { isAvailable: true, isConnected: false, deviceName: null, inputId: null };
  } catch {
    return { isAvailable: false, isConnected: false, deviceName: null, inputId: null };
  }
}

/**
 * Select a specific MIDI input by ID.
 */
export function selectMidiInput(inputId: string): boolean {
  if (!midiAccess) return false;
  const input = midiAccess.inputs.get(inputId);
  if (!input) return false;
  connectToInput(input);
  return true;
}

/**
 * List available MIDI inputs.
 */
export function listMidiInputs(): Array<{ id: string; name: string }> {
  if (!midiAccess) return [];
  return Array.from(midiAccess.inputs.values()).map((input) => ({
    id: input.id,
    name: input.name ?? 'Unknown Device',
  }));
}

/**
 * Set the event handler for MIDI controller events.
 */
export function setMidiEventHandler(handler: MidiEventHandler | null) {
  eventHandler = handler;
}

/**
 * Set a handler to be notified when MIDI connection state changes (e.g., late device connection).
 */
export function setMidiStateChangeHandler(handler: ((state: MidiControllerState) => void) | null) {
  stateChangeHandler = handler;
}

/**
 * Set a custom MIDI note mapping.
 */
export function setMapping(note: number, mapping: MidiMapping) {
  customMappings.set(note, mapping);
}

/**
 * Clear all custom mappings, reverting to defaults.
 */
export function clearMappings() {
  customMappings.clear();
}

/**
 * Disconnect and clean up.
 */
export function disconnectMidiController() {
  if (currentInput) {
    currentInput.onmidimessage = null;
    currentInput = null;
  }
  eventHandler = null;
}
