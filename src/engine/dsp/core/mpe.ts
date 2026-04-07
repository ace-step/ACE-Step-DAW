/**
 * MPE (MIDI Polyphonic Expression) support.
 *
 * MPE spec overview:
 * - Channel 1 = master channel (lower zone), Channel 16 = master (upper zone)
 * - Member channels (2-16 for lower zone, 1-15 for upper zone) carry per-note data
 * - Each held note is assigned a unique member channel
 * - Per-note messages: pitch bend, CC74 (slide/timbre), channel pressure (aftertouch)
 * - MCM (MPE Configuration Message): RPN 0x06 on master channel sets zone size
 *
 * References:
 * - MIDI Polyphonic Expression (MPE) Specification (MMA/AMEI CA-034)
 * - https://www.midi.org/specifications/midi-polyphonic-expression-mpe
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MpeZone {
  /** Master channel: 0 for lower zone, 15 for upper zone (0-indexed). */
  masterChannel: number;
  /** Number of member channels in this zone (1-15). */
  memberChannelCount: number;
}

export interface MpeConfig {
  /** Whether MPE mode is enabled. */
  enabled: boolean;
  /** Lower zone (master = ch 0, members = ch 1..N). Null if not configured. */
  lowerZone: MpeZone | null;
  /** Upper zone (master = ch 15, members = ch 15-N..14). Null if not configured. */
  upperZone: MpeZone | null;
}

/** Per-note expression state tracked per voice/channel. */
export interface MpeNoteExpression {
  /** Pitch bend in semitones (-48 to +48, default 0). */
  pitchBend: number;
  /** Slide / timbre (CC74), 0-1. */
  slide: number;
  /** Channel pressure / aftertouch, 0-1. */
  pressure: number;
}

/** A parsed MIDI message with channel information. */
export interface MidiMessage {
  /** MIDI status type: 'noteOn' | 'noteOff' | 'pitchBend' | 'cc' | 'channelPressure' | 'rpn' | 'other'. */
  type: MidiMessageType;
  /** 0-indexed MIDI channel (0-15). */
  channel: number;
  /** For notes: MIDI note number (0-127). For CC: controller number. */
  data1: number;
  /** For notes: velocity. For CC: value. For pitch bend: 14-bit value (0-16383). */
  data2: number;
}

export type MidiMessageType =
  | 'noteOn'
  | 'noteOff'
  | 'pitchBend'
  | 'cc'
  | 'channelPressure'
  | 'rpn'
  | 'other';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** CC74 is the MPE standard "slide" / "timbre" controller. */
export const MPE_CC_SLIDE = 74;

/** Pitch bend range in semitones (MPE default is 48 for member channels). */
export const MPE_DEFAULT_BEND_RANGE = 48;

/** Master channel pitch bend range (MPE default is 2 semitones). */
export const MPE_MASTER_BEND_RANGE = 2;

/** RPN for MPE Configuration Message. */
export const MPE_RPN_NUMBER = 0x06;

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * Parse raw MIDI bytes into a structured MidiMessage.
 * Handles: Note On/Off, CC, Pitch Bend, Channel Pressure.
 */
export function parseMidiMessage(data: Uint8Array): MidiMessage | null {
  if (!data || data.length < 1) return null;

  const statusByte = data[0];
  const channel = statusByte & 0x0f;
  const type = statusByte & 0xf0;

  switch (type) {
    case 0x90: // Note On
      if (data.length < 3) return null;
      // Velocity 0 = Note Off per MIDI spec
      if (data[2] === 0) {
        return { type: 'noteOff', channel, data1: data[1], data2: 0 };
      }
      return { type: 'noteOn', channel, data1: data[1], data2: data[2] };

    case 0x80: // Note Off
      if (data.length < 3) return null;
      return { type: 'noteOff', channel, data1: data[1], data2: data[2] };

    case 0xb0: // Control Change
      if (data.length < 3) return null;
      return { type: 'cc', channel, data1: data[1], data2: data[2] };

    case 0xe0: // Pitch Bend
      if (data.length < 3) return null;
      // 14-bit value: LSB (data1) + MSB (data2) << 7
      const bendValue = data[1] | (data[2] << 7);
      return { type: 'pitchBend', channel, data1: 0, data2: bendValue };

    case 0xd0: // Channel Pressure (Aftertouch)
      if (data.length < 2) return null;
      return { type: 'channelPressure', channel, data1: data[1], data2: 0 };

    default:
      return { type: 'other', channel, data1: data[1] ?? 0, data2: data[2] ?? 0 };
  }
}

/**
 * Convert a 14-bit pitch bend value (0-16383) to semitones using the given range.
 * Center (8192) = 0 semitones.
 */
export function pitchBendToSemitones(bendValue: number, bendRange: number): number {
  const normalized = (bendValue - 8192) / 8192; // -1 to +1
  return normalized * bendRange;
}

// ---------------------------------------------------------------------------
// MPE Configuration
// ---------------------------------------------------------------------------

/**
 * Create a default MPE configuration (disabled).
 */
export function createDefaultMpeConfig(): MpeConfig {
  return { enabled: false, lowerZone: null, upperZone: null };
}

/**
 * Create a default per-note expression state.
 */
export function createDefaultExpression(): MpeNoteExpression {
  return { pitchBend: 0, slide: 0, pressure: 0 };
}

/**
 * Determine if a channel is a member channel in the given MPE config.
 * Returns the zone ('lower' | 'upper') or null if not a member channel.
 */
export function getMpeZoneForChannel(
  config: MpeConfig,
  channel: number,
): 'lower' | 'upper' | null {
  if (!config.enabled) return null;

  if (config.lowerZone && config.lowerZone.memberChannelCount > 0) {
    // Lower zone: master=0, members=1..memberChannelCount
    if (channel >= 1 && channel <= config.lowerZone.memberChannelCount) {
      return 'lower';
    }
  }

  if (config.upperZone && config.upperZone.memberChannelCount > 0) {
    // Upper zone: master=15, members=15-memberChannelCount..14
    const firstMember = 15 - config.upperZone.memberChannelCount;
    if (channel >= firstMember && channel <= 14) {
      return 'upper';
    }
  }

  return null;
}

/**
 * Check if a channel is a master channel in the given MPE config.
 */
export function isMasterChannel(config: MpeConfig, channel: number): boolean {
  if (!config.enabled) return false;
  if (config.lowerZone && channel === 0) return true;
  if (config.upperZone && channel === 15) return true;
  return false;
}

// ---------------------------------------------------------------------------
// MCM (MPE Configuration Message) Detection
// ---------------------------------------------------------------------------

/**
 * State machine for detecting MPE Configuration Messages.
 *
 * MCM is sent as an RPN sequence on the master channel:
 * 1. CC 101 = 0 (RPN MSB)
 * 2. CC 100 = 6 (RPN LSB) → RPN 0x0006
 * 3. CC 6 = N (Data Entry MSB) → N = number of member channels (0 = disable)
 *
 * We track RPN state per channel.
 */
export class MpeConfigDetector {
  private _config: MpeConfig;
  /** RPN state per channel: [rpnMSB, rpnLSB] */
  private _rpnState = new Map<number, [number, number]>();

  constructor(config?: MpeConfig) {
    this._config = config ?? createDefaultMpeConfig();
  }

  get config(): MpeConfig {
    return this._config;
  }

  /**
   * Process a CC message to detect MCM.
   * Returns true if the MPE config was updated.
   */
  processCC(channel: number, ccNumber: number, value: number): boolean {
    // Track RPN state
    if (ccNumber === 101) {
      // RPN MSB
      const state = this._rpnState.get(channel) ?? [0, 0];
      state[0] = value;
      this._rpnState.set(channel, state);
      return false;
    }

    if (ccNumber === 100) {
      // RPN LSB
      const state = this._rpnState.get(channel) ?? [0, 0];
      state[1] = value;
      this._rpnState.set(channel, state);
      return false;
    }

    if (ccNumber === 6) {
      // Data Entry MSB — check if current RPN is 0x0006 (MCM)
      const state = this._rpnState.get(channel);
      if (!state || state[0] !== 0 || state[1] !== MPE_RPN_NUMBER) {
        return false;
      }

      // MCM detected! Apply configuration.
      return this._applyMcm(channel, value);
    }

    return false;
  }

  private _applyMcm(masterChannel: number, memberCount: number): boolean {
    const clampedCount = Math.min(Math.max(memberCount, 0), 15);

    if (masterChannel === 0) {
      // Lower zone MCM
      if (clampedCount === 0) {
        this._config.lowerZone = null;
      } else {
        this._config.lowerZone = {
          masterChannel: 0,
          memberChannelCount: clampedCount,
        };
      }
    } else if (masterChannel === 15) {
      // Upper zone MCM
      if (clampedCount === 0) {
        this._config.upperZone = null;
      } else {
        this._config.upperZone = {
          masterChannel: 15,
          memberChannelCount: clampedCount,
        };
      }
    } else {
      // MCM on non-master channel is ignored per spec
      return false;
    }

    this._config.enabled = this._config.lowerZone !== null || this._config.upperZone !== null;

    // Reset RPN state for this channel
    this._rpnState.delete(masterChannel);

    return true;
  }
}
