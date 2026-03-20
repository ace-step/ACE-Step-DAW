import { beforeEach, describe, expect, it } from 'vitest';
import { useTransportStore } from '../../src/store/transportStore';
import {
  getScrubPreviewRate,
  clampScrubPreviewRate,
  MAX_SCRUB_PREVIEW_RATE,
} from '../../src/utils/scrubMath';
import {
  getScrubPlaybackRate,
  getScrubSliceWindow,
  getScrubSourceOffset,
} from '../../src/utils/scrub';

/**
 * Integration tests for the timeline ruler scrubbing feature (Issue #489).
 *
 * These tests verify the full scrub lifecycle: entering scrub mode,
 * velocity-based audio preview rate calculation, scrub position updates,
 * and clean exit from scrub mode.
 */
describe('timeline scrub integration', () => {
  beforeEach(() => {
    useTransportStore.setState(useTransportStore.getInitialState(), true);
  });

  describe('scrub lifecycle', () => {
    it('enters scrub mode on pointer down, pauses playback, and sets anchor', () => {
      useTransportStore.getState().play();
      expect(useTransportStore.getState().isPlaying).toBe(true);

      useTransportStore.getState().startScrub(5.0, true);

      const state = useTransportStore.getState();
      expect(state.isScrubbing).toBe(true);
      expect(state.isPlaying).toBe(false);
      expect(state.currentTime).toBe(5.0);
      expect(state.scrubAnchorTime).toBe(5.0);
      expect(state.scrubResumeOnRelease).toBe(true);
      expect(state.scrubPreviewRate).toBe(0);
    });

    it('updates scrub position and preview rate during drag', () => {
      useTransportStore.getState().startScrub(2.0);

      useTransportStore.getState().updateScrub(3.5, 0.8);
      let state = useTransportStore.getState();
      expect(state.currentTime).toBe(3.5);
      expect(state.scrubPreviewRate).toBeCloseTo(0.8);
      expect(state.isScrubbing).toBe(true);

      useTransportStore.getState().updateScrub(5.0, 1.5);
      state = useTransportStore.getState();
      expect(state.currentTime).toBe(5.0);
      expect(state.scrubPreviewRate).toBeCloseTo(1.5);
    });

    it('exits scrub mode cleanly on pointer up', () => {
      useTransportStore.getState().startScrub(3.0, true);
      useTransportStore.getState().updateScrub(4.0, 1.0);
      useTransportStore.getState().endScrub();

      const state = useTransportStore.getState();
      expect(state.isScrubbing).toBe(false);
      expect(state.scrubAnchorTime).toBeNull();
      expect(state.scrubResumeOnRelease).toBe(false);
      expect(state.scrubPreviewRate).toBe(0);
      // currentTime preserves last scrub position
      expect(state.currentTime).toBe(4.0);
    });

    it('stop resets scrub state completely', () => {
      useTransportStore.getState().startScrub(6.0, true);
      useTransportStore.getState().updateScrub(7.0, 2.0);
      useTransportStore.getState().stop();

      const state = useTransportStore.getState();
      expect(state.isScrubbing).toBe(false);
      expect(state.scrubAnchorTime).toBeNull();
      expect(state.scrubResumeOnRelease).toBe(false);
      expect(state.scrubPreviewRate).toBe(0);
      expect(state.currentTime).toBe(0);
    });
  });

  describe('velocity-based preview rate', () => {
    it('computes higher preview rate for faster drag velocity', () => {
      const slow = getScrubPreviewRate({
        previousX: 100,
        nextX: 110,
        previousTime: 1.0,
        nextTime: 1.1,
        previousStamp: 0,
        nextStamp: 100,
      });
      const fast = getScrubPreviewRate({
        previousX: 100,
        nextX: 300,
        previousTime: 1.0,
        nextTime: 3.0,
        previousStamp: 0,
        nextStamp: 50,
      });

      expect(Math.abs(fast)).toBeGreaterThan(Math.abs(slow));
    });

    it('returns negative rate for leftward (reverse) drag', () => {
      const rate = getScrubPreviewRate({
        previousX: 300,
        nextX: 200,
        previousTime: 3.0,
        nextTime: 2.0,
        previousStamp: 0,
        nextStamp: 50,
      });

      expect(rate).toBeLessThan(0);
    });

    it('returns zero for sub-deadzone movement', () => {
      const rate = getScrubPreviewRate({
        previousX: 100,
        nextX: 101,
        previousTime: 1.0,
        nextTime: 1.005,
        previousStamp: 0,
        nextStamp: 32,
      });

      expect(rate).toBe(0);
    });

    it('clamps extreme velocities to +-MAX_SCRUB_PREVIEW_RATE', () => {
      expect(clampScrubPreviewRate(100)).toBe(MAX_SCRUB_PREVIEW_RATE);
      expect(clampScrubPreviewRate(-100)).toBe(-MAX_SCRUB_PREVIEW_RATE);
    });

    it('store clamps preview rate to +-4', () => {
      useTransportStore.getState().startScrub(0);
      useTransportStore.getState().updateScrub(1.0, 10);
      expect(useTransportStore.getState().scrubPreviewRate).toBe(4);

      useTransportStore.getState().updateScrub(0.5, -10);
      expect(useTransportStore.getState().scrubPreviewRate).toBe(-4);
    });
  });

  describe('scrub audio response', () => {
    it('maps preview rate to playback rate proportionally', () => {
      const rateAtSlow = getScrubPlaybackRate(0.1);
      const rateAtFast = getScrubPlaybackRate(0.9);
      const rateAtMax = getScrubPlaybackRate(MAX_SCRUB_PREVIEW_RATE);

      expect(rateAtSlow).toBeGreaterThan(0);
      expect(rateAtFast).toBeGreaterThan(rateAtSlow);
      expect(rateAtMax).toBeLessThanOrEqual(3);
    });

    it('uses shorter scrub windows at higher speeds', () => {
      const windowSlow = getScrubSliceWindow(0.1);
      const windowFast = getScrubSliceWindow(0.9);

      expect(windowSlow).toBeGreaterThan(windowFast);
      expect(windowFast).toBeGreaterThanOrEqual(0.05);
      expect(windowSlow).toBeLessThanOrEqual(0.15);
    });

    it('computes source offset within clip bounds', () => {
      const offset = getScrubSourceOffset({
        clipStartTime: 4.0,
        clipDuration: 8.0,
        timelineTime: 6.0,
        previewRate: 0.5,
        audioOffset: 0,
        timeStretchRate: 1,
      });

      expect(offset).toBeGreaterThanOrEqual(0);
      expect(offset).toBeLessThanOrEqual(8.0);
    });

    it('shifts source offset backward for reverse scrub', () => {
      const forward = getScrubSourceOffset({
        clipStartTime: 4.0,
        clipDuration: 8.0,
        timelineTime: 8.0,
        previewRate: 0.7,
        audioOffset: 0,
        timeStretchRate: 1,
      });
      const reverse = getScrubSourceOffset({
        clipStartTime: 4.0,
        clipDuration: 8.0,
        timelineTime: 8.0,
        previewRate: -0.7,
        audioOffset: 0,
        timeStretchRate: 1,
      });

      expect(reverse).toBeLessThan(forward);
    });
  });

  describe('scrub with snap and zoom', () => {
    it('clamps scrub position to non-negative time', () => {
      useTransportStore.getState().startScrub(0.5);
      // updateScrub uses Math.max(0, time) so negative values are clamped to 0
      useTransportStore.getState().updateScrub(-1.0, -0.5);
      expect(useTransportStore.getState().currentTime).toBe(0);

      // seek also explicitly clamps
      useTransportStore.getState().seek(-2);
      expect(useTransportStore.getState().currentTime).toBe(0);
    });

    it('preserves scrub state across multiple rapid updates', () => {
      useTransportStore.getState().startScrub(1.0);

      // Simulate rapid pointer moves
      for (let i = 0; i < 20; i++) {
        const time = 1.0 + i * 0.1;
        const rate = i * 0.15;
        useTransportStore.getState().updateScrub(time, rate);
      }

      const state = useTransportStore.getState();
      expect(state.isScrubbing).toBe(true);
      expect(state.currentTime).toBeCloseTo(2.9);
      // Last rate was 19 * 0.15 = 2.85, clamped to [-4, 4]
      expect(state.scrubPreviewRate).toBeCloseTo(2.85);
    });
  });

  describe('scrub resume behavior', () => {
    it('remembers resume-on-release when playback was active', () => {
      useTransportStore.getState().play();
      useTransportStore.getState().startScrub(3.0, true);

      expect(useTransportStore.getState().scrubResumeOnRelease).toBe(true);
    });

    it('does not set resume when playback was not active', () => {
      useTransportStore.getState().startScrub(3.0, false);

      expect(useTransportStore.getState().scrubResumeOnRelease).toBe(false);
    });

    it('defaults resume to false when not specified', () => {
      useTransportStore.getState().startScrub(3.0);

      expect(useTransportStore.getState().scrubResumeOnRelease).toBe(false);
    });
  });
});
