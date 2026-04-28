import { describe, it, expect, beforeEach } from 'vitest';
import { resolveNoteMapping, setMapping, clearMappings } from '../midiControllerService';

describe('MIDI controller note mapping', () => {
  beforeEach(() => {
    clearMappings();
  });

  describe('default mapping', () => {
    it('maps notes 0-63 to clip grid (row = note/8, col = note%8)', () => {
      const mapping0 = resolveNoteMapping(0);
      expect(mapping0).toEqual({ type: 'clip', trackIndex: 0, sceneIndex: 0 });

      const mapping9 = resolveNoteMapping(9);
      expect(mapping9).toEqual({ type: 'clip', trackIndex: 1, sceneIndex: 1 });

      const mapping63 = resolveNoteMapping(63);
      expect(mapping63).toEqual({ type: 'clip', trackIndex: 7, sceneIndex: 7 });
    });

    it('maps notes 64-71 to scene launches', () => {
      expect(resolveNoteMapping(64)).toEqual({ type: 'scene', sceneIndex: 0 });
      expect(resolveNoteMapping(67)).toEqual({ type: 'scene', sceneIndex: 3 });
      expect(resolveNoteMapping(71)).toEqual({ type: 'scene', sceneIndex: 7 });
    });

    it('maps note 127 to stop-all', () => {
      expect(resolveNoteMapping(127)).toEqual({ type: 'stop-all' });
    });

    it('returns null for unmapped notes', () => {
      expect(resolveNoteMapping(72)).toBeNull();
      expect(resolveNoteMapping(100)).toBeNull();
      expect(resolveNoteMapping(126)).toBeNull();
    });
  });

  describe('custom mappings', () => {
    it('overrides default mapping', () => {
      setMapping(0, { type: 'scene', sceneIndex: 5 });
      expect(resolveNoteMapping(0)).toEqual({ type: 'scene', sceneIndex: 5 });
    });

    it('clearMappings reverts to defaults', () => {
      setMapping(0, { type: 'stop-all' });
      clearMappings();
      expect(resolveNoteMapping(0)).toEqual({ type: 'clip', trackIndex: 0, sceneIndex: 0 });
    });

    it('can map arbitrary notes to stop-track', () => {
      setMapping(100, { type: 'stop-track', trackIndex: 2 });
      expect(resolveNoteMapping(100)).toEqual({ type: 'stop-track', trackIndex: 2 });
    });
  });
});
