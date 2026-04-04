import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VideoSyncEngine } from '../VideoSyncEngine';

describe('VideoSyncEngine', () => {
  let engine: VideoSyncEngine;

  beforeEach(() => {
    engine = new VideoSyncEngine();
  });

  describe('initial state', () => {
    it('starts in idle mode', () => {
      expect(engine.getState().mode).toBe('idle');
    });

    it('has no active video element', () => {
      expect(engine.getState().videoElement).toBeNull();
    });

    it('currentFrame is 0', () => {
      expect(engine.getState().currentFrame).toBe(0);
    });
  });

  describe('computeVideoTime', () => {
    it('maps transport time to video time with sourceOffset', () => {
      const videoTime = VideoSyncEngine.computeVideoTime({
        transportTime: 10,
        clipStartTime: 5,
        sourceOffset: 2,
        clipDuration: 30,
        videoDuration: 60,
      });
      // At transport=10, clip started at 5, so 5s into clip
      // sourceOffset=2, so video time = 2 + 5 = 7
      expect(videoTime).toBe(7);
    });

    it('clamps to video duration when sourceOffset + elapsed exceeds it', () => {
      const videoTime = VideoSyncEngine.computeVideoTime({
        transportTime: 25,
        clipStartTime: 0,
        sourceOffset: 50,
        clipDuration: 30,
        videoDuration: 60,
      });
      // sourceOffset + elapsed = 50 + 25 = 75 → clamped to 60
      expect(videoTime).toBe(60);
    });

    it('returns sourceOffset when at clip start', () => {
      const videoTime = VideoSyncEngine.computeVideoTime({
        transportTime: 5,
        clipStartTime: 5,
        sourceOffset: 3,
        clipDuration: 30,
        videoDuration: 60,
      });
      expect(videoTime).toBe(3);
    });

    it('returns -1 when transport is before clip start', () => {
      const videoTime = VideoSyncEngine.computeVideoTime({
        transportTime: 2,
        clipStartTime: 5,
        sourceOffset: 0,
        clipDuration: 30,
        videoDuration: 60,
      });
      expect(videoTime).toBe(-1);
    });

    it('returns -1 when transport is after clip end', () => {
      const videoTime = VideoSyncEngine.computeVideoTime({
        transportTime: 40,
        clipStartTime: 5,
        sourceOffset: 0,
        clipDuration: 30,
        videoDuration: 60,
      });
      expect(videoTime).toBe(-1);
    });

    it('returns -1 when transport is exactly at clip end', () => {
      const videoTime = VideoSyncEngine.computeVideoTime({
        transportTime: 35,
        clipStartTime: 5,
        sourceOffset: 0,
        clipDuration: 30,
        videoDuration: 60,
      });
      expect(videoTime).toBe(-1);
    });
  });

  describe('computeFrameNumber', () => {
    it('converts time to frame number at 30fps', () => {
      expect(VideoSyncEngine.computeFrameNumber(1.0, 30)).toBe(30);
      expect(VideoSyncEngine.computeFrameNumber(0.5, 30)).toBe(15);
      expect(VideoSyncEngine.computeFrameNumber(0, 30)).toBe(0);
    });

    it('converts time to frame number at 24fps', () => {
      expect(VideoSyncEngine.computeFrameNumber(1.0, 24)).toBe(24);
    });

    it('floors to nearest frame', () => {
      // 1.04s at 30fps = frame 31.2 → floor to 31
      expect(VideoSyncEngine.computeFrameNumber(1.04, 30)).toBe(31);
    });
  });

  describe('computeDrift', () => {
    it('returns 0 when perfectly synced', () => {
      expect(VideoSyncEngine.computeDrift(10.0, 10.0)).toBe(0);
    });

    it('returns positive drift when video is ahead', () => {
      expect(VideoSyncEngine.computeDrift(10.1, 10.0)).toBeCloseTo(0.1);
    });

    it('returns negative drift when video is behind', () => {
      expect(VideoSyncEngine.computeDrift(9.9, 10.0)).toBeCloseTo(-0.1);
    });
  });

  describe('needsDriftCorrection', () => {
    it('returns false when drift is within tolerance at 30fps', () => {
      // ±1 frame at 30fps = ±33.3ms
      expect(VideoSyncEngine.needsDriftCorrection(0.02, 30)).toBe(false);
      expect(VideoSyncEngine.needsDriftCorrection(-0.02, 30)).toBe(false);
    });

    it('returns true when drift exceeds 1 frame at 30fps', () => {
      expect(VideoSyncEngine.needsDriftCorrection(0.04, 30)).toBe(true);
      expect(VideoSyncEngine.needsDriftCorrection(-0.04, 30)).toBe(true);
    });
  });

  describe('mode transitions', () => {
    it('transitions to play mode', () => {
      engine.setMode('play');
      expect(engine.getState().mode).toBe('play');
    });

    it('transitions to scrub mode', () => {
      engine.setMode('scrub');
      expect(engine.getState().mode).toBe('scrub');
    });

    it('transitions back to idle', () => {
      engine.setMode('play');
      engine.setMode('idle');
      expect(engine.getState().mode).toBe('idle');
    });
  });

  describe('frame stepping', () => {
    it('stepForward increments by 1 frame', () => {
      engine.setFrameRate(30);
      engine.setCurrentFrame(100);
      engine.stepForward();
      expect(engine.getState().currentFrame).toBe(101);
    });

    it('stepBackward decrements by 1 frame', () => {
      engine.setFrameRate(30);
      engine.setCurrentFrame(100);
      engine.stepBackward();
      expect(engine.getState().currentFrame).toBe(99);
    });

    it('stepBackward does not go below 0', () => {
      engine.setFrameRate(30);
      engine.setCurrentFrame(0);
      engine.stepBackward();
      expect(engine.getState().currentFrame).toBe(0);
    });
  });
});
