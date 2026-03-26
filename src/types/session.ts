/**
 * Session View types for clip launcher, scene management,
 * and MIDI capture buffer.
 */

/** Playback state of a session clip slot. */
export type SessionClipState = 'stopped' | 'playing' | 'queued' | 'recording';

/** A single slot in the session clip grid. */
export interface SessionClipSlot {
  id: string;
  trackId: string;
  /** Index position in the track's session column (row). */
  sceneIndex: number;
  /** Reference to an arrangement clip id, or null if the slot is empty. */
  clipId: string | null;
  /** Current playback state. */
  state: SessionClipState;
  /** Color override (inherits track color when null). */
  color: string | null;
  /** When true, the incoming clip starts at the outgoing clip's current position. */
  legato?: boolean;
}

/** A scene (horizontal row) that can trigger all slots at once. */
export interface SessionScene {
  id: string;
  name: string;
  /** Row index in the session grid. */
  index: number;
}

/** A buffered MIDI event for retroactive capture. */
export interface BufferedMidiEvent {
  /** MIDI note number (0–127). */
  pitch: number;
  /** Velocity (0–1). */
  velocity: number;
  /** Timestamp in seconds (performance.now() / 1000 at capture time). */
  timestamp: number;
  /** Duration in seconds (filled on note-off). */
  duration: number;
}

/** Session-level state stored on the project. */
export interface SessionData {
  /** All clip slots in the grid, keyed by slot id. */
  slots: SessionClipSlot[];
  /** Scene definitions (rows). */
  scenes: SessionScene[];
  /** Number of scene rows in the grid. */
  sceneCount: number;
}
