import { describe, it, expect, beforeEach } from 'vitest';
import { useTransportStore } from '../transportStore';

describe('transportStore', () => {
  beforeEach(() => {
    useTransportStore.setState({
      isPlaying: false,
      isRecording: false,
      armedTrackIds: [],
      countInActive: false,
      countInBeat: 0,
      currentTime: 0,
      playStartTime: 0,
      loopEnabled: false,
      loopStart: 0,
      loopEnd: 0,
      metronomeEnabled: false,
      metronomeSound: 'click',
      metronomeVolume: 0.5,
      punchInTime: null,
      punchOutTime: null,
      punchEnabled: false,
      countInBars: 1,
      loopRecordingEnabled: false,
      loopCycleCount: 0,
      launchedSessionClips: {},
      sessionArrangementRecording: false,
      sessionArrangementRecordStartTime: null,
      sessionArrangementRecordEvents: [],
    });
  });

  describe('play/pause/stop', () => {
    it('starts in a stopped state', () => {
      const state = useTransportStore.getState();
      expect(state.isPlaying).toBe(false);
      expect(state.currentTime).toBe(0);
    });

    it('play sets isPlaying to true', () => {
      useTransportStore.getState().play();
      expect(useTransportStore.getState().isPlaying).toBe(true);
    });

    it('pause sets isPlaying to false', () => {
      useTransportStore.getState().play();
      useTransportStore.getState().pause();
      expect(useTransportStore.getState().isPlaying).toBe(false);
    });

    it('stop resets isPlaying and currentTime', () => {
      useTransportStore.getState().play();
      useTransportStore.getState().seek(10);
      useTransportStore.getState().stop();
      const state = useTransportStore.getState();
      expect(state.isPlaying).toBe(false);
      expect(state.currentTime).toBe(0);
    });
  });

  describe('seek', () => {
    it('seeks to a positive time', () => {
      useTransportStore.getState().seek(5.5);
      expect(useTransportStore.getState().currentTime).toBe(5.5);
    });

    it('clamps negative time to 0', () => {
      useTransportStore.getState().seek(-10);
      expect(useTransportStore.getState().currentTime).toBe(0);
    });
  });

  describe('loop', () => {
    it('toggles loop on and off', () => {
      useTransportStore.getState().toggleLoop();
      expect(useTransportStore.getState().loopEnabled).toBe(true);
      useTransportStore.getState().toggleLoop();
      expect(useTransportStore.getState().loopEnabled).toBe(false);
    });

    it('sets loop region', () => {
      useTransportStore.getState().setLoopRegion(4, 16);
      const state = useTransportStore.getState();
      expect(state.loopStart).toBe(4);
      expect(state.loopEnd).toBe(16);
    });
  });

  describe('metronome', () => {
    it('toggles metronome on and off', () => {
      useTransportStore.getState().toggleMetronome();
      expect(useTransportStore.getState().metronomeEnabled).toBe(true);
      useTransportStore.getState().toggleMetronome();
      expect(useTransportStore.getState().metronomeEnabled).toBe(false);
    });
  });

  describe('metronome sound and volume', () => {
    it('setMetronomeSound changes metronome sound', () => {
      expect(useTransportStore.getState().metronomeSound).toBe('click');
      useTransportStore.getState().setMetronomeSound('woodblock');
      expect(useTransportStore.getState().metronomeSound).toBe('woodblock');
      useTransportStore.getState().setMetronomeSound('beep');
      expect(useTransportStore.getState().metronomeSound).toBe('beep');
    });

    it('setMetronomeVolume sets volume clamped to 0-1', () => {
      expect(useTransportStore.getState().metronomeVolume).toBe(0.5);
      useTransportStore.getState().setMetronomeVolume(0.8);
      expect(useTransportStore.getState().metronomeVolume).toBe(0.8);
      useTransportStore.getState().setMetronomeVolume(-0.5);
      expect(useTransportStore.getState().metronomeVolume).toBe(0);
      useTransportStore.getState().setMetronomeVolume(1.5);
      expect(useTransportStore.getState().metronomeVolume).toBe(1);
    });
  });

  describe('track arming', () => {
    it('arms a track', () => {
      useTransportStore.getState().armTrack('track-1');
      expect(useTransportStore.getState().armedTrackIds).toContain('track-1');
    });

    it('does not duplicate armed track', () => {
      useTransportStore.getState().armTrack('track-1');
      useTransportStore.getState().armTrack('track-1');
      expect(useTransportStore.getState().armedTrackIds).toEqual(['track-1']);
    });

    it('disarms a track', () => {
      useTransportStore.getState().armTrack('track-1');
      useTransportStore.getState().disarmTrack('track-1');
      expect(useTransportStore.getState().armedTrackIds).not.toContain('track-1');
    });

    it('toggles arm state', () => {
      useTransportStore.getState().toggleArmTrack('track-1');
      expect(useTransportStore.getState().armedTrackIds).toContain('track-1');
      useTransportStore.getState().toggleArmTrack('track-1');
      expect(useTransportStore.getState().armedTrackIds).not.toContain('track-1');
    });
  });

  describe('recording', () => {
    it('sets recording state', () => {
      useTransportStore.getState().setIsRecording(true);
      expect(useTransportStore.getState().isRecording).toBe(true);
      useTransportStore.getState().setIsRecording(false);
      expect(useTransportStore.getState().isRecording).toBe(false);
    });
  });

  describe('session launch state', () => {
    it('stores launched session clips per track', () => {
      useTransportStore.getState().launchSessionClip('track-1', 'clip-1', 0, 12);

      expect(useTransportStore.getState().launchedSessionClips['track-1']).toEqual({
        clipId: 'clip-1',
        sceneIndex: 0,
        launchedAt: 12,
      });
    });

    it('launches a scene across multiple tracks', () => {
      useTransportStore.getState().launchSessionScene(2, [
        { trackId: 'track-1', clipId: 'clip-a' },
        { trackId: 'track-2', clipId: 'clip-b' },
      ], 8);

      expect(useTransportStore.getState().launchedSessionClips).toEqual({
        'track-1': { clipId: 'clip-a', sceneIndex: 2, launchedAt: 8 },
        'track-2': { clipId: 'clip-b', sceneIndex: 2, launchedAt: 8 },
      });
    });

    it('captures session arrangement record events until stopped', () => {
      useTransportStore.getState().launchSessionClip('track-1', 'clip-1', 0, 0);
      useTransportStore.getState().startSessionArrangementRecording(4);
      useTransportStore.getState().launchSessionClip('track-1', 'clip-2', 1, 6);
      useTransportStore.getState().stopSessionArrangementRecording(10);

      expect(useTransportStore.getState().sessionArrangementRecording).toBe(false);
      expect(useTransportStore.getState().sessionArrangementRecordEvents).toEqual([
        {
          trackId: 'track-1',
          clipId: 'clip-1',
          sceneIndex: 0,
          startTime: 4,
          endTime: 6,
        },
        {
          trackId: 'track-1',
          clipId: 'clip-2',
          sceneIndex: 1,
          startTime: 6,
          endTime: 10,
        },
      ]);
    });
  });

  describe('punch-in/out', () => {
    it('setPunchIn sets the punch-in time', () => {
      useTransportStore.getState().setPunchIn(4);
      expect(useTransportStore.getState().punchInTime).toBe(4);
    });

    it('setPunchOut sets the punch-out time', () => {
      useTransportStore.getState().setPunchOut(16);
      expect(useTransportStore.getState().punchOutTime).toBe(16);
    });

    it('togglePunch toggles punchEnabled', () => {
      expect(useTransportStore.getState().punchEnabled).toBe(false);
      useTransportStore.getState().togglePunch();
      expect(useTransportStore.getState().punchEnabled).toBe(true);
      useTransportStore.getState().togglePunch();
      expect(useTransportStore.getState().punchEnabled).toBe(false);
    });

    it('setPunchRange sets both times and enables punch', () => {
      useTransportStore.getState().setPunchRange(4, 16);
      const state = useTransportStore.getState();
      expect(state.punchInTime).toBe(4);
      expect(state.punchOutTime).toBe(16);
      expect(state.punchEnabled).toBe(true);
    });
  });

  describe('countInBars', () => {
    it('defaults to 1', () => {
      expect(useTransportStore.getState().countInBars).toBe(1);
    });

    it('setCountInBars updates the count-in bar count', () => {
      useTransportStore.getState().setCountInBars(2);
      expect(useTransportStore.getState().countInBars).toBe(2);
    });

    it('setCountInBars clamps to 0-4 range', () => {
      useTransportStore.getState().setCountInBars(0);
      expect(useTransportStore.getState().countInBars).toBe(0);
      useTransportStore.getState().setCountInBars(5);
      expect(useTransportStore.getState().countInBars).toBe(4);
      useTransportStore.getState().setCountInBars(-1);
      expect(useTransportStore.getState().countInBars).toBe(0);
    });
  });
});
