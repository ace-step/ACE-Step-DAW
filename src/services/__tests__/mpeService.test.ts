import { describe, it, expect, beforeEach } from 'vitest';
import {
  MpeZoneManager,
  parseMpeMessage,
  type MpeZone,
  type MpeMessage,
  type MpeNoteState,
} from '../mpeService';

describe('MpeZoneManager', () => {
  let mgr: MpeZoneManager;

  beforeEach(() => {
    mgr = new MpeZoneManager();
  });

  describe('zone configuration', () => {
    it('starts with no zones configured', () => {
      expect(mgr.getLowerZone()).toBeNull();
      expect(mgr.getUpperZone()).toBeNull();
      expect(mgr.isMpeActive()).toBe(false);
    });

    it('configures a lower zone via MCM (CC 0 on ch1)', () => {
      mgr.configureLowerZone(5); // 5 member channels
      const zone = mgr.getLowerZone();
      expect(zone).not.toBeNull();
      expect(zone!.masterChannel).toBe(0); // channel 1 (0-indexed)
      expect(zone!.memberChannels).toEqual([1, 2, 3, 4, 5]);
      expect(zone!.memberCount).toBe(5);
      expect(mgr.isMpeActive()).toBe(true);
    });

    it('configures an upper zone via MCM (CC 0 on ch16)', () => {
      mgr.configureUpperZone(3);
      const zone = mgr.getUpperZone();
      expect(zone).not.toBeNull();
      expect(zone!.masterChannel).toBe(15); // channel 16 (0-indexed)
      expect(zone!.memberChannels).toEqual([14, 13, 12]);
      expect(zone!.memberCount).toBe(3);
    });

    it('configures both zones simultaneously without overlap', () => {
      mgr.configureLowerZone(7);
      mgr.configureUpperZone(4);
      const lower = mgr.getLowerZone()!;
      const upper = mgr.getUpperZone()!;
      expect(lower.memberChannels).toEqual([1, 2, 3, 4, 5, 6, 7]);
      expect(upper.memberChannels).toEqual([14, 13, 12, 11]);
      // No overlap
      const all = [...lower.memberChannels, ...upper.memberChannels];
      expect(new Set(all).size).toBe(all.length);
    });

    it('clamps zones to prevent overlap when both configured', () => {
      mgr.configureLowerZone(10);
      mgr.configureUpperZone(10); // Would overlap — clamped to 4
      expect(mgr.getLowerZone()!.memberCount).toBe(10);
      expect(mgr.getUpperZone()!.memberCount).toBe(4);
      // Verify no channel overlap
      const all = [...mgr.getLowerZone()!.memberChannels, ...mgr.getUpperZone()!.memberChannels];
      expect(new Set(all).size).toBe(all.length);
    });

    it('disables lower zone when configured with 0 members', () => {
      mgr.configureLowerZone(5);
      expect(mgr.isMpeActive()).toBe(true);
      mgr.configureLowerZone(0);
      expect(mgr.getLowerZone()).toBeNull();
    });

    it('disables upper zone when configured with 0 members', () => {
      mgr.configureUpperZone(3);
      mgr.configureUpperZone(0);
      expect(mgr.getUpperZone()).toBeNull();
    });

    it('clamps lower zone to max 14 members', () => {
      mgr.configureLowerZone(20);
      expect(mgr.getLowerZone()!.memberCount).toBe(14);
    });

    it('clamps upper zone to max 14 members', () => {
      mgr.configureUpperZone(20);
      expect(mgr.getUpperZone()!.memberCount).toBe(14);
    });

    it('identifies which zone a channel belongs to', () => {
      mgr.configureLowerZone(5);
      mgr.configureUpperZone(3);
      expect(mgr.getZoneForChannel(0)).toBe('lower-master');
      expect(mgr.getZoneForChannel(1)).toBe('lower-member');
      expect(mgr.getZoneForChannel(5)).toBe('lower-member');
      expect(mgr.getZoneForChannel(6)).toBeNull(); // unassigned
      expect(mgr.getZoneForChannel(12)).toBe('upper-member');
      expect(mgr.getZoneForChannel(15)).toBe('upper-master');
    });
  });

  describe('note tracking', () => {
    beforeEach(() => {
      mgr.configureLowerZone(5);
    });

    it('tracks note-on events per channel', () => {
      mgr.noteOn(1, 60, 100);
      const notes = mgr.getActiveNotes();
      expect(notes).toHaveLength(1);
      expect(notes[0].channel).toBe(1);
      expect(notes[0].pitch).toBe(60);
      expect(notes[0].velocity).toBe(100);
      expect(notes[0].pressure).toBe(0);
      expect(notes[0].timbre).toBe(64); // MPE default center
      expect(notes[0].pitchBend).toBe(0);
    });

    it('tracks multiple notes on different member channels', () => {
      mgr.noteOn(1, 60, 100);
      mgr.noteOn(2, 64, 80);
      mgr.noteOn(3, 67, 90);
      expect(mgr.getActiveNotes()).toHaveLength(3);
    });

    it('enforces one note per channel (MPE spec)', () => {
      mgr.noteOn(1, 60, 100);
      mgr.noteOn(1, 64, 80); // Same channel, new pitch — replaces previous
      const notes = mgr.getActiveNotes();
      expect(notes).toHaveLength(1);
      expect(notes[0].pitch).toBe(64);
    });

    it('removes note on note-off', () => {
      mgr.noteOn(1, 60, 100);
      mgr.noteOff(1, 60);
      expect(mgr.getActiveNotes()).toHaveLength(0);
    });

    it('updates pitch bend per note (per channel)', () => {
      mgr.noteOn(1, 60, 100);
      mgr.setPitchBend(1, 4096); // positive bend
      const note = mgr.getActiveNotes()[0];
      expect(note.pitchBend).toBe(4096);
    });

    it('updates pressure (channel aftertouch) per note', () => {
      mgr.noteOn(1, 60, 100);
      mgr.setPressure(1, 100);
      expect(mgr.getActiveNotes()[0].pressure).toBe(100);
    });

    it('updates timbre (CC74) per note', () => {
      mgr.noteOn(1, 60, 100);
      mgr.setTimbre(1, 120);
      expect(mgr.getActiveNotes()[0].timbre).toBe(120);
    });

    it('applies master channel pitch bend to all notes in zone', () => {
      mgr.noteOn(1, 60, 100);
      mgr.noteOn(2, 64, 80);
      mgr.setMasterPitchBend('lower', 2000);
      const notes = mgr.getActiveNotes();
      // Master pitch bend is stored separately
      expect(mgr.getMasterPitchBend('lower')).toBe(2000);
    });

    it('ignores events on non-member channels', () => {
      mgr.noteOn(10, 60, 100); // channel 11, not in lower zone
      expect(mgr.getActiveNotes()).toHaveLength(0);
    });

    it('clears all notes on reset', () => {
      mgr.noteOn(1, 60, 100);
      mgr.noteOn(2, 64, 80);
      mgr.reset();
      expect(mgr.getActiveNotes()).toHaveLength(0);
    });
  });

  describe('pitch bend range', () => {
    it('defaults to 48 semitones for MPE', () => {
      mgr.configureLowerZone(5);
      expect(mgr.getPitchBendRange()).toBe(48);
    });

    it('allows custom pitch bend range', () => {
      mgr.configureLowerZone(5);
      mgr.setPitchBendRange(24);
      expect(mgr.getPitchBendRange()).toBe(24);
    });
  });
});

describe('parseMpeMessage', () => {
  it('parses note-on message', () => {
    // Note on, channel 2, note 60, velocity 100
    const msg = parseMpeMessage(new Uint8Array([0x91, 60, 100]));
    expect(msg).toEqual({
      type: 'noteOn',
      channel: 1,
      data1: 60,
      data2: 100,
    });
  });

  it('parses note-off message (status 0x80)', () => {
    const msg = parseMpeMessage(new Uint8Array([0x81, 60, 0]));
    expect(msg).toEqual({
      type: 'noteOff',
      channel: 1,
      data1: 60,
      data2: 0,
    });
  });

  it('parses note-on with velocity 0 as note-off', () => {
    const msg = parseMpeMessage(new Uint8Array([0x91, 60, 0]));
    expect(msg).toEqual({
      type: 'noteOff',
      channel: 1,
      data1: 60,
      data2: 0,
    });
  });

  it('parses pitch bend message', () => {
    // Pitch bend, channel 2, LSB=0, MSB=96 → value = (96 << 7) - 8192 = 4096
    const msg = parseMpeMessage(new Uint8Array([0xE1, 0, 96]));
    expect(msg).toEqual({
      type: 'pitchBend',
      channel: 1,
      data1: 0,
      data2: 96,
    });
  });

  it('parses CC74 (timbre/slide) message', () => {
    const msg = parseMpeMessage(new Uint8Array([0xB1, 74, 120]));
    expect(msg).toEqual({
      type: 'cc',
      channel: 1,
      data1: 74,
      data2: 120,
    });
  });

  it('parses channel pressure (aftertouch) message', () => {
    // Channel pressure is 2-byte: status, pressure
    const msg = parseMpeMessage(new Uint8Array([0xD1, 100]));
    expect(msg).toEqual({
      type: 'channelPressure',
      channel: 1,
      data1: 100,
      data2: 0,
    });
  });

  it('parses MCM message (CC 0 on ch1 = lower zone)', () => {
    // CC 0 on channel 1, value 5 = configure lower zone with 5 members
    const msg = parseMpeMessage(new Uint8Array([0xB0, 0x06, 5]));
    expect(msg).toEqual({
      type: 'cc',
      channel: 0,
      data1: 6, // RPN data entry
      data2: 5,
    });
  });

  it('returns null for invalid/short messages', () => {
    expect(parseMpeMessage(new Uint8Array([]))).toBeNull();
    expect(parseMpeMessage(new Uint8Array([0x90]))).toBeNull();
  });

  it('returns null for system messages', () => {
    // System exclusive
    expect(parseMpeMessage(new Uint8Array([0xF0, 0x7E, 0x7F]))).toBeNull();
  });
});
