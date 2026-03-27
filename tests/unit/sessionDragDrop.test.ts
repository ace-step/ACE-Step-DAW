import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectStore } from '../../src/store/projectStore';
import type { SessionClipSlot } from '../../src/types/project';

vi.mock('../../src/services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

function addTrackWithClips(trackType: 'drums' | 'bass' | 'vocals', clipCount: number) {
  const store = useProjectStore.getState();
  const track = store.addTrack(trackType);
  const clips = [];
  for (let i = 0; i < clipCount; i++) {
    clips.push(
      store.addClip(track.id, {
        startTime: i * 2,
        duration: 2,
        prompt: `${trackType} clip ${i + 1}`,
        globalCaption: '',
        lyrics: '',
        source: 'uploaded',
      }),
    );
  }
  return { track, clips };
}

function getSlot(trackId: string, sceneIndex: number): SessionClipSlot | undefined {
  const session = useProjectStore.getState().project?.session;
  if (!session) return undefined;
  const scene = session.scenes[sceneIndex];
  if (!scene) return undefined;
  return session.slots.find((s) => s.trackId === trackId && s.sceneId === scene.id);
}

describe('session drag-and-drop store actions', () => {
  beforeEach(() => {
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useProjectStore.getState().createProject({ bpm: 120, timeSignature: 4 });
  });

  describe('moveSessionSlotClip', () => {
    it('moves a clip from one slot to an empty slot on the same track', () => {
      const { track, clips } = addTrackWithClips('drums', 1);
      const sourceSlot = getSlot(track.id, 0);
      const targetSlot = getSlot(track.id, 1);
      expect(sourceSlot?.clipId).toBe(clips[0].id);
      expect(targetSlot?.clipId).toBeNull();

      useProjectStore.getState().moveSessionSlotClip(sourceSlot!.id, targetSlot!.id);

      const updatedSource = getSlot(track.id, 0);
      const updatedTarget = getSlot(track.id, 1);
      expect(updatedSource?.clipId).toBeNull();
      expect(updatedTarget?.clipId).toBe(clips[0].id);
    });

    it('swaps clips between two occupied slots', () => {
      const { track, clips } = addTrackWithClips('drums', 2);
      const slotA = getSlot(track.id, 0);
      const slotB = getSlot(track.id, 1);
      expect(slotA?.clipId).toBe(clips[0].id);
      expect(slotB?.clipId).toBe(clips[1].id);

      useProjectStore.getState().moveSessionSlotClip(slotA!.id, slotB!.id);

      const updatedA = getSlot(track.id, 0);
      const updatedB = getSlot(track.id, 1);
      expect(updatedA?.clipId).toBe(clips[1].id);
      expect(updatedB?.clipId).toBe(clips[0].id);
    });

    it('moves a clip across different tracks', () => {
      const drums = addTrackWithClips('drums', 1);
      const bass = addTrackWithClips('bass', 0);
      const sourceSlot = getSlot(drums.track.id, 0);
      const targetSlot = getSlot(bass.track.id, 0);
      expect(sourceSlot?.clipId).toBe(drums.clips[0].id);
      expect(targetSlot?.clipId).toBeNull();

      useProjectStore.getState().moveSessionSlotClip(sourceSlot!.id, targetSlot!.id);

      const updatedSource = getSlot(drums.track.id, 0);
      const updatedTarget = getSlot(bass.track.id, 0);
      expect(updatedSource?.clipId).toBeNull();
      expect(updatedTarget?.clipId).toBe(drums.clips[0].id);
    });

    it('does nothing when source and target are the same slot', () => {
      const { track, clips } = addTrackWithClips('drums', 1);
      const slot = getSlot(track.id, 0);

      useProjectStore.getState().moveSessionSlotClip(slot!.id, slot!.id);

      const updated = getSlot(track.id, 0);
      expect(updated?.clipId).toBe(clips[0].id);
    });

    it('does nothing when source slot has no clip', () => {
      const { track } = addTrackWithClips('drums', 1);
      const emptySlot = getSlot(track.id, 1);
      const occupiedSlot = getSlot(track.id, 0);

      useProjectStore.getState().moveSessionSlotClip(emptySlot!.id, occupiedSlot!.id);

      // Nothing should change
      const updated0 = getSlot(track.id, 0);
      const updated1 = getSlot(track.id, 1);
      expect(updated0?.clipId).not.toBeNull();
      expect(updated1?.clipId).toBeNull();
    });

    it('supports undo after move', () => {
      const { track, clips } = addTrackWithClips('drums', 1);
      const sourceSlot = getSlot(track.id, 0);
      const targetSlot = getSlot(track.id, 1);

      useProjectStore.getState().moveSessionSlotClip(sourceSlot!.id, targetSlot!.id);

      // Verify the move happened
      expect(getSlot(track.id, 0)?.clipId).toBeNull();
      expect(getSlot(track.id, 1)?.clipId).toBe(clips[0].id);

      // Undo
      useProjectStore.getState().undo();

      expect(getSlot(track.id, 0)?.clipId).toBe(clips[0].id);
      expect(getSlot(track.id, 1)?.clipId).toBeNull();
    });
  });

  describe('reorderSessionScenes', () => {
    it('moves a scene from index 0 to index 2', () => {
      // Default project has 4 scenes; adding clips just populates slots
      addTrackWithClips('drums', 3);
      const sessionBefore = useProjectStore.getState().project?.session;
      const sceneCount = sessionBefore!.scenes.length;
      expect(sceneCount).toBe(4); // default scene count
      const sceneIds = sessionBefore!.scenes.map((s) => s.id);

      useProjectStore.getState().reorderSessionScenes(0, 2);

      const sessionAfter = useProjectStore.getState().project?.session;
      const reorderedIds = sessionAfter!.scenes.map((s) => s.id);
      // Original: [A, B, C, D], after moving 0->2: [B, C, A, D]
      expect(reorderedIds).toEqual([sceneIds[1], sceneIds[2], sceneIds[0], sceneIds[3]]);
      // Indices should be renumbered
      expect(sessionAfter!.scenes.map((s) => s.index)).toEqual([0, 1, 2, 3]);
    });

    it('moves a scene from index 2 to index 0', () => {
      addTrackWithClips('drums', 3);
      const sessionBefore = useProjectStore.getState().project?.session;
      const sceneIds = sessionBefore!.scenes.map((s) => s.id);

      useProjectStore.getState().reorderSessionScenes(2, 0);

      const sessionAfter = useProjectStore.getState().project?.session;
      const reorderedIds = sessionAfter!.scenes.map((s) => s.id);
      // Original: [A, B, C, D], after moving 2->0: [C, A, B, D]
      expect(reorderedIds).toEqual([sceneIds[2], sceneIds[0], sceneIds[1], sceneIds[3]]);
    });

    it('does nothing when from and to are the same', () => {
      addTrackWithClips('drums', 3);
      const sessionBefore = useProjectStore.getState().project?.session;
      const sceneIds = sessionBefore!.scenes.map((s) => s.id);

      useProjectStore.getState().reorderSessionScenes(1, 1);

      const sessionAfter = useProjectStore.getState().project?.session;
      expect(sessionAfter!.scenes.map((s) => s.id)).toEqual(sceneIds);
    });

    it('supports undo after reorder', () => {
      addTrackWithClips('drums', 3);
      const sessionBefore = useProjectStore.getState().project?.session;
      const sceneIdsBefore = sessionBefore!.scenes.map((s) => s.id);

      useProjectStore.getState().reorderSessionScenes(0, 2);

      // Verify reorder happened
      const sessionAfter = useProjectStore.getState().project?.session;
      expect(sessionAfter!.scenes.map((s) => s.id)).not.toEqual(sceneIdsBefore);

      // Undo
      useProjectStore.getState().undo();

      const sessionRestored = useProjectStore.getState().project?.session;
      expect(sessionRestored!.scenes.map((s) => s.id)).toEqual(sceneIdsBefore);
    });
  });
});
