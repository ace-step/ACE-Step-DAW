import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useProjectStore } from '../projectStore';

vi.mock('../../services/projectStorage', () => ({ saveProject: vi.fn() }));

describe('markers', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject({ name: 'Test', bpm: 120 });
  });

  it('addMarker appends markers in insertion order', () => {
    const store = useProjectStore.getState();
    store.addMarker(10, 'Chorus');
    store.addMarker(5, 'Verse');
    const markers = useProjectStore.getState().project!.markers!;
    expect(markers).toHaveLength(2);
    expect(markers[0].name).toBe('Chorus');
    expect(markers[0].time).toBe(10);
    expect(markers[1].name).toBe('Verse');
    expect(markers[1].time).toBe(5);
    expect(typeof markers[0].id).toBe('string');
    expect(markers[0].color.length).toBeGreaterThan(0);
  });

  it('removeMarker deletes a marker by id', () => {
    const store = useProjectStore.getState();
    store.addMarker(10, 'Chorus');
    const markerId = useProjectStore.getState().project!.markers![0].id;
    store.removeMarker(markerId);
    expect(useProjectStore.getState().project!.markers!).toHaveLength(0);
  });

  it('updateMarker patches name, time, and color in place', () => {
    const store = useProjectStore.getState();
    store.addMarker(5, 'Intro');
    store.addMarker(20, 'Bridge');
    const markers = useProjectStore.getState().project!.markers!;
    const bridgeId = markers[1].id;
    store.updateMarker(bridgeId, { time: 2, name: 'Pre-Intro', color: '#000000' });
    const updated = useProjectStore.getState().project!.markers!;
    expect(updated).toHaveLength(2);
    expect(updated[0].name).toBe('Intro');
    expect(updated[1].id).toBe(bridgeId);
    expect(updated[1].name).toBe('Pre-Intro');
    expect(updated[1].time).toBe(2);
    expect(updated[1].color).toBe('#000000');
  });
});
