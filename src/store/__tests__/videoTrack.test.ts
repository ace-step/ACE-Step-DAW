import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useProjectStore } from '../projectStore';
import { useCollaborationStore } from '../collaborationStore';
import { MAX_VIDEO_TRACKS } from '../../constants/tracks';

// Mock projectStorage to prevent IndexedDB calls during testing
vi.mock('../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

describe('Video Track (Phase 1)', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: null });
    useCollaborationStore.getState().reset();
    useProjectStore.getState().createProject();
  });

  describe('addTrack("video")', () => {
    it('creates a valid video track via store API', () => {
      const track = useProjectStore.getState().addTrack('custom', 'video');
      expect(track).toBeDefined();
      expect(track.trackType).toBe('video');
      expect(track.trackName).toBe('custom');
      expect(track.displayName).toBe('Video');
      expect(track.clips).toEqual([]);
    });

    it('assigns video catalog color (#0ea5e9)', () => {
      const track = useProjectStore.getState().addTrack('custom', 'video');
      expect(track.color).toBe('#0ea5e9');
    });

    it('sets default laneHeight to 80', () => {
      const track = useProjectStore.getState().addTrack('custom', 'video');
      expect(track.laneHeight).toBe(80);
    });

    it('initializes default videoSettings', () => {
      const track = useProjectStore.getState().addTrack('custom', 'video');
      expect(track.videoSettings).toBeDefined();
      expect(track.videoSettings!.showPreview).toBe(true);
      expect(track.videoSettings!.previewSize).toBe('medium');
      expect(track.videoSettings!.previewDocking).toBe('docked');
      expect(track.videoSettings!.filmstripOpacity).toBe(1);
      expect(track.videoSettings!.showTimecodeOverlay).toBe(true);
      expect(track.videoSettings!.videoFollowsEdit).toBe(true);
    });

    it('does NOT initialize audio-related fields', () => {
      const track = useProjectStore.getState().addTrack('custom', 'video');
      // Video tracks should not have mixer/audio properties
      expect(track.volume).toBe(0); // explicitly 0, not 0.8
      expect(track.pan).toBeUndefined();
      expect(track.eqLowGain).toBeUndefined();
      expect(track.eqMidGain).toBeUndefined();
      expect(track.eqHighGain).toBeUndefined();
      expect(track.compressorEnabled).toBeUndefined();
      expect(track.reverbMix).toBeUndefined();
      expect(track.effects).toEqual([]);
      expect(track.sends).toBeUndefined();
      expect(track.synthPreset).toBeUndefined();
      expect(track.instrument).toBeUndefined();
    });

    it('adds the track to project tracks', () => {
      useProjectStore.getState().addTrack('custom', 'video');
      const tracks = useProjectStore.getState().project!.tracks;
      expect(tracks).toHaveLength(1);
      expect(tracks[0].trackType).toBe('video');
    });
  });

  describe('max video track enforcement', () => {
    it('enforces max 1 video track per project', () => {
      const first = useProjectStore.getState().addTrack('custom', 'video');
      expect(first).toBeDefined();
      expect(first.trackType).toBe('video');

      // Second video track should be rejected
      const second = useProjectStore.getState().addTrack('custom', 'video');
      // Should return undefined or falsy when limit reached
      expect(second?.trackType).not.toBe('video');

      const tracks = useProjectStore.getState().project!.tracks;
      const videoTracks = tracks.filter(t => t.trackType === 'video');
      expect(videoTracks).toHaveLength(1);
    });

    it('uses MAX_VIDEO_TRACKS constant (not hardcoded)', () => {
      expect(MAX_VIDEO_TRACKS).toBe(1);
    });

    it('allows non-video tracks when video track exists', () => {
      useProjectStore.getState().addTrack('custom', 'video');
      const audioTrack = useProjectStore.getState().addTrack('custom', 'sample');
      expect(audioTrack).toBeDefined();
      expect(audioTrack.trackType).toBe('sample');

      const tracks = useProjectStore.getState().project!.tracks;
      expect(tracks).toHaveLength(2);
    });
  });

  describe('video track serialization', () => {
    it('videoSettings survives JSON round-trip', () => {
      useProjectStore.getState().addTrack('custom', 'video');
      const project = useProjectStore.getState().project!;

      // Simulate save/load
      const serialized = JSON.stringify(project);
      const deserialized = JSON.parse(serialized);

      const videoTrack = deserialized.tracks.find((t: any) => t.trackType === 'video');
      expect(videoTrack).toBeDefined();
      expect(videoTrack.videoSettings).toBeDefined();
      expect(videoTrack.videoSettings.showPreview).toBe(true);
      expect(videoTrack.videoSettings.previewSize).toBe('medium');
    });

    it('videoData on clip survives JSON round-trip', () => {
      useProjectStore.getState().addTrack('custom', 'video');
      const tracks = useProjectStore.getState().project!.tracks;
      const videoTrack = tracks.find(t => t.trackType === 'video')!;

      // Manually add a clip with videoData for serialization test
      useProjectStore.getState().updateTrack(videoTrack.id, {
        clips: [{
          id: 'test-clip',
          trackId: videoTrack.id,
          startTime: 0,
          duration: 10,
          prompt: '',
          lyrics: '',
          generationStatus: 'idle',
          generationJobId: null,
          cumulativeMixKey: null,
          isolatedAudioKey: null,
          waveformPeaks: null,
          videoData: {
            videoFileKey: 'idb-key-123',
            originalFileName: 'test.mp4',
            width: 1920,
            height: 1080,
            frameRate: 24,
            codec: 'avc1.64001f',
            isIntraCodec: false,
            gopSize: 12,
            fileDuration: 120,
            sourceOffset: 0,
            hasAudio: true,
          },
        }],
      });

      const project = useProjectStore.getState().project!;
      const serialized = JSON.stringify(project);
      const deserialized = JSON.parse(serialized);
      const clip = deserialized.tracks.find((t: any) => t.trackType === 'video')?.clips[0];
      expect(clip.videoData).toBeDefined();
      expect(clip.videoData.videoFileKey).toBe('idb-key-123');
      expect(clip.videoData.width).toBe(1920);
      expect(clip.videoData.height).toBe(1080);
      expect(clip.videoData.frameRate).toBe(24);
      expect(clip.videoData.codec).toBe('avc1.64001f');
      expect(clip.videoData.isIntraCodec).toBe(false);
    });
  });

  describe('video track shorthand', () => {
    it('addTrack("video") resolves correctly (shorthand)', () => {
      // When trackName is a TrackType (like 'video'), it should resolve to custom + video
      const track = useProjectStore.getState().addTrack('video' as any) /* shorthand: 'video' is a TrackType not TrackName */;
      expect(track.trackType).toBe('video');
      expect(track.trackName).toBe('custom');
    });
  });

  describe('TRACK_TYPE_CATALOG video entry', () => {
    it('has correct catalog metadata', async () => {
      const { TRACK_TYPE_CATALOG } = await import('../../constants/tracks');
      const videoEntry = TRACK_TYPE_CATALOG.video;
      expect(videoEntry).toBeDefined();
      expect(videoEntry.type).toBe('video');
      expect(videoEntry.label).toBe('Video');
      expect(videoEntry.abbr).toBe('VID');
      expect(videoEntry.emoji).toBe('🎬');
      expect(videoEntry.color).toBe('#0ea5e9');
      expect(videoEntry.description).toBe('Video track for scoring to picture');
    });
  });
});
