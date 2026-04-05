import { describe, it, expect } from 'vitest';
import {
  mapTransportToVideoTime,
  buildClipMapping,
  calculateDrift,
  getDriftCorrection,
  DRIFT_RATE_THRESHOLD,
  DRIFT_SEEK_THRESHOLD,
  frameDuration,
  stepFrameTime,
  handleLoop,
  findActiveVideoClip,
  compensateLatency,
  type VideoClipMapping,
} from '../VideoSyncEngine';
import type { Clip, Track, VideoClipData } from '../../types/project';

// ─── Helper factories ─────────────────────────────────────────────────────────

function createMapping(overrides: Partial<VideoClipMapping> = {}): VideoClipMapping {
  return {
    clipStartTime: 10,
    clipEndTime: 40,
    clipDuration: 30,
    sourceOffset: 0,
    sourceDuration: 120,
    frameRate: 30,
    ...overrides,
  };
}

function createVideoClip(overrides: Partial<Clip> = {}, videoOverrides: Partial<VideoClipData> = {}): Clip {
  return {
    id: 'clip-1',
    trackId: 'track-1',
    startTime: 10,
    duration: 30,
    prompt: '',
    lyrics: '',
    generationStatus: 'ready',
    generationJobId: null,
    cumulativeMixKey: null,
    isolatedAudioKey: null,
    waveformPeaks: null,
    videoData: {
      videoFileKey: 'idb-key',
      originalFileName: 'test.mp4',
      width: 1920,
      height: 1080,
      frameRate: 30,
      codec: 'avc1',
      isIntraCodec: false,
      gopSize: 15,
      fileDuration: 120,
      sourceOffset: 0,
      hasAudio: false,
      ...videoOverrides,
    },
    ...overrides,
  } as Clip;
}

function createVideoTrack(clips: Clip[] = []): Track {
  return {
    id: 'track-1',
    trackType: 'video',
    trackName: 'custom',
    displayName: 'Video',
    color: '#0ea5e9',
    order: 0,
    volume: 0,
    muted: false,
    soloed: false,
    clips,
  } as Track;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('VideoSyncEngine — pure logic', () => {
  describe('mapTransportToVideoTime', () => {
    it('maps transport time to video time within a clip', () => {
      const mapping = createMapping({ clipStartTime: 10, sourceOffset: 0 });
      expect(mapTransportToVideoTime(15, mapping)).toBe(5);
    });

    it('accounts for source offset', () => {
      const mapping = createMapping({ clipStartTime: 10, sourceOffset: 5 });
      // Transport 15 → 5 seconds into clip → source time 5 + 5 = 10
      expect(mapTransportToVideoTime(15, mapping)).toBe(10);
    });

    it('returns null when transport is before clip', () => {
      const mapping = createMapping({ clipStartTime: 10 });
      expect(mapTransportToVideoTime(5, mapping)).toBeNull();
    });

    it('returns null when transport is at or after clip end', () => {
      const mapping = createMapping({ clipStartTime: 10, clipEndTime: 40 });
      expect(mapTransportToVideoTime(40, mapping)).toBeNull();
      expect(mapTransportToVideoTime(50, mapping)).toBeNull();
    });

    it('returns 0 at the exact clip start (with no source offset)', () => {
      const mapping = createMapping({ clipStartTime: 10, sourceOffset: 0 });
      expect(mapTransportToVideoTime(10, mapping)).toBe(0);
    });

    it('clamps near source duration when clip extends beyond source (last-frame safe)', () => {
      const mapping = createMapping({
        clipStartTime: 0,
        clipEndTime: 200,
        clipDuration: 200,
        sourceOffset: 0,
        sourceDuration: 120,
        frameRate: 30,
      });
      // Transport 150 → 150 seconds, but source is only 120s
      // Clamped to sourceDuration - 1/frameRate for reliable last-frame rendering
      const result = mapTransportToVideoTime(150, mapping)!;
      expect(result).toBeCloseTo(120 - 1 / 30, 5);
      expect(result).toBeLessThan(120);
    });

    it('handles clip starting at transport 0', () => {
      const mapping = createMapping({ clipStartTime: 0, clipEndTime: 30 });
      expect(mapTransportToVideoTime(0, mapping)).toBe(0);
      expect(mapTransportToVideoTime(15, mapping)).toBe(15);
    });
  });

  describe('buildClipMapping', () => {
    it('builds mapping from clip and video data', () => {
      const clip = createVideoClip({ startTime: 5, duration: 20 });
      const mapping = buildClipMapping(clip, clip.videoData!);
      expect(mapping.clipStartTime).toBe(5);
      expect(mapping.clipEndTime).toBe(25);
      expect(mapping.clipDuration).toBe(20);
      expect(mapping.sourceOffset).toBe(0);
      expect(mapping.sourceDuration).toBe(120);
      expect(mapping.frameRate).toBe(30);
    });

    it('includes source offset', () => {
      const clip = createVideoClip({}, { sourceOffset: 10 });
      const mapping = buildClipMapping(clip, clip.videoData!);
      expect(mapping.sourceOffset).toBe(10);
    });
  });

  describe('calculateDrift', () => {
    it('returns 0 when in sync', () => {
      expect(calculateDrift(10, 10)).toBe(0);
    });

    it('returns positive when video is ahead', () => {
      expect(calculateDrift(10, 10.05)).toBeCloseTo(0.05);
    });

    it('returns negative when video is behind', () => {
      expect(calculateDrift(10, 9.95)).toBeCloseTo(-0.05);
    });
  });

  describe('getDriftCorrection', () => {
    it('returns "none" for drift below rate threshold', () => {
      const correction = getDriftCorrection(DRIFT_RATE_THRESHOLD - 0.01, 10);
      expect(correction.type).toBe('none');
    });

    it('returns "rate-adjust" for moderate drift (video ahead → slow down)', () => {
      const drift = DRIFT_RATE_THRESHOLD + 0.01; // positive = video ahead
      const correction = getDriftCorrection(drift, 10);
      expect(correction.type).toBe('rate-adjust');
      if (correction.type === 'rate-adjust') {
        expect(correction.playbackRate).toBe(0.95); // slow down
      }
    });

    it('returns "rate-adjust" for moderate drift (video behind → speed up)', () => {
      const drift = -(DRIFT_RATE_THRESHOLD + 0.01); // negative = video behind
      const correction = getDriftCorrection(drift, 10);
      expect(correction.type).toBe('rate-adjust');
      if (correction.type === 'rate-adjust') {
        expect(correction.playbackRate).toBe(1.05); // speed up
      }
    });

    it('returns "hard-seek" for large drift', () => {
      const drift = DRIFT_SEEK_THRESHOLD + 0.01;
      const correction = getDriftCorrection(drift, 10);
      expect(correction.type).toBe('hard-seek');
      if (correction.type === 'hard-seek') {
        expect(correction.targetTime).toBe(10);
      }
    });

    it('returns "none" for zero drift', () => {
      expect(getDriftCorrection(0, 10).type).toBe('none');
    });
  });

  describe('frameDuration', () => {
    it('calculates correct duration for 30fps', () => {
      expect(frameDuration(30)).toBeCloseTo(1 / 30);
    });

    it('calculates correct duration for 24fps', () => {
      expect(frameDuration(24)).toBeCloseTo(1 / 24);
    });

    it('calculates correct duration for 60fps', () => {
      expect(frameDuration(60)).toBeCloseTo(1 / 60);
    });

    it('defaults to 30fps for 0 frame rate', () => {
      expect(frameDuration(0)).toBeCloseTo(1 / 30);
    });
  });

  describe('stepFrameTime', () => {
    it('steps forward by one frame at 30fps', () => {
      const result = stepFrameTime(10, 30, 'forward', 1);
      expect(result).toBeCloseTo(10 + 1 / 30);
    });

    it('steps backward by one frame at 30fps', () => {
      const result = stepFrameTime(10, 30, 'backward', 1);
      expect(result).toBeCloseTo(10 - 1 / 30);
    });

    it('steps forward by 10 frames', () => {
      const result = stepFrameTime(10, 30, 'forward', 10);
      expect(result).toBeCloseTo(10 + 10 / 30);
    });

    it('steps backward by 10 frames', () => {
      const result = stepFrameTime(10, 24, 'backward', 10);
      expect(result).toBeCloseTo(10 - 10 / 24);
    });

    it('clamps to 0 when stepping backward past start', () => {
      const result = stepFrameTime(0.01, 30, 'backward', 1);
      expect(result).toBe(0);
    });

    it('never returns negative', () => {
      const result = stepFrameTime(0, 30, 'backward', 100);
      expect(result).toBe(0);
    });
  });

  describe('handleLoop', () => {
    it('returns video time at loop start', () => {
      const mapping = createMapping({ clipStartTime: 5, sourceOffset: 0 });
      const result = handleLoop(10, mapping);
      expect(result).toBe(5); // 10 - 5 = 5 seconds into source
    });

    it('returns null if loop start is outside video clip', () => {
      const mapping = createMapping({ clipStartTime: 10, clipEndTime: 40 });
      expect(handleLoop(5, mapping)).toBeNull();
      expect(handleLoop(45, mapping)).toBeNull();
    });
  });

  describe('findActiveVideoClip', () => {
    it('finds video clip at transport time', () => {
      const clip = createVideoClip({ startTime: 10, duration: 30 });
      const track = createVideoTrack([clip]);
      const result = findActiveVideoClip([track], 20);
      expect(result).not.toBeNull();
      expect(result!.clip.id).toBe('clip-1');
    });

    it('returns null when no video track exists', () => {
      const audioTrack: Track = {
        id: 't', trackType: 'sample', trackName: 'custom',
        displayName: 'Audio', color: '#fff', order: 0,
        volume: 0.8, muted: false, soloed: false, clips: [],
      } as Track;
      expect(findActiveVideoClip([audioTrack], 10)).toBeNull();
    });

    it('returns null when transport is outside all video clips', () => {
      const clip = createVideoClip({ startTime: 10, duration: 10 });
      const track = createVideoTrack([clip]);
      expect(findActiveVideoClip([track], 5)).toBeNull();
      expect(findActiveVideoClip([track], 25)).toBeNull();
    });

    it('returns null for video clips without videoData', () => {
      const clip: Clip = {
        id: 'c', trackId: 't', startTime: 0, duration: 10,
        prompt: '', lyrics: '', generationStatus: 'ready',
        generationJobId: null, cumulativeMixKey: null,
        isolatedAudioKey: null, waveformPeaks: null,
      };
      const track = createVideoTrack([clip]);
      expect(findActiveVideoClip([track], 5)).toBeNull();
    });

    it('skips non-video tracks', () => {
      const videoClip = createVideoClip({ startTime: 0, duration: 30 });
      const videoTrack = createVideoTrack([videoClip]);
      const audioTrack: Track = {
        id: 'at', trackType: 'sample', trackName: 'custom',
        displayName: 'Audio', color: '#fff', order: 1,
        volume: 0.8, muted: false, soloed: false, clips: [],
      } as Track;
      const result = findActiveVideoClip([audioTrack, videoTrack], 15);
      expect(result!.track.id).toBe('track-1');
    });
  });

  describe('compensateLatency', () => {
    it('adds audio latency to transport time', () => {
      expect(compensateLatency(10, 0.005)).toBeCloseTo(10.005);
    });

    it('returns transport time when latency is 0', () => {
      expect(compensateLatency(10, 0)).toBe(10);
    });
  });
});
