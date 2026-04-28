import { describe, it, expect, beforeEach } from 'vitest';
import { useMidiAiStore } from '../midiAiStore';
import type { MidiAiVariation } from '../midiAiStore';

function resetStore() {
  useMidiAiStore.getState().closePanel();
}

const makeVariation = (id: string, score = 0.8): MidiAiVariation => ({
  id,
  notes: [{ id: `note-${id}`, pitch: 60, startBeat: 0, durationBeats: 1, velocity: 100 }],
  score,
  model: 'anticipatory-music-transformer',
});

describe('midiAiStore', () => {
  beforeEach(() => resetStore());

  describe('panel management', () => {
    it('opens panel with target track and clip', () => {
      useMidiAiStore.getState().openPanel('track-1', 'clip-1');
      const state = useMidiAiStore.getState();
      expect(state.panelOpen).toBe(true);
      expect(state.targetTrackId).toBe('track-1');
      expect(state.targetClipId).toBe('clip-1');
      expect(state.status).toBe('idle');
    });

    it('closes panel and resets state', () => {
      useMidiAiStore.getState().openPanel('track-1', 'clip-1');
      useMidiAiStore.getState().setSelection(4, 8);
      useMidiAiStore.getState().lockNotes(['note-1']);
      useMidiAiStore.getState().closePanel();

      const state = useMidiAiStore.getState();
      expect(state.panelOpen).toBe(false);
      expect(state.targetTrackId).toBeNull();
      expect(state.targetClipId).toBeNull();
      expect(state.lockedNoteIds.size).toBe(0);
      expect(state.selectionStartBeat).toBeNull();
    });
  });

  describe('selection region', () => {
    it('sets selection with correct ordering', () => {
      useMidiAiStore.getState().setSelection(8, 4);
      const state = useMidiAiStore.getState();
      expect(state.selectionStartBeat).toBe(4);
      expect(state.selectionEndBeat).toBe(8);
    });

    it('clears selection', () => {
      useMidiAiStore.getState().setSelection(0, 4);
      useMidiAiStore.getState().clearSelection();
      expect(useMidiAiStore.getState().selectionStartBeat).toBeNull();
      expect(useMidiAiStore.getState().selectionEndBeat).toBeNull();
    });
  });

  describe('note locking', () => {
    it('toggles note lock state', () => {
      const { toggleNoteLock } = useMidiAiStore.getState();
      toggleNoteLock('note-1');
      expect(useMidiAiStore.getState().lockedNoteIds.has('note-1')).toBe(true);
      toggleNoteLock('note-1');
      expect(useMidiAiStore.getState().lockedNoteIds.has('note-1')).toBe(false);
    });

    it('locks multiple notes', () => {
      useMidiAiStore.getState().lockNotes(['n1', 'n2', 'n3']);
      const locked = useMidiAiStore.getState().lockedNoteIds;
      expect(locked.size).toBe(3);
      expect(locked.has('n1')).toBe(true);
      expect(locked.has('n2')).toBe(true);
      expect(locked.has('n3')).toBe(true);
    });

    it('unlocks specific notes', () => {
      useMidiAiStore.getState().lockNotes(['n1', 'n2', 'n3']);
      useMidiAiStore.getState().unlockNotes(['n2']);
      const locked = useMidiAiStore.getState().lockedNoteIds;
      expect(locked.size).toBe(2);
      expect(locked.has('n2')).toBe(false);
    });

    it('clears all locked notes', () => {
      useMidiAiStore.getState().lockNotes(['n1', 'n2']);
      useMidiAiStore.getState().clearLockedNotes();
      expect(useMidiAiStore.getState().lockedNoteIds.size).toBe(0);
    });
  });

  describe('generation parameters', () => {
    it('clamps temperature to 0-2 range', () => {
      useMidiAiStore.getState().setTemperature(3);
      expect(useMidiAiStore.getState().temperature).toBe(2);
      useMidiAiStore.getState().setTemperature(-1);
      expect(useMidiAiStore.getState().temperature).toBe(0);
      useMidiAiStore.getState().setTemperature(0.8);
      expect(useMidiAiStore.getState().temperature).toBe(0.8);
    });

    it('clamps numResults to 1-8 range', () => {
      useMidiAiStore.getState().setNumResults(0);
      expect(useMidiAiStore.getState().numResults).toBe(1);
      useMidiAiStore.getState().setNumResults(10);
      expect(useMidiAiStore.getState().numResults).toBe(8);
    });

    it('sets mode', () => {
      useMidiAiStore.getState().setMode('continue');
      expect(useMidiAiStore.getState().mode).toBe('continue');
    });

    it('sets model', () => {
      useMidiAiStore.getState().setModel('moonbeam');
      expect(useMidiAiStore.getState().model).toBe('moonbeam');
    });

    it('sets style', () => {
      useMidiAiStore.getState().setStyle('jazz');
      expect(useMidiAiStore.getState().style).toBe('jazz');
    });
  });

  describe('generation workflow', () => {
    it('transitions through idle -> generating -> previewing', () => {
      expect(useMidiAiStore.getState().status).toBe('idle');

      useMidiAiStore.getState().startGeneration();
      expect(useMidiAiStore.getState().status).toBe('generating');
      expect(useMidiAiStore.getState().variations).toHaveLength(0);

      const variations = [makeVariation('v1'), makeVariation('v2', 0.6)];
      useMidiAiStore.getState().setVariations(variations);
      expect(useMidiAiStore.getState().status).toBe('previewing');
      expect(useMidiAiStore.getState().variations).toHaveLength(2);
      expect(useMidiAiStore.getState().activeVariationIndex).toBe(0);
    });

    it('navigates between variations', () => {
      const variations = [makeVariation('v1'), makeVariation('v2'), makeVariation('v3')];
      useMidiAiStore.getState().setVariations(variations);

      useMidiAiStore.getState().nextVariation();
      expect(useMidiAiStore.getState().activeVariationIndex).toBe(1);

      useMidiAiStore.getState().nextVariation();
      expect(useMidiAiStore.getState().activeVariationIndex).toBe(2);

      // Should not go past last
      useMidiAiStore.getState().nextVariation();
      expect(useMidiAiStore.getState().activeVariationIndex).toBe(2);

      useMidiAiStore.getState().prevVariation();
      expect(useMidiAiStore.getState().activeVariationIndex).toBe(1);

      // Should not go below 0
      useMidiAiStore.getState().prevVariation();
      useMidiAiStore.getState().prevVariation();
      expect(useMidiAiStore.getState().activeVariationIndex).toBe(0);
    });

    it('sets active variation by index', () => {
      const variations = [makeVariation('v1'), makeVariation('v2')];
      useMidiAiStore.getState().setVariations(variations);
      useMidiAiStore.getState().setActiveVariation(1);
      expect(useMidiAiStore.getState().activeVariationIndex).toBe(1);

      // Out of range should not change
      useMidiAiStore.getState().setActiveVariation(5);
      expect(useMidiAiStore.getState().activeVariationIndex).toBe(1);
    });

    it('accepts current variation and returns it', () => {
      const variations = [makeVariation('v1'), makeVariation('v2')];
      useMidiAiStore.getState().setVariations(variations);
      useMidiAiStore.getState().setActiveVariation(1);

      const accepted = useMidiAiStore.getState().acceptVariation();
      expect(accepted).not.toBeNull();
      expect(accepted!.id).toBe('v2');
      expect(useMidiAiStore.getState().status).toBe('idle');
      expect(useMidiAiStore.getState().variations).toHaveLength(0);
    });

    it('rejects all variations', () => {
      useMidiAiStore.getState().setVariations([makeVariation('v1')]);
      useMidiAiStore.getState().rejectVariations();
      expect(useMidiAiStore.getState().status).toBe('idle');
      expect(useMidiAiStore.getState().variations).toHaveLength(0);
    });

    it('returns null when accepting with no variations', () => {
      const accepted = useMidiAiStore.getState().acceptVariation();
      expect(accepted).toBeNull();
    });

    it('returns idle when setting empty variations', () => {
      useMidiAiStore.getState().startGeneration();
      useMidiAiStore.getState().setVariations([]);
      expect(useMidiAiStore.getState().status).toBe('idle');
    });
  });

  describe('error handling', () => {
    it('sets error state', () => {
      useMidiAiStore.getState().setError('Connection failed');
      expect(useMidiAiStore.getState().status).toBe('error');
      expect(useMidiAiStore.getState().error).toBe('Connection failed');
    });

    it('resets from error state', () => {
      useMidiAiStore.getState().setError('Timeout');
      useMidiAiStore.getState().reset();
      expect(useMidiAiStore.getState().status).toBe('idle');
      expect(useMidiAiStore.getState().error).toBeNull();
    });
  });
});
