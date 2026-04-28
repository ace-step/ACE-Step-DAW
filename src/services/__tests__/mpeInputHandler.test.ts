import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MpeInputHandler } from '../mpeInputHandler';
import { MpeZoneManager } from '../mpeService';

describe('MpeInputHandler', () => {
  let zoneMgr: MpeZoneManager;
  let handler: MpeInputHandler;

  beforeEach(() => {
    zoneMgr = new MpeZoneManager();
    zoneMgr.configureLowerZone(5);
    handler = new MpeInputHandler(zoneMgr);
  });

  describe('MIDI message dispatch', () => {
    it('dispatches note-on to zone manager', () => {
      handler.handleRawMessage(new Uint8Array([0x91, 60, 100])); // ch2, note 60, vel 100
      const notes = zoneMgr.getActiveNotes();
      expect(notes).toHaveLength(1);
      expect(notes[0]).toMatchObject({ channel: 1, pitch: 60, velocity: 100 });
    });

    it('dispatches note-off to zone manager', () => {
      handler.handleRawMessage(new Uint8Array([0x91, 60, 100]));
      handler.handleRawMessage(new Uint8Array([0x81, 60, 0]));
      expect(zoneMgr.getActiveNotes()).toHaveLength(0);
    });

    it('dispatches pitch bend to zone manager', () => {
      handler.handleRawMessage(new Uint8Array([0x91, 60, 100]));
      // Pitch bend on ch2: LSB=0, MSB=96 → (96<<7)|0 - 8192 = 4096
      handler.handleRawMessage(new Uint8Array([0xE1, 0, 96]));
      expect(zoneMgr.getActiveNotes()[0].pitchBend).toBe(4096);
    });

    it('dispatches CC74 (timbre) to zone manager', () => {
      handler.handleRawMessage(new Uint8Array([0x91, 60, 100]));
      handler.handleRawMessage(new Uint8Array([0xB1, 74, 120]));
      expect(zoneMgr.getActiveNotes()[0].timbre).toBe(120);
    });

    it('dispatches channel pressure to zone manager', () => {
      handler.handleRawMessage(new Uint8Array([0x91, 60, 100]));
      handler.handleRawMessage(new Uint8Array([0xD1, 100]));
      expect(zoneMgr.getActiveNotes()[0].pressure).toBe(100);
    });

    it('dispatches master channel pitch bend', () => {
      // Pitch bend on ch1 (master) → master pitch bend
      handler.handleRawMessage(new Uint8Array([0xE0, 0, 80]));
      // (80<<7)|0 - 8192 = 2048
      expect(zoneMgr.getMasterPitchBend('lower')).toBe(2048);
    });
  });

  describe('MCM detection', () => {
    it('detects MPE Configuration Message (RPN 6 on ch1)', () => {
      const freshMgr = new MpeZoneManager();
      const freshHandler = new MpeInputHandler(freshMgr);
      expect(freshMgr.isMpeActive()).toBe(false);

      // Send RPN 0,6 then Data Entry
      // CC 101 (RPN MSB) = 0
      freshHandler.handleRawMessage(new Uint8Array([0xB0, 101, 0]));
      // CC 100 (RPN LSB) = 6
      freshHandler.handleRawMessage(new Uint8Array([0xB0, 100, 6]));
      // CC 6 (Data Entry MSB) = 5 → 5 member channels
      freshHandler.handleRawMessage(new Uint8Array([0xB0, 6, 5]));

      expect(freshMgr.isMpeActive()).toBe(true);
      expect(freshMgr.getLowerZone()!.memberCount).toBe(5);
    });

    it('detects upper zone MCM (RPN 6 on ch16)', () => {
      const freshMgr = new MpeZoneManager();
      const freshHandler = new MpeInputHandler(freshMgr);

      // CC 101 on ch16
      freshHandler.handleRawMessage(new Uint8Array([0xBF, 101, 0]));
      // CC 100 on ch16
      freshHandler.handleRawMessage(new Uint8Array([0xBF, 100, 6]));
      // CC 6 on ch16 = 3 members
      freshHandler.handleRawMessage(new Uint8Array([0xBF, 6, 3]));

      expect(freshMgr.getUpperZone()!.memberCount).toBe(3);
    });
  });

  describe('event callbacks', () => {
    it('fires onNoteOn callback with expression state', () => {
      const callback = vi.fn();
      handler.onNoteOn = callback;
      handler.handleRawMessage(new Uint8Array([0x91, 60, 100]));
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ channel: 1, pitch: 60, velocity: 100 }),
      );
    });

    it('fires onNoteOff callback', () => {
      const callback = vi.fn();
      handler.onNoteOff = callback;
      handler.handleRawMessage(new Uint8Array([0x91, 60, 100]));
      handler.handleRawMessage(new Uint8Array([0x81, 60, 0]));
      expect(callback).toHaveBeenCalledWith(1, 60);
    });

    it('fires onExpressionChange for pitch bend', () => {
      const callback = vi.fn();
      handler.onExpressionChange = callback;
      handler.handleRawMessage(new Uint8Array([0x91, 60, 100]));
      handler.handleRawMessage(new Uint8Array([0xE1, 0, 96]));
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ channel: 1, pitchBend: 4096 }),
        'pitchBend',
      );
    });

    it('fires onExpressionChange for timbre (CC74)', () => {
      const callback = vi.fn();
      handler.onExpressionChange = callback;
      handler.handleRawMessage(new Uint8Array([0x91, 60, 100]));
      handler.handleRawMessage(new Uint8Array([0xB1, 74, 120]));
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ channel: 1, timbre: 120 }),
        'timbre',
      );
    });

    it('fires onExpressionChange for pressure', () => {
      const callback = vi.fn();
      handler.onExpressionChange = callback;
      handler.handleRawMessage(new Uint8Array([0x91, 60, 100]));
      handler.handleRawMessage(new Uint8Array([0xD1, 100]));
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ channel: 1, pressure: 100 }),
        'pressure',
      );
    });
  });
});
