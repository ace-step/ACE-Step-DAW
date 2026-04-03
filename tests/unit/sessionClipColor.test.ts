import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectStore } from '../../src/store/projectStore';

vi.mock('../../src/services/projectStorage', () => ({ saveProject: vi.fn() }));

describe('session clip color', () => {
  beforeEach(() => {
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useProjectStore.getState().createProject({ bpm: 120, timeSignature: 4 });
  });

  it('new slots have null color by default', () => {
    const store = useProjectStore.getState();
    store.addTrack('drums');
    const session = useProjectStore.getState().project?.session;
    const slots = session?.slots ?? [];
    expect(slots.length).toBeGreaterThan(0);
    for (const slot of slots) {
      expect(slot.color).toBeNull();
    }
  });

  it('setSessionSlotColor updates slot color', () => {
    const store = useProjectStore.getState();
    store.addTrack('drums');
    const session = useProjectStore.getState().project?.session;
    const slot = session?.slots[0];
    expect(slot).not.toBeUndefined();

    useProjectStore.getState().setSessionSlotColor(slot!.id, '#ef4444');
    const updated = useProjectStore.getState().project?.session?.slots.find(s => s.id === slot!.id);
    expect(updated?.color).toBe('#ef4444');
  });

  it('setSessionSlotColor can reset to null', () => {
    const store = useProjectStore.getState();
    store.addTrack('drums');
    const session = useProjectStore.getState().project?.session;
    const slot = session?.slots[0];
    expect(slot).not.toBeUndefined();

    useProjectStore.getState().setSessionSlotColor(slot!.id, '#ef4444');
    useProjectStore.getState().setSessionSlotColor(slot!.id, null);
    const updated = useProjectStore.getState().project?.session?.slots.find(s => s.id === slot!.id);
    expect(updated?.color).toBeNull();
  });

  it('setSessionSlotColor is a no-op for unknown slot id', () => {
    const store = useProjectStore.getState();
    store.addTrack('drums');
    const before = useProjectStore.getState().project?.updatedAt;

    useProjectStore.getState().setSessionSlotColor('nonexistent-id', '#ff0000');
    const after = useProjectStore.getState().project?.updatedAt;
    expect(after).toBe(before);
  });
});
