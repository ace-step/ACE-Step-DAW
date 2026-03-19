import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useProjectStore } from '../projectStore';

// Mock projectStorage to prevent IndexedDB calls during testing
vi.mock('../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

/** Helper: create a project with one track and one clip */
function seedProjectWithClip(): { trackId: string; clipId: string } {
  const store = useProjectStore.getState();
  store.createProject();
  const track = store.addTrack('vocals');
  store.addClip(track.id, {
    startTime: 0,
    duration: 4,
    prompt: 'test vocal',
    lyrics: '',
  });
  const project = useProjectStore.getState().project!;
  const clipId = project.tracks[0].clips[0].id;
  return { trackId: track.id, clipId };
}

describe('Comping / Take Lanes', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: null });
  });

  describe('addTake + selectTake', () => {
    it('adds takes to a clip and selects one exclusively', () => {
      const { clipId } = seedProjectWithClip();

      // Initially no takes
      const initial = useProjectStore.getState().project!.tracks[0].clips[0];
      expect(initial.takes).toBeUndefined();

      // Add two takes
      useProjectStore.getState().addTake(clipId, 'audio-key-1');
      useProjectStore.getState().addTake(clipId, 'audio-key-2');

      const afterAdd = useProjectStore.getState().project!.tracks[0].clips[0];
      expect(afterAdd.takes).toHaveLength(2);
      expect(afterAdd.takes![0].audioKey).toBe('audio-key-1');
      expect(afterAdd.takes![1].audioKey).toBe('audio-key-2');
      expect(afterAdd.takes![0].selected).toBe(false);
      expect(afterAdd.takes![1].selected).toBe(false);

      // Select the second take — only it should be selected
      const takeId = afterAdd.takes![1].id;
      useProjectStore.getState().selectTake(clipId, takeId);

      const afterSelect = useProjectStore.getState().project!.tracks[0].clips[0];
      expect(afterSelect.takes![0].selected).toBe(false);
      expect(afterSelect.takes![1].selected).toBe(true);
    });

    it('is a no-op when selectTake is called with an unknown takeId', () => {
      const { clipId } = seedProjectWithClip();

      useProjectStore.getState().addTake(clipId, 'audio-key-1');
      const beforeState = useProjectStore.getState().project!;

      // Call with a non-existent takeId — state should be unchanged
      useProjectStore.getState().selectTake(clipId, 'non-existent-id');

      const afterState = useProjectStore.getState().project!;
      // updatedAt should not have changed (no-op means no set() call)
      expect(afterState.updatedAt).toBe(beforeState.updatedAt);
      expect(afterState.tracks[0].clips[0].takes![0].selected).toBe(false);
    });
  });

  describe('deleteTake', () => {
    it('removes a take from a clip by id', () => {
      const { clipId } = seedProjectWithClip();

      useProjectStore.getState().addTake(clipId, 'audio-key-1');
      useProjectStore.getState().addTake(clipId, 'audio-key-2');

      const takes = useProjectStore.getState().project!.tracks[0].clips[0].takes!;
      expect(takes).toHaveLength(2);

      const idToDelete = takes[0].id;
      useProjectStore.getState().deleteTake(clipId, idToDelete);

      const afterDelete = useProjectStore.getState().project!.tracks[0].clips[0].takes!;
      expect(afterDelete).toHaveLength(1);
      expect(afterDelete[0].audioKey).toBe('audio-key-2');
    });

    it('is a no-op when deleting a take with an unknown id', () => {
      const { clipId } = seedProjectWithClip();

      useProjectStore.getState().addTake(clipId, 'audio-key-1');
      useProjectStore.getState().deleteTake(clipId, 'non-existent-id');

      const takes = useProjectStore.getState().project!.tracks[0].clips[0].takes!;
      expect(takes).toHaveLength(1);
    });
  });

  describe('toggleTakeLanes', () => {
    it('toggles showTakeLanes on a track between true and false', () => {
      const { trackId } = seedProjectWithClip();

      // Default: undefined (falsy)
      expect(useProjectStore.getState().project!.tracks[0].showTakeLanes).toBeFalsy();

      // Toggle on
      useProjectStore.getState().toggleTakeLanes(trackId);
      expect(useProjectStore.getState().project!.tracks[0].showTakeLanes).toBe(true);

      // Toggle off
      useProjectStore.getState().toggleTakeLanes(trackId);
      expect(useProjectStore.getState().project!.tracks[0].showTakeLanes).toBe(false);
    });
  });

  describe('undo history integration', () => {
    it('addTake is undoable', () => {
      const { clipId } = seedProjectWithClip();

      useProjectStore.getState().addTake(clipId, 'audio-key-1');
      expect(useProjectStore.getState().project!.tracks[0].clips[0].takes).toHaveLength(1);

      useProjectStore.getState().undo();
      expect(useProjectStore.getState().project!.tracks[0].clips[0].takes).toBeUndefined();
    });

    it('selectTake is undoable', () => {
      const { clipId } = seedProjectWithClip();
      useProjectStore.getState().addTake(clipId, 'audio-key-1');
      const takeId = useProjectStore.getState().project!.tracks[0].clips[0].takes![0].id;

      useProjectStore.getState().selectTake(clipId, takeId);
      expect(useProjectStore.getState().project!.tracks[0].clips[0].takes![0].selected).toBe(true);

      useProjectStore.getState().undo();
      expect(useProjectStore.getState().project!.tracks[0].clips[0].takes![0].selected).toBe(false);
    });

    it('deleteTake is undoable', () => {
      const { clipId } = seedProjectWithClip();
      useProjectStore.getState().addTake(clipId, 'audio-key-1');
      const takeId = useProjectStore.getState().project!.tracks[0].clips[0].takes![0].id;

      useProjectStore.getState().deleteTake(clipId, takeId);
      expect(useProjectStore.getState().project!.tracks[0].clips[0].takes).toHaveLength(0);

      useProjectStore.getState().undo();
      expect(useProjectStore.getState().project!.tracks[0].clips[0].takes).toHaveLength(1);
    });

    it('toggleTakeLanes is undoable', () => {
      const { trackId } = seedProjectWithClip();

      useProjectStore.getState().toggleTakeLanes(trackId);
      expect(useProjectStore.getState().project!.tracks[0].showTakeLanes).toBe(true);

      useProjectStore.getState().undo();
      expect(useProjectStore.getState().project!.tracks[0].showTakeLanes).toBeUndefined();
    });
  });
});
