import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useProjectStore } from '../projectStore';

vi.mock('../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

describe('Video markers (Phase 7)', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject();
  });

  describe('addMarker with type', () => {
    it('adds a marker with default type generic', () => {
      useProjectStore.getState().addMarker(10, 'Scene 1');
      const markers = useProjectStore.getState().project!.markers!;
      expect(markers).toHaveLength(1);
      expect(markers[0].time).toBe(10);
      expect(markers[0].name).toBe('Scene 1');
      expect(markers[0].type).toBe('generic');
    });

    it('markers are persisted in project', () => {
      useProjectStore.getState().addMarker(5, 'Intro');
      useProjectStore.getState().addMarker(20, 'Verse');
      const markers = useProjectStore.getState().project!.markers!;
      expect(markers).toHaveLength(2);
    });
  });

  describe('addTypedMarker', () => {
    it('adds a scene marker with type and color', () => {
      useProjectStore.getState().addTypedMarker(15, 'Cut 1', 'scene');
      const markers = useProjectStore.getState().project!.markers!;
      expect(markers).toHaveLength(1);
      expect(markers[0].type).toBe('scene');
      expect(markers[0].color).toBe('#3b82f6'); // blue for scene
    });

    it('adds a cue marker', () => {
      useProjectStore.getState().addTypedMarker(10, 'Dialog', 'cue');
      const m = useProjectStore.getState().project!.markers![0];
      expect(m.type).toBe('cue');
      expect(m.color).toBe('#facc15'); // yellow for cue
    });

    it('adds a hit marker', () => {
      useProjectStore.getState().addTypedMarker(8, 'Hit', 'hit');
      const m = useProjectStore.getState().project!.markers![0];
      expect(m.type).toBe('hit');
      expect(m.color).toBe('#ef4444'); // red for hit
    });

    it('adds a generic marker', () => {
      useProjectStore.getState().addTypedMarker(5, 'Note', 'generic');
      const m = useProjectStore.getState().project!.markers![0];
      expect(m.type).toBe('generic');
      expect(m.color).toBe('#ffffff');
    });

    it('is undoable', () => {
      useProjectStore.getState().addTypedMarker(10, 'Test', 'scene');
      expect(useProjectStore.getState().project!.markers).toHaveLength(1);
      useProjectStore.getState().undo();
      expect(useProjectStore.getState().project!.markers ?? []).toHaveLength(0);
    });
  });

  describe('addSceneMarkers (batch)', () => {
    it('adds multiple scene markers from detected cuts', () => {
      useProjectStore.getState().addSceneMarkers([5, 15, 30]);
      const markers = useProjectStore.getState().project!.markers!;
      expect(markers).toHaveLength(3);
      expect(markers.every(m => m.type === 'scene')).toBe(true);
      expect(markers.map(m => m.time)).toEqual([5, 15, 30]);
    });

    it('auto-labels markers as Scene 1, Scene 2, etc.', () => {
      useProjectStore.getState().addSceneMarkers([10, 20, 30]);
      const markers = useProjectStore.getState().project!.markers!;
      expect(markers[0].name).toBe('Scene 1');
      expect(markers[1].name).toBe('Scene 2');
      expect(markers[2].name).toBe('Scene 3');
    });

    it('is undoable as a single operation', () => {
      useProjectStore.getState().addSceneMarkers([5, 10, 15, 20]);
      expect(useProjectStore.getState().project!.markers).toHaveLength(4);
      useProjectStore.getState().undo();
      expect(useProjectStore.getState().project!.markers ?? []).toHaveLength(0);
    });

    it('does nothing for empty array', () => {
      useProjectStore.getState().addSceneMarkers([]);
      expect(useProjectStore.getState().project!.markers ?? []).toHaveLength(0);
    });
  });

  describe('updateMarker with type', () => {
    it('updates marker type', () => {
      useProjectStore.getState().addTypedMarker(10, 'Test', 'generic');
      const id = useProjectStore.getState().project!.markers![0].id;
      useProjectStore.getState().updateMarker(id, { type: 'hit' });
      expect(useProjectStore.getState().project!.markers![0].type).toBe('hit');
    });

    it('updates marker endTime for range markers', () => {
      useProjectStore.getState().addTypedMarker(10, 'Scene A', 'scene');
      const id = useProjectStore.getState().project!.markers![0].id;
      useProjectStore.getState().updateMarker(id, { endTime: 20 });
      expect(useProjectStore.getState().project!.markers![0].endTime).toBe(20);
    });
  });

  describe('marker serialization', () => {
    it('type and endTime survive JSON round-trip', () => {
      useProjectStore.getState().addTypedMarker(10, 'Scene', 'scene');
      const id = useProjectStore.getState().project!.markers![0].id;
      useProjectStore.getState().updateMarker(id, { endTime: 25 });

      const project = useProjectStore.getState().project!;
      const serialized = JSON.stringify(project);
      const deserialized = JSON.parse(serialized);

      const marker = deserialized.markers[0];
      expect(marker.type).toBe('scene');
      expect(marker.endTime).toBe(25);
      expect(marker.time).toBe(10);
      expect(marker.name).toBe('Scene');
    });
  });
});
