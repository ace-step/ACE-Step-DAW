/**
 * MPE (MIDI Polyphonic Expression) service.
 *
 * Implements MPE zone management, per-note expression tracking,
 * and MIDI message parsing per the MPE specification (RP-053).
 *
 * MPE uses channel 1 as master for the lower zone and channel 16
 * as master for the upper zone. Member channels carry per-note
 * expression (pitch bend, CC74 timbre/slide, channel pressure).
 *
 * @see https://github.com/ace-step/ACE-Step-DAW/issues/960
 */

// ── Types ────────────────────────────────────────────────────────

export interface MpeZone {
  masterChannel: number; // 0-indexed (0 = ch1, 15 = ch16)
  memberChannels: number[];
  memberCount: number;
}

export interface MpeNoteState {
  channel: number;
  pitch: number;
  velocity: number;
  pressure: number;    // Channel aftertouch 0–127
  timbre: number;      // CC74 0–127 (64 = center/default)
  pitchBend: number;   // -8192 to +8191 (0 = center)
}

export interface MpeMessage {
  type: 'noteOn' | 'noteOff' | 'pitchBend' | 'cc' | 'channelPressure';
  channel: number; // 0-indexed
  data1: number;
  data2: number;
}

export type MpeZoneRole = 'lower-master' | 'lower-member' | 'upper-master' | 'upper-member';

// ── Message Parser ───────────────────────────────────────────────

/**
 * Parse a raw MIDI message into an MpeMessage.
 * Returns null for system messages or invalid data.
 */
export function parseMpeMessage(data: Uint8Array): MpeMessage | null {
  if (!data || data.length < 2) return null;

  const statusByte = data[0];
  // System messages (0xF0+) — ignore
  if (statusByte >= 0xf0) return null;

  const status = statusByte & 0xf0;
  const channel = statusByte & 0x0f;

  switch (status) {
    case 0x90: // Note On
      if (data.length < 3) return null;
      if (data[2] === 0) {
        // Velocity 0 = note off
        return { type: 'noteOff', channel, data1: data[1], data2: 0 };
      }
      return { type: 'noteOn', channel, data1: data[1], data2: data[2] };

    case 0x80: // Note Off
      if (data.length < 3) return null;
      return { type: 'noteOff', channel, data1: data[1], data2: data[2] };

    case 0xe0: // Pitch Bend
      if (data.length < 3) return null;
      return { type: 'pitchBend', channel, data1: data[1], data2: data[2] };

    case 0xb0: // Control Change
      if (data.length < 3) return null;
      return { type: 'cc', channel, data1: data[1], data2: data[2] };

    case 0xd0: // Channel Pressure (aftertouch)
      return { type: 'channelPressure', channel, data1: data[1], data2: 0 };

    default:
      return null;
  }
}

// ── Zone Manager ─────────────────────────────────────────────────

export class MpeZoneManager {
  private _lowerZone: MpeZone | null = null;
  private _upperZone: MpeZone | null = null;
  private _activeNotes: Map<string, MpeNoteState> = new Map();
  private _masterPitchBend: { lower: number; upper: number } = { lower: 0, upper: 0 };
  private _pitchBendRange = 48; // MPE default: 48 semitones

  // ── Zone Configuration ───────────────────────────────────────

  configureLowerZone(memberCount: number): void {
    if (memberCount <= 0) {
      this._lowerZone = null;
      return;
    }
    // Clamp to avoid overlapping with upper zone
    const upperUsed = this._upperZone?.memberCount ?? 0;
    const maxAvailable = 14 - upperUsed;
    const clamped = Math.min(memberCount, maxAvailable);
    if (clamped <= 0) {
      this._lowerZone = null;
      return;
    }
    const memberChannels: number[] = [];
    for (let i = 1; i <= clamped; i++) {
      memberChannels.push(i);
    }
    this._lowerZone = {
      masterChannel: 0,
      memberChannels,
      memberCount: clamped,
    };
  }

  configureUpperZone(memberCount: number): void {
    if (memberCount <= 0) {
      this._upperZone = null;
      return;
    }
    // Clamp to avoid overlapping with lower zone
    const lowerUsed = this._lowerZone?.memberCount ?? 0;
    const maxAvailable = 14 - lowerUsed;
    const clamped = Math.min(memberCount, maxAvailable);
    if (clamped <= 0) {
      this._upperZone = null;
      return;
    }
    const memberChannels: number[] = [];
    for (let i = 0; i < clamped; i++) {
      memberChannels.push(14 - i);
    }
    this._upperZone = {
      masterChannel: 15,
      memberChannels,
      memberCount: clamped,
    };
  }

  getLowerZone(): MpeZone | null {
    return this._lowerZone;
  }

  getUpperZone(): MpeZone | null {
    return this._upperZone;
  }

  isMpeActive(): boolean {
    return this._lowerZone !== null || this._upperZone !== null;
  }

  /**
   * Determine which zone role a channel belongs to.
   */
  getZoneForChannel(channel: number): MpeZoneRole | null {
    if (this._lowerZone) {
      if (channel === this._lowerZone.masterChannel) return 'lower-master';
      if (this._lowerZone.memberChannels.includes(channel)) return 'lower-member';
    }
    if (this._upperZone) {
      if (channel === this._upperZone.masterChannel) return 'upper-master';
      if (this._upperZone.memberChannels.includes(channel)) return 'upper-member';
    }
    return null;
  }

  // ── Note Tracking ────────────────────────────────────────────

  private _noteKey(channel: number, pitch: number): string {
    return `${channel}:${pitch}`;
  }

  private _isMemberChannel(channel: number): boolean {
    const role = this.getZoneForChannel(channel);
    return role === 'lower-member' || role === 'upper-member';
  }

  /** MPE assigns one note per member channel — clear any prior note on this channel. */
  private _clearActiveNotesForChannel(channel: number): void {
    for (const [key, note] of this._activeNotes.entries()) {
      if (note.channel === channel) {
        this._activeNotes.delete(key);
      }
    }
  }

  noteOn(channel: number, pitch: number, velocity: number): void {
    if (!this._isMemberChannel(channel)) return;
    this._clearActiveNotesForChannel(channel);
    this._activeNotes.set(this._noteKey(channel, pitch), {
      channel,
      pitch,
      velocity,
      pressure: 0,
      timbre: 64, // MPE default center
      pitchBend: 0,
    });
  }

  noteOff(channel: number, pitch: number): void {
    this._activeNotes.delete(this._noteKey(channel, pitch));
  }

  setPitchBend(channel: number, value: number): void {
    // Update all notes on this channel
    for (const note of this._activeNotes.values()) {
      if (note.channel === channel) {
        note.pitchBend = value;
      }
    }
  }

  setPressure(channel: number, value: number): void {
    for (const note of this._activeNotes.values()) {
      if (note.channel === channel) {
        note.pressure = value;
      }
    }
  }

  setTimbre(channel: number, value: number): void {
    for (const note of this._activeNotes.values()) {
      if (note.channel === channel) {
        note.timbre = value;
      }
    }
  }

  setMasterPitchBend(zone: 'lower' | 'upper', value: number): void {
    this._masterPitchBend[zone] = value;
  }

  getMasterPitchBend(zone: 'lower' | 'upper'): number {
    return this._masterPitchBend[zone];
  }

  getActiveNotes(): MpeNoteState[] {
    return Array.from(this._activeNotes.values());
  }

  // ── Pitch Bend Range ────────────────────────────────────────

  getPitchBendRange(): number {
    return this._pitchBendRange;
  }

  setPitchBendRange(semitones: number): void {
    this._pitchBendRange = semitones;
  }

  // ── Reset ────────────────────────────────────────────────────

  reset(): void {
    this._activeNotes.clear();
    this._masterPitchBend = { lower: 0, upper: 0 };
  }
}
