import { describe, it, expect, beforeEach } from 'vitest';
import { useTransportStore } from '../../src/store/transportStore';
import { useProjectStore } from '../../src/store/projectStore';

describe('Loop Recording — Overdub Mode', () => {
  describe('Transport store: loop recording state', () => {
    beforeEach(() => {
      useTransportStore.setState({
        loopRecordingEnabled: false,
        loopCycleCount: 0,
        loopEnabled: false,
        loopStart: 0,
        loopEnd: 0,
        isRecording: false,
        armedTrackIds: [],
      });
    });

    it('toggleLoopRecording toggles loopRecordingEnabled', () => {
      expect(useTransportStore.getState().loopRecordingEnabled).toBe(false);
      useTransportStore.getState().toggleLoopRecording();
      expect(useTransportStore.getState().loopRecordingEnabled).toBe(true);
      useTransportStore.getState().toggleLoopRecording();
      expect(useTransportStore.getState().loopRecordingEnabled).toBe(false);
    });

    it('setLoopCycleCount updates the cycle counter', () => {
      useTransportStore.getState().setLoopCycleCount(3);
      expect(useTransportStore.getState().loopCycleCount).toBe(3);
    });

    it('incrementLoopCycle increments by 1', () => {
      expect(useTransportStore.getState().loopCycleCount).toBe(0);
      useTransportStore.getState().incrementLoopCycle();
      expect(useTransportStore.getState().loopCycleCount).toBe(1);
      useTransportStore.getState().incrementLoopCycle();
      expect(useTransportStore.getState().loopCycleCount).toBe(2);
    });

    it('stop resets loopCycleCount to 0', () => {
      useTransportStore.getState().setLoopCycleCount(5);
      useTransportStore.getState().stop();
      expect(useTransportStore.getState().loopCycleCount).toBe(0);
    });

    it('loopRecordingEnabled can be set independently of loopEnabled', () => {
      useTransportStore.getState().toggleLoopRecording();
      expect(useTransportStore.getState().loopRecordingEnabled).toBe(true);
      expect(useTransportStore.getState().loopEnabled).toBe(false);
    });
  });

  describe('Project store: take creation on loop cycles', () => {
    beforeEach(() => {
      const store = useProjectStore.getState();
      store.createProject({ name: 'Loop Recording Test' });
      store.addTrack('vocals', 'stems');
    });

    it('addTake creates sequential takes on a clip', () => {
      const store = useProjectStore.getState();
      const track = store.project!.tracks[0];
      const clip = store.addClip(track.id, {
        startTime: 0,
        duration: 4,
        prompt: 'Recording',
        lyrics: '',
        source: 'uploaded',
      });

      store.addTake(clip.id, 'take-1-audio');
      store.addTake(clip.id, 'take-2-audio');
      store.addTake(clip.id, 'take-3-audio');

      const updated = useProjectStore.getState().getClipById(clip.id)!;
      expect(updated.takes).toHaveLength(3);
      expect(updated.takes![0].audioKey).toBe('take-1-audio');
      expect(updated.takes![1].audioKey).toBe('take-2-audio');
      expect(updated.takes![2].audioKey).toBe('take-3-audio');
    });

    it('selectTake switches the active take', () => {
      const store = useProjectStore.getState();
      const track = store.project!.tracks[0];
      const clip = store.addClip(track.id, {
        startTime: 0,
        duration: 4,
        prompt: 'Recording',
        lyrics: '',
        source: 'uploaded',
      });

      store.addTake(clip.id, 'take-1');
      store.addTake(clip.id, 'take-2');

      const takes = useProjectStore.getState().getClipById(clip.id)!.takes!;
      store.selectTake(clip.id, takes[1].id);

      const after = useProjectStore.getState().getClipById(clip.id)!.takes!;
      expect(after[0].selected).toBe(false);
      expect(after[1].selected).toBe(true);
    });

    it('toggleTakeLanes enables take lane visibility', () => {
      const store = useProjectStore.getState();
      const track = store.project!.tracks[0];
      expect(track.showTakeLanes).toBeFalsy();

      store.toggleTakeLanes(track.id);
      const updated = useProjectStore.getState().project!.tracks[0];
      expect(updated.showTakeLanes).toBe(true);
    });
  });
});
