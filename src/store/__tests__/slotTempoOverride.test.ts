import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useProjectStore } from '../projectStore';

vi.mock('../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

describe('Per-clip tempo and time signature overrides', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject();
    useProjectStore.getState().addTrack('audio');
  });

  function getSlots() {
    return useProjectStore.getState().project!.session!.slots;
  }

  function firstSlotId() {
    return getSlots()[0].id;
  }

  describe('setSessionSlotTempo', () => {
    it('sets a tempo override on a clip slot', () => {
      const id = firstSlotId();
      useProjectStore.getState().setSessionSlotTempo(id, 140);
      const slot = getSlots().find((s) => s.id === id);
      expect(slot?.tempo).toBe(140);
    });

    it('clears tempo when set to undefined', () => {
      const id = firstSlotId();
      useProjectStore.getState().setSessionSlotTempo(id, 140);
      expect(getSlots().find((s) => s.id === id)?.tempo).toBe(140);
      useProjectStore.getState().setSessionSlotTempo(id, undefined);
      expect(getSlots().find((s) => s.id === id)?.tempo).toBeUndefined();
    });

    it('does not affect other slots', () => {
      const slots = getSlots();
      useProjectStore.getState().setSessionSlotTempo(slots[0].id, 160);
      const updated = getSlots();
      expect(updated[0].tempo).toBe(160);
      expect(updated[1].tempo).toBeUndefined();
    });

    it('ignores unknown slot id', () => {
      const before = getSlots();
      useProjectStore.getState().setSessionSlotTempo('nonexistent', 120);
      expect(getSlots()).toEqual(before);
    });
  });

  describe('setSessionSlotTimeSignature', () => {
    it('sets a time signature override on a clip slot', () => {
      const id = firstSlotId();
      useProjectStore.getState().setSessionSlotTimeSignature(id, [3, 4]);
      const slot = getSlots().find((s) => s.id === id);
      expect(slot?.timeSignature).toEqual([3, 4]);
    });

    it('clears time signature when set to undefined', () => {
      const id = firstSlotId();
      useProjectStore.getState().setSessionSlotTimeSignature(id, [6, 8]);
      expect(getSlots().find((s) => s.id === id)?.timeSignature).toEqual([6, 8]);
      useProjectStore.getState().setSessionSlotTimeSignature(id, undefined);
      expect(getSlots().find((s) => s.id === id)?.timeSignature).toBeUndefined();
    });

    it('ignores unknown slot id', () => {
      const before = getSlots();
      useProjectStore.getState().setSessionSlotTimeSignature('nonexistent', [5, 4]);
      expect(getSlots()).toEqual(before);
    });
  });
});
