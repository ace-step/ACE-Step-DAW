import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useProjectStore } from '../projectStore';
import type { VideoClipData } from '../../types/project';

vi.mock('../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

const VIDEO_META: VideoClipData = {
  codec: 'h264',
  width: 1920,
  height: 1080,
  frameRate: 30,
  fileDuration: 120,
  sourceOffset: 0,
  indexedDbKey: 'video-key-1',
  hasAudioStream: false,
  gopSize: 15,
  isIntraOnly: false,
};

function setupProjectWithVideoClip(
  clipStart = 10,
  clipDuration = 30,
  sourceOffset = 0,
) {
  useProjectStore.setState({ project: null });
  useProjectStore.getState().createProject();

  const track = useProjectStore.getState().addVideoTrack()!;
  expect(track).toBeDefined();

  const clip = useProjectStore.getState().addVideoClip(track.id, {
    startTime: clipStart,
    duration: clipDuration,
    videoMeta: { ...VIDEO_META, sourceOffset },
  })!;
  expect(clip).toBeDefined();

  return { trackId: track.id, clipId: clip.id };
}

describe('Video clip editing (Phase 6)', () => {
  describe('splitVideoClip', () => {
    it('splits a video clip at a given time', () => {
      const { trackId, clipId } = setupProjectWithVideoClip(10, 30, 0);

      useProjectStore.getState().splitVideoClip(clipId, 25);

      const tracks = useProjectStore.getState().project!.tracks;
      const videoTrack = tracks.find(t => t.id === trackId)!;
      expect(videoTrack.clips).toHaveLength(2);

      const left = videoTrack.clips.find(c => c.id === clipId)!;
      expect(left.startTime).toBe(10);
      expect(left.duration).toBeCloseTo(15, 1);

      const right = videoTrack.clips.find(c => c.id !== clipId)!;
      expect(right.startTime).toBeCloseTo(25, 1);
      expect(right.duration).toBeCloseTo(15, 1);
      expect(right.videoMeta).toBeDefined();
      expect(right.videoMeta!.sourceOffset).toBeCloseTo(15, 1);
    });

    it('preserves sourceOffset when splitting', () => {
      const { trackId, clipId } = setupProjectWithVideoClip(10, 20, 5);

      useProjectStore.getState().splitVideoClip(clipId, 20);

      const videoTrack = useProjectStore.getState().project!.tracks.find(t => t.id === trackId)!;
      const right = videoTrack.clips.find(c => c.id !== clipId)!;
      // sourceOffset = 5 (original) + 10 (left duration) = 15
      expect(right.videoMeta!.sourceOffset).toBeCloseTo(15, 1);
    });

    it('does nothing when split time is outside clip', () => {
      const { trackId, clipId } = setupProjectWithVideoClip(10, 30, 0);

      useProjectStore.getState().splitVideoClip(clipId, 5);

      const videoTrack = useProjectStore.getState().project!.tracks.find(t => t.id === trackId)!;
      expect(videoTrack.clips).toHaveLength(1);
    });

    it('both clips reference same source file', () => {
      const { trackId, clipId } = setupProjectWithVideoClip(10, 30, 0);

      useProjectStore.getState().splitVideoClip(clipId, 25);

      const videoTrack = useProjectStore.getState().project!.tracks.find(t => t.id === trackId)!;
      expect(videoTrack.clips[0].videoMeta!.indexedDbKey).toBe('video-key-1');
      expect(videoTrack.clips[1].videoMeta!.indexedDbKey).toBe('video-key-1');
    });

    it('is undoable', () => {
      const { trackId, clipId } = setupProjectWithVideoClip(10, 30, 0);

      useProjectStore.getState().splitVideoClip(clipId, 25);
      expect(useProjectStore.getState().project!.tracks.find(t => t.id === trackId)!.clips).toHaveLength(2);

      useProjectStore.getState().undo();
      expect(useProjectStore.getState().project!.tracks.find(t => t.id === trackId)!.clips).toHaveLength(1);
    });
  });

  describe('trimVideoClip', () => {
    it('trims left edge', () => {
      const { trackId, clipId } = setupProjectWithVideoClip(10, 30, 0);

      useProjectStore.getState().trimVideoClip(clipId, 'left', 15);

      const clip = useProjectStore.getState().project!.tracks.find(t => t.id === trackId)!.clips[0];
      expect(clip.startTime).toBeCloseTo(15, 1);
      expect(clip.duration).toBeCloseTo(25, 1);
      expect(clip.videoMeta!.sourceOffset).toBeCloseTo(5, 1);
    });

    it('trims right edge', () => {
      const { trackId, clipId } = setupProjectWithVideoClip(10, 30, 0);

      useProjectStore.getState().trimVideoClip(clipId, 'right', 35);

      const clip = useProjectStore.getState().project!.tracks.find(t => t.id === trackId)!.clips[0];
      expect(clip.startTime).toBe(10);
      expect(clip.duration).toBeCloseTo(25, 1);
      expect(clip.videoMeta!.sourceOffset).toBe(0); // unchanged
    });

    it('is undoable', () => {
      const { trackId, clipId } = setupProjectWithVideoClip(10, 30, 0);

      useProjectStore.getState().trimVideoClip(clipId, 'left', 15);
      expect(useProjectStore.getState().project!.tracks.find(t => t.id === trackId)!.clips[0].startTime).toBeCloseTo(15, 1);

      useProjectStore.getState().undo();
      expect(useProjectStore.getState().project!.tracks.find(t => t.id === trackId)!.clips[0].startTime).toBe(10);
    });
  });
});
