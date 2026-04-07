/**
 * MpeInputHandler — bridges raw MIDI messages to the MpeZoneManager.
 *
 * Parses incoming MIDI data, routes messages to the zone manager,
 * detects MPE Configuration Messages (MCM via RPN 0,6), and fires
 * callbacks for note/expression events.
 *
 * @see https://github.com/ace-step/ACE-Step-DAW/issues/960
 */

import { parseMpeMessage, type MpeNoteState, type MpeZoneManager } from './mpeService';

export type ExpressionType = 'pitchBend' | 'timbre' | 'pressure';

export class MpeInputHandler {
  private _zoneMgr: MpeZoneManager;

  /** RPN state per channel for MCM detection. */
  private _rpnState = new Map<number, { msb: number; lsb: number }>();

  // ── Callbacks ──────────────────────────────────────────────────
  onNoteOn: ((note: MpeNoteState) => void) | null = null;
  onNoteOff: ((channel: number, pitch: number) => void) | null = null;
  onExpressionChange: ((note: MpeNoteState, type: ExpressionType) => void) | null = null;

  constructor(zoneManager: MpeZoneManager) {
    this._zoneMgr = zoneManager;
  }

  /**
   * Process a raw MIDI message (from MIDIMessageEvent.data).
   */
  handleRawMessage(data: Uint8Array): void {
    const msg = parseMpeMessage(data);
    if (!msg) return;

    const { type, channel, data1, data2 } = msg;
    const role = this._zoneMgr.getZoneForChannel(channel);

    switch (type) {
      case 'noteOn':
        this._zoneMgr.noteOn(channel, data1, data2);
        if (this.onNoteOn) {
          const notes = this._zoneMgr.getActiveNotes();
          const note = notes.find((n) => n.channel === channel && n.pitch === data1);
          if (note) this.onNoteOn(note);
        }
        break;

      case 'noteOff':
        this._zoneMgr.noteOff(channel, data1);
        this.onNoteOff?.(channel, data1);
        break;

      case 'pitchBend': {
        const bendValue = ((data2 << 7) | data1) - 8192;
        if (role === 'lower-master') {
          this._zoneMgr.setMasterPitchBend('lower', bendValue);
        } else if (role === 'upper-master') {
          this._zoneMgr.setMasterPitchBend('upper', bendValue);
        } else {
          this._zoneMgr.setPitchBend(channel, bendValue);
          this._fireExpressionChange(channel, 'pitchBend');
        }
        break;
      }

      case 'cc':
        this._handleCC(channel, data1, data2);
        break;

      case 'channelPressure':
        this._zoneMgr.setPressure(channel, data1);
        this._fireExpressionChange(channel, 'pressure');
        break;
    }
  }

  private _handleCC(channel: number, cc: number, value: number): void {
    if (cc === 74) {
      // CC74 = MPE timbre/slide
      this._zoneMgr.setTimbre(channel, value);
      this._fireExpressionChange(channel, 'timbre');
      return;
    }

    // RPN detection for MCM
    if (cc === 101) {
      // RPN MSB
      if (!this._rpnState.has(channel)) {
        this._rpnState.set(channel, { msb: 0, lsb: 0 });
      }
      this._rpnState.get(channel)!.msb = value;
      return;
    }

    if (cc === 100) {
      // RPN LSB
      if (!this._rpnState.has(channel)) {
        this._rpnState.set(channel, { msb: 0, lsb: 0 });
      }
      this._rpnState.get(channel)!.lsb = value;
      return;
    }

    if (cc === 6) {
      // Data Entry MSB — check if RPN is 0,6 (MCM)
      const rpn = this._rpnState.get(channel);
      if (rpn && rpn.msb === 0 && rpn.lsb === 6) {
        if (channel === 0) {
          this._zoneMgr.configureLowerZone(value);
        } else if (channel === 15) {
          this._zoneMgr.configureUpperZone(value);
        }
        this._rpnState.delete(channel);
      }
    }
  }

  private _fireExpressionChange(channel: number, expressionType: ExpressionType): void {
    if (!this.onExpressionChange) return;
    const notes = this._zoneMgr.getActiveNotes();
    const note = notes.find((n) => n.channel === channel);
    if (note) {
      this.onExpressionChange(note, expressionType);
    }
  }
}
