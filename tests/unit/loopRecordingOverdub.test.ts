import { describe, it, expect, beforeEach } from 'vitest';
import { useTransportStore } from '../../src/store/transportStore';
import { useProjectStore } from '../../src/store/projectStore';

describe('Loop Recording — Overdub Workflow', () => {
  beforeEach(() => {
    useTransportStore.setState({
      loopRecordingEnabled: false,
      loopCycleCount: 0,
      loopEnabled: false,
      loopStart: 0,
      loopEnd: 8,
      isRecording: false,
      isPlaying: false,
      armedTrackIds: [],
    });
  });

  describe('toggleLoopRecording auto-enables loop', () => {
    it('enabling loopRecordingEnabled also enables loopEnabled', () => {
      const s = useTransportStore.getState();
      expect(s.loopEnabled).toBe(false);
      expect(s.loopRecordingEnabled).toBe(false);

      useTransportStore.getState().toggleLoopRecording();

      const after = useTransportStore.getState();
      expect(after.loopRecordingEnabled).toBe(true);
      expect(after.loopEnabled).toBe(true);
    });

    it('disabling loopRecordingEnabled does NOT disable loopEnabled', () => {
      useTransportStore.getState().toggleLoopRecording(); // on
      useTransportStore.getState().toggleLoopRecording(); // off

      const after = useTransportStore.getState();
      expect(after.loopRecordingEnabled).toBe(false);
      expect(after.loopEnabled).toBe(true); // stays on
    });
  });

  describe('multiple take accumulation across loop cycles', () => {
    beforeEach(() => {
      const store = useProjectStore.getState();
      store.createProject({ name: 'Overdub Test' });
      store.addTrack('vocals', 'stems');
    });

    it('each addTake increases the take count', () => {
      const store = useProjectStore.getState();
      const track = store.project!.tracks[0];
      const clip = store.addClip(track.id, {
        startTime: 0,
        duration: 8,
        prompt: 'Recording',
        lyrics: '',
        source: 'uploaded',
      });

      // Simulate 4 loop passes
      store.addTake(clip.id, 'take-pass-1');
      store.addTake(clip.id, 'take-pass-2');
      store.addTake(clip.id, 'take-pass-3');
      store.addTake(clip.id, 'take-pass-4');

      const updated = useProjectStore.getState().getClipById(clip.id)!;
      expect(updated.takes).toHaveLength(4);
    });

    it('the last added take is not auto-selected', () => {
      const store = useProjectStore.getState();
      const track = store.project!.tracks[0];
      const clip = store.addClip(track.id, {
        startTime: 0,
        duration: 8,
        prompt: 'Recording',
        lyrics: '',
        source: 'uploaded',
      });

      store.addTake(clip.id, 'take-1');
      store.addTake(clip.id, 'take-2');

      const updated = useProjectStore.getState().getClipById(clip.id)!;
      expect(updated.takes!.every((t) => !t.selected)).toBe(true);
    });

    it('selectTake deselects all other takes', () => {
      const store = useProjectStore.getState();
      const track = store.project!.tracks[0];
      const clip = store.addClip(track.id, {
        startTime: 0,
        duration: 8,
        prompt: 'Recording',
        lyrics: '',
        source: 'uploaded',
      });

      store.addTake(clip.id, 'take-1');
      store.addTake(clip.id, 'take-2');
      store.addTake(clip.id, 'take-3');

      const takes = useProjectStore.getState().getClipById(clip.id)!.takes!;
      store.selectTake(clip.id, takes[1].id);

      const after = useProjectStore.getState().getClipById(clip.id)!.takes!;
      expect(after[0].selected).toBe(false);
      expect(after[1].selected).toBe(true);
      expect(after[2].selected).toBe(false);

      // Now select a different take
      store.selectTake(clip.id, takes[2].id);
      const final = useProjectStore.getState().getClipById(clip.id)!.takes!;
      expect(final[0].selected).toBe(false);
      expect(final[1].selected).toBe(false);
      expect(final[2].selected).toBe(true);
    });
  });

  describe('cycle counter during overdub', () => {
    it('incrementLoopCycle tracks the pass number', () => {
      useTransportStore.getState().toggleLoopRecording();
      useTransportStore.setState({ isRecording: true });

      useTransportStore.getState().incrementLoopCycle();
      expect(useTransportStore.getState().loopCycleCount).toBe(1);

      useTransportStore.getState().incrementLoopCycle();
      expect(useTransportStore.getState().loopCycleCount).toBe(2);

      useTransportStore.getState().incrementLoopCycle();
      expect(useTransportStore.getState().loopCycleCount).toBe(3);
    });

    it('stop resets cycle count', () => {
      useTransportStore.getState().setLoopCycleCount(5);
      useTransportStore.getState().stop();
      expect(useTransportStore.getState().loopCycleCount).toBe(0);
    });

    it('setLoopCycleCount(0) resets after recording ends', () => {
      useTransportStore.getState().setLoopCycleCount(7);
      useTransportStore.getState().setLoopCycleCount(0);
      expect(useTransportStore.getState().loopCycleCount).toBe(0);
    });
  });

  describe('take lanes visibility', () => {
    beforeEach(() => {
      const store = useProjectStore.getState();
      store.createProject({ name: 'Take Lanes Test' });
      store.addTrack('guitar', 'stems');
    });

    it('toggleTakeLanes shows/hides take lanes per track', () => {
      const store = useProjectStore.getState();
      const track = store.project!.tracks[0];

      expect(track.showTakeLanes).toBeFalsy();

      store.toggleTakeLanes(track.id);
      expect(useProjectStore.getState().project!.tracks[0].showTakeLanes).toBe(true);

      store.toggleTakeLanes(track.id);
      expect(useProjectStore.getState().project!.tracks[0].showTakeLanes).toBe(false);
    });
  });
});
