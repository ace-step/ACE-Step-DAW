/**
 * Unit tests for session recording into clip slots.
 * Tests the state machine for session slot recording:
 * arm → click empty slot → recording → stop → clip created.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  SessionSlotRecordingState,
  createSessionRecordingManager,
  type SessionRecordingManager,
} from '../sessionRecording';

describe('SessionSlotRecording', () => {
  let manager: SessionRecordingManager;

  beforeEach(() => {
    manager = createSessionRecordingManager();
  });

  afterEach(() => {
    manager.dispose();
  });

  describe('state machine', () => {
    it('starts in idle state with no recording slots', () => {
      expect(manager.getState()).toBe('idle');
      expect(manager.getRecordingSlots()).toEqual([]);
    });

    it('transitions from idle to armed when a track is armed', () => {
      manager.armTrack('track-1');
      expect(manager.getArmedTrackIds()).toContain('track-1');
    });

    it('transitions to recording when an empty slot on armed track is triggered', () => {
      manager.armTrack('track-1');
      manager.startSlotRecording({
        trackId: 'track-1',
        sceneId: 'scene-1',
        slotId: 'slot-1',
        recordingType: 'midi',
        fixedLengthBars: null,
      });
      expect(manager.getState()).toBe('recording');
      expect(manager.getRecordingSlots()).toEqual([
        expect.objectContaining({
          trackId: 'track-1',
          sceneId: 'scene-1',
          slotId: 'slot-1',
        }),
      ]);
    });

    it('refuses to record on unarmed tracks', () => {
      const started = manager.startSlotRecording({
        trackId: 'track-1',
        sceneId: 'scene-1',
        slotId: 'slot-1',
        recordingType: 'midi',
        fixedLengthBars: null,
      });
      expect(started).toBe(false);
      expect(manager.getState()).toBe('idle');
    });

    it('stops recording and returns recording metadata', () => {
      manager.armTrack('track-1');
      manager.startSlotRecording({
        trackId: 'track-1',
        sceneId: 'scene-1',
        slotId: 'slot-1',
        recordingType: 'midi',
        fixedLengthBars: null,
      });
      const result = manager.stopSlotRecording('slot-1');
      expect(result).toEqual(
        expect.objectContaining({
          trackId: 'track-1',
          sceneId: 'scene-1',
          slotId: 'slot-1',
          recordingType: 'midi',
        }),
      );
      expect(manager.getState()).toBe('idle');
    });

    it('returns null when stopping a slot that is not recording', () => {
      const result = manager.stopSlotRecording('slot-999');
      expect(result).toBeNull();
    });

    it('supports multiple simultaneous slot recordings on different armed tracks', () => {
      manager.armTrack('track-1');
      manager.armTrack('track-2');
      manager.startSlotRecording({
        trackId: 'track-1',
        sceneId: 'scene-1',
        slotId: 'slot-1',
        recordingType: 'midi',
        fixedLengthBars: null,
      });
      manager.startSlotRecording({
        trackId: 'track-2',
        sceneId: 'scene-1',
        slotId: 'slot-2',
        recordingType: 'audio',
        fixedLengthBars: null,
      });
      expect(manager.getRecordingSlots()).toHaveLength(2);
    });

    it('can stop all recordings at once', () => {
      manager.armTrack('track-1');
      manager.armTrack('track-2');
      manager.startSlotRecording({
        trackId: 'track-1',
        sceneId: 'scene-1',
        slotId: 'slot-1',
        recordingType: 'midi',
        fixedLengthBars: null,
      });
      manager.startSlotRecording({
        trackId: 'track-2',
        sceneId: 'scene-1',
        slotId: 'slot-2',
        recordingType: 'midi',
        fixedLengthBars: null,
      });
      const results = manager.stopAllRecordings();
      expect(results).toHaveLength(2);
      expect(manager.getState()).toBe('idle');
    });

    it('disarms track and stops its recording', () => {
      manager.armTrack('track-1');
      manager.startSlotRecording({
        trackId: 'track-1',
        sceneId: 'scene-1',
        slotId: 'slot-1',
        recordingType: 'midi',
        fixedLengthBars: null,
      });
      manager.disarmTrack('track-1');
      expect(manager.getArmedTrackIds()).not.toContain('track-1');
      expect(manager.getRecordingSlots()).toEqual([]);
    });
  });

  describe('fixed-length recording', () => {
    it('stores fixedLengthBars in recording metadata', () => {
      manager.armTrack('track-1');
      manager.startSlotRecording({
        trackId: 'track-1',
        sceneId: 'scene-1',
        slotId: 'slot-1',
        recordingType: 'midi',
        fixedLengthBars: 4,
      });
      const slots = manager.getRecordingSlots();
      expect(slots[0].fixedLengthBars).toBe(4);
    });
  });

  describe('recording type detection', () => {
    it('records midi type for midi slots', () => {
      manager.armTrack('track-1');
      manager.startSlotRecording({
        trackId: 'track-1',
        sceneId: 'scene-1',
        slotId: 'slot-1',
        recordingType: 'midi',
        fixedLengthBars: null,
      });
      expect(manager.getRecordingSlots()[0].recordingType).toBe('midi');
    });

    it('records audio type for audio slots', () => {
      manager.armTrack('track-1');
      manager.startSlotRecording({
        trackId: 'track-1',
        sceneId: 'scene-1',
        slotId: 'slot-1',
        recordingType: 'audio',
        fixedLengthBars: null,
      });
      expect(manager.getRecordingSlots()[0].recordingType).toBe('audio');
    });
  });

  describe('elapsed time tracking', () => {
    it('tracks start time for each recording slot', () => {
      manager.armTrack('track-1');
      const now = performance.now();
      manager.startSlotRecording({
        trackId: 'track-1',
        sceneId: 'scene-1',
        slotId: 'slot-1',
        recordingType: 'midi',
        fixedLengthBars: null,
      });
      const slot = manager.getRecordingSlots()[0];
      expect(slot.startedAt).toBeGreaterThanOrEqual(now);
    });

    it('calculates elapsed time on stop', () => {
      manager.armTrack('track-1');
      manager.startSlotRecording({
        trackId: 'track-1',
        sceneId: 'scene-1',
        slotId: 'slot-1',
        recordingType: 'midi',
        fixedLengthBars: null,
      });
      const result = manager.stopSlotRecording('slot-1');
      expect(result?.elapsedMs).toBeGreaterThanOrEqual(0);
    });
  });
});
