import { describe, it, expect } from 'vitest';
import {
  resolveMidiNoteToAction,
  DEFAULT_MIDI_MAPPING,
  type MidiMapping,
} from '../../src/services/midiControllerService';

describe('resolveMidiNoteToAction', () => {
  const mapping = DEFAULT_MIDI_MAPPING;

  describe('clip grid mapping', () => {
    it('maps base note to first track, first scene', () => {
      const action = resolveMidiNoteToAction(36, mapping);
      expect(action).toEqual({ type: 'clip', trackIndex: 0, sceneIndex: 0 });
    });

    it('maps notes across tracks in a row', () => {
      // Note 36 = track 0, scene 0
      // Note 37 = track 1, scene 0
      // Note 43 = track 7, scene 0
      expect(resolveMidiNoteToAction(37, mapping)).toEqual({ type: 'clip', trackIndex: 1, sceneIndex: 0 });
      expect(resolveMidiNoteToAction(43, mapping)).toEqual({ type: 'clip', trackIndex: 7, sceneIndex: 0 });
    });

    it('maps notes to the next scene row', () => {
      // Note 44 = track 0, scene 1 (36 + 8)
      expect(resolveMidiNoteToAction(44, mapping)).toEqual({ type: 'clip', trackIndex: 0, sceneIndex: 1 });
      // Note 52 = track 0, scene 2 (36 + 16)
      expect(resolveMidiNoteToAction(52, mapping)).toEqual({ type: 'clip', trackIndex: 0, sceneIndex: 2 });
    });

    it('maps arbitrary grid position correctly', () => {
      // Note 36 + 2*8 + 3 = 55 = track 3, scene 2
      expect(resolveMidiNoteToAction(55, mapping)).toEqual({ type: 'clip', trackIndex: 3, sceneIndex: 2 });
    });
  });

  describe('scene launch mapping', () => {
    it('maps scene launch base note to scene 0', () => {
      expect(resolveMidiNoteToAction(82, mapping)).toEqual({ type: 'scene', sceneIndex: 0 });
    });

    it('maps subsequent notes to subsequent scenes', () => {
      expect(resolveMidiNoteToAction(83, mapping)).toEqual({ type: 'scene', sceneIndex: 1 });
      expect(resolveMidiNoteToAction(85, mapping)).toEqual({ type: 'scene', sceneIndex: 3 });
    });

    it('maps up to 16 scenes', () => {
      expect(resolveMidiNoteToAction(97, mapping)).toEqual({ type: 'scene', sceneIndex: 15 });
    });

    it('note 98 beyond scene range falls to clip grid', () => {
      // 98 is out of scene range (82-97) but in grid range (36-163)
      const action = resolveMidiNoteToAction(98, mapping);
      expect(action).toEqual({ type: 'clip', trackIndex: 6, sceneIndex: 7 });
    });
  });

  describe('stop all mapping', () => {
    it('maps stop-all note correctly', () => {
      expect(resolveMidiNoteToAction(120, mapping)).toEqual({ type: 'stop-all' });
    });
  });

  describe('unmapped notes', () => {
    it('returns null for notes below grid base', () => {
      expect(resolveMidiNoteToAction(35, mapping)).toBeNull();
    });

    it('returns null for notes in gap between grid and scene launch', () => {
      // Grid covers 36-163 (36 + 8*16 - 1), scene starts at 82
      // But scene range is 82-97, which overlaps with grid
      // Note 80 is in grid range (36 + 5*8 + 4 = 80)
      const action = resolveMidiNoteToAction(80, mapping);
      expect(action).toEqual({ type: 'clip', trackIndex: 4, sceneIndex: 5 });
    });
  });

  describe('custom mapping', () => {
    it('uses custom base note and columns', () => {
      const custom: MidiMapping = {
        gridBaseNote: 0,
        gridColumns: 4,
        sceneLaunchBaseNote: 64,
        stopAllNote: 127,
      };

      expect(resolveMidiNoteToAction(0, custom)).toEqual({ type: 'clip', trackIndex: 0, sceneIndex: 0 });
      expect(resolveMidiNoteToAction(5, custom)).toEqual({ type: 'clip', trackIndex: 1, sceneIndex: 1 });
      expect(resolveMidiNoteToAction(64, custom)).toEqual({ type: 'scene', sceneIndex: 0 });
      expect(resolveMidiNoteToAction(127, custom)).toEqual({ type: 'stop-all' });
    });
  });
});
