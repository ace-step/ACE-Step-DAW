/**
 * MIDI Controller Service for Session View
 *
 * Connects to Web MIDI API, listens for note-on messages, and routes them
 * to session clip/scene launch actions via a configurable mapping.
 *
 * Mapping layout (Launchpad-style):
 *   MIDI notes are mapped to a grid: note = baseNote + (sceneIndex * columns) + trackIndex
 *   Scene launch notes start at sceneLaunchBaseNote + sceneIndex
 */

export interface MidiMapping {
  /** Base MIDI note for clip grid (default: 36 = C2). */
  gridBaseNote: number;
  /** Number of columns (tracks) in the grid mapping. */
  gridColumns: number;
  /** Base MIDI note for scene launch buttons (default: 82). */
  sceneLaunchBaseNote: number;
  /** MIDI note for stop-all (default: 120). */
  stopAllNote: number;
}

export const DEFAULT_MIDI_MAPPING: MidiMapping = {
  gridBaseNote: 36,
  gridColumns: 8,
  sceneLaunchBaseNote: 82,
  stopAllNote: 120,
};

export interface MidiControllerCallbacks {
  onClipLaunch: (trackIndex: number, sceneIndex: number) => void;
  onSceneLaunch: (sceneIndex: number) => void;
  onStopAll: () => void;
}

export interface MidiDevice {
  id: string;
  name: string;
  manufacturer: string;
}

/**
 * Resolve a MIDI note-on message to a session action using the mapping.
 * Returns the action to perform or null if unmapped.
 */
export function resolveMidiNoteToAction(
  note: number,
  mapping: MidiMapping,
): { type: 'clip'; trackIndex: number; sceneIndex: number } | { type: 'scene'; sceneIndex: number } | { type: 'stop-all' } | null {
  // Stop-all takes highest priority
  if (note === mapping.stopAllNote) {
    return { type: 'stop-all' };
  }

  // Scene launch range (higher priority than clip grid when overlapping)
  if (note >= mapping.sceneLaunchBaseNote && note < mapping.sceneLaunchBaseNote + 16) {
    return { type: 'scene', sceneIndex: note - mapping.sceneLaunchBaseNote };
  }

  // Clip grid range (only notes NOT consumed by scene launch)
  const gridOffset = note - mapping.gridBaseNote;
  if (gridOffset >= 0 && gridOffset < mapping.gridColumns * 16) {
    const sceneIndex = Math.floor(gridOffset / mapping.gridColumns);
    const trackIndex = gridOffset % mapping.gridColumns;
    return { type: 'clip', trackIndex, sceneIndex };
  }

  return null;
}

/**
 * List available MIDI input devices.
 * Returns empty array if Web MIDI is not supported.
 */
export async function listMidiInputDevices(): Promise<MidiDevice[]> {
  if (!navigator.requestMIDIAccess) return [];
  try {
    const access = await navigator.requestMIDIAccess();
    const devices: MidiDevice[] = [];
    access.inputs.forEach((input) => {
      devices.push({
        id: input.id,
        name: input.name ?? 'Unknown MIDI Device',
        manufacturer: input.manufacturer ?? '',
      });
    });
    return devices;
  } catch {
    return [];
  }
}

/**
 * Connect to a MIDI input device and route note-on messages to session actions.
 * Returns a cleanup function to disconnect.
 */
export function connectMidiController(
  deviceId: string | null,
  mapping: MidiMapping,
  callbacks: MidiControllerCallbacks,
): { disconnect: () => void; connected: Promise<boolean> } {
  let cleanup: (() => void) | null = null;

  const connected = (async () => {
    if (!navigator.requestMIDIAccess) return false;
    try {
      const access = await navigator.requestMIDIAccess();

      // If no specific device, use first available input
      let input: MIDIInput | undefined;
      if (deviceId) {
        input = access.inputs.get(deviceId);
      } else {
        const entries = access.inputs.values();
        const first = entries.next();
        input = first.done ? undefined : first.value;
      }

      if (!input) return false;

      const handleMessage = (event: MIDIMessageEvent) => {
        const [status, note, velocity] = event.data ?? [];
        // Note-on: status 0x90-0x9F with velocity > 0
        if ((status & 0xf0) !== 0x90 || velocity === 0) return;

        const action = resolveMidiNoteToAction(note, mapping);
        if (!action) return;

        switch (action.type) {
          case 'clip':
            callbacks.onClipLaunch(action.trackIndex, action.sceneIndex);
            break;
          case 'scene':
            callbacks.onSceneLaunch(action.sceneIndex);
            break;
          case 'stop-all':
            callbacks.onStopAll();
            break;
        }
      };

      input.addEventListener('midimessage', handleMessage as EventListener);
      cleanup = () => {
        input?.removeEventListener('midimessage', handleMessage as EventListener);
      };

      return true;
    } catch {
      return false;
    }
  })();

  return {
    disconnect: () => cleanup?.(),
    connected,
  };
}
