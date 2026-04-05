import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useProjectStore } from '../projectStore';
import type { Track } from '../../types/project';
import { TRACK_TYPE_CATALOG } from '../../constants/tracks';
import { isVideoTrack, isAudioTrack } from '../../utils/trackHelpers';
import { MAX_VIDEO_TRACKS } from '../../constants/defaults';

vi.mock('../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

describe('Video track support (Phase 1)', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject();
  });

  describe('Track creation', () => {
    it('creates a video track with trackType "video"', () => {
      const store = useProjectStore.getState();
      const track = store.addTrack('custom', 'video');

      expect(track).toBeDefined();
      expect(track.trackType).toBe('video');
      expect(track.trackName).toBe('custom');
    });

    it('video track has display name "Video"', () => {
      const store = useProjectStore.getState();
      const track = store.addTrack('custom', 'video', { displayName: 'Video' });

      expect(track.displayName).toBe('Video');
    });

    it('video track initializes without audio-related properties', () => {
      const store = useProjectStore.getState();
      const track = store.addTrack('custom', 'video', { displayName: 'Video' });

      // Video tracks should not have mixer/audio properties active
      expect(track.trackType).toBe('video');
      // Volume should still exist on the Track interface but video tracks
      // are excluded from audio routing by convention
      expect(track.clips).toEqual([]);
    });

    it('enforces maximum of 1 video track per project', () => {
      const store = useProjectStore.getState();
      const track1 = store.addVideoTrack();
      expect(track1).toBeDefined();

      const track2 = store.addVideoTrack();
      // Should return undefined or the existing track — not create a second
      expect(track2).toBeUndefined();

      // Verify only 1 video track exists
      const project = useProjectStore.getState().project!;
      const videoTracks = project.tracks.filter(t => t.trackType === 'video');
      expect(videoTracks).toHaveLength(1);
    });

    it('allows adding audio tracks after a video track', () => {
      const store = useProjectStore.getState();
      store.addVideoTrack();
      const audioTrack = store.addTrack('vocals', 'stems');

      expect(audioTrack).toBeDefined();
      expect(audioTrack.trackType).toBe('stems');
    });
  });

  describe('Video clip data', () => {
    it('video track supports video clips with metadata', () => {
      const store = useProjectStore.getState();
      const track = store.addVideoTrack()!;

      store.addVideoClip(track.id, {
        startTime: 0,
        duration: 30,
        videoMeta: {
          codec: 'h264',
          width: 1920,
          height: 1080,
          frameRate: 30,
          fileDuration: 30,
          sourceOffset: 0,
          indexedDbKey: 'video-file-1',
          hasAudioStream: true,
          gopSize: 30,
          isIntraOnly: false,
        },
      });

      const project = useProjectStore.getState().project!;
      const updatedTrack = project.tracks.find(t => t.id === track.id)!;
      expect(updatedTrack.clips).toHaveLength(1);
      expect(updatedTrack.clips[0].videoMeta).toBeDefined();
      expect(updatedTrack.clips[0].videoMeta!.codec).toBe('h264');
      expect(updatedTrack.clips[0].videoMeta!.width).toBe(1920);
      expect(updatedTrack.clips[0].videoMeta!.height).toBe(1080);
      expect(updatedTrack.clips[0].videoMeta!.frameRate).toBe(30);
    });
  });

  describe('Video track settings', () => {
    it('video track has default video settings', () => {
      const store = useProjectStore.getState();
      const track = store.addVideoTrack()!;

      expect(track.videoSettings).toBeDefined();
      expect(track.videoSettings!.previewSize).toBe('medium');
      expect(track.videoSettings!.showFilmstrip).toBe(true);
      expect(track.videoSettings!.showTimecodeOverlay).toBe(false);
      expect(track.videoSettings!.videoFollowsEdit).toBe(true);
    });
  });

  describe('Track type catalog', () => {
    it('TRACK_TYPE_CATALOG includes video type', () => {
      expect(TRACK_TYPE_CATALOG.video).toBeDefined();
      expect(TRACK_TYPE_CATALOG.video.type).toBe('video');
      expect(TRACK_TYPE_CATALOG.video.label).toBe('Video');
      expect(TRACK_TYPE_CATALOG.video.abbr).toBe('VID');
    });
  });

  describe('Video track exclusions', () => {
    it('isVideoTrack helper identifies video tracks', () => {
      const videoTrack = { trackType: 'video' } as Track;
      const audioTrack = { trackType: 'stems' } as Track;

      expect(isVideoTrack(videoTrack)).toBe(true);
      expect(isVideoTrack(audioTrack)).toBe(false);
    });

    it('isAudioTrack excludes video tracks', () => {
      const videoTrack = { trackType: 'video' } as Track;
      const audioTrack = { trackType: 'stems' } as Track;

      expect(isAudioTrack(videoTrack)).toBe(false);
      expect(isAudioTrack(audioTrack)).toBe(true);
    });
  });

  describe('MAX_VIDEO_TRACKS constant', () => {
    it('MAX_VIDEO_TRACKS is set to 1', () => {
      expect(MAX_VIDEO_TRACKS).toBe(1);
    });
  });
});
