/**
 * Types for Web MIDI controller integration.
 *
 * Covers device representation, controller-to-parameter mappings,
 * and MIDI Learn mode state.
 */

/** Represents a connected MIDI input device. */
export interface MidiDevice {
  id: string;
  name: string;
  manufacturer: string;
  state: 'connected' | 'disconnected';
}

/** The kind of MIDI message a mapping responds to. */
export type MidiControlType = 'cc' | 'note' | 'pitchBend';

/** A single controller-to-parameter mapping. */
export interface MidiMapping {
  id: string;
  /** Device that originated the mapping. */
  deviceId: string;
  deviceName: string;
  /** MIDI channel (0-15). */
  channel: number;
  /** Type of MIDI message. */
  controlType: MidiControlType;
  /** CC number (0-127), note number (0-127), or 0 for pitchBend. */
  controlNumber: number;
  /** Target parameter identifier (e.g. 'track:<id>:volume'). */
  targetParam: string;
  /** Human-readable label for the target (e.g. 'Track 1 Volume'). */
  targetLabel: string;
  /** Minimum output value (default 0). */
  min: number;
  /** Maximum output value (default 1). */
  max: number;
}

/** Incoming MIDI message parsed from Web MIDI API. */
export interface MidiMessage {
  deviceId: string;
  channel: number;
  type: 'cc' | 'noteOn' | 'noteOff' | 'pitchBend';
  /** CC number or note number. */
  control: number;
  /** 0-127 for CC/note velocity, 0-16383 for pitchBend. */
  value: number;
  timestamp: number;
}

/** State for MIDI Learn mode. */
export interface MidiLearnState {
  active: boolean;
  /** The parameter being assigned. */
  targetParam: string | null;
  targetLabel: string | null;
}

/** Serializable snapshot of all mappings for import/export. */
export interface MidiMappingPreset {
  version: number;
  name: string;
  mappings: MidiMapping[];
  exportedAt: string;
}
