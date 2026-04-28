import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useProjectStore } from '../../src/store/projectStore';
import { useTransportStore } from '../../src/store/transportStore';

vi.mock('../../src/services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

describe('session visual feedback state', () => {
  beforeEach(() => {
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useTransportStore.setState(useTransportStore.getInitialState(), true);
    useProjectStore.getState().createProject({ bpm: 120, timeSignature: 4 });
  });

  function addTrackWithClips(count: number) {
    const store = useProjectStore.getState();
    const track = store.addTrack('drums');
    const clips = [];
    for (let i = 0; i < count; i++) {
      const clip = store.addClip(track.id, {
        startTime: i * 4,
        duration: 4,
        prompt: `Clip ${i + 1}`,
        globalCaption: '',
        lyrics: '',
        source: 'uploaded',
      });
      clips.push(clip);
    }
    return { track, clips };
  }

  describe('queued state detection', () => {
    it('clip is queued when a clip-type pending launch exists for it', () => {
      const { track, clips } = addTrackWithClips(2);
      const session = useProjectStore.getState().project!.session!;
      const slot = session.slots.find((s) => s.trackId === track.id && s.clipId === clips[0].id)!;

      // Simulate transport playing with quantization
      useTransportStore.setState({ isPlaying: true, currentTime: 0.5 });

      // Launch clip (will be queued because transport is playing)
      useProjectStore.getState().launchSessionClip(track.id, slot.sceneId);

      const pending = useProjectStore.getState().project!.session!.pendingLaunches;
      expect(pending.length).toBeGreaterThanOrEqual(1);
      expect(pending.some((p) => p.type === 'clip' && p.trackId === track.id)).toBe(true);
    });

    it('clip is queued when a scene-type pending launch includes its scene', () => {
      const { track, clips } = addTrackWithClips(2);
      const session = useProjectStore.getState().project!.session!;
      const scene0Id = session.scenes[0].id;

      // Transport playing
      useTransportStore.setState({ isPlaying: true, currentTime: 0.5 });

      // Launch scene (queued)
      useProjectStore.getState().launchSessionScene(scene0Id);

      const pending = useProjectStore.getState().project!.session!.pendingLaunches;
      expect(pending.some((p) => p.type === 'scene' && p.sceneId === scene0Id)).toBe(true);
    });
  });

  describe('recording state', () => {
    it('tracks active clips during arrangement recording', () => {
      const { track, clips } = addTrackWithClips(2);
      const session = useProjectStore.getState().project!.session!;
      const scene0Id = session.scenes[0].id;

      // Launch a clip first
      useProjectStore.getState().launchSessionScene(scene0Id);

      // Start recording
      useProjectStore.getState().startSessionArrangementRecording(0);

      const state = useProjectStore.getState().project!.session!;
      expect(state.isRecordingToArrangement).toBe(true);
      expect(state.activeClipIdsByTrackId[track.id]).toBe(clips[0].id);
    });

    it('records launch events when clips are switched during recording', () => {
      const { track, clips } = addTrackWithClips(3);
      const session = useProjectStore.getState().project!.session!;

      // Launch scene 0 and start recording
      useProjectStore.getState().launchSessionScene(session.scenes[0].id);
      useProjectStore.getState().startSessionArrangementRecording(0);

      // Switch to scene 1
      useProjectStore.getState().launchSessionScene(session.scenes[1].id);

      const state = useProjectStore.getState().project!.session!;
      expect(state.recordedLaunches.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('active clip tracking', () => {
    it('sets activeClipIdsByTrackId when clip is launched', () => {
      const { track, clips } = addTrackWithClips(2);
      const session = useProjectStore.getState().project!.session!;

      useProjectStore.getState().launchSessionScene(session.scenes[0].id);

      const state = useProjectStore.getState().project!.session!;
      expect(state.activeClipIdsByTrackId[track.id]).toBe(clips[0].id);
    });

    it('clears activeClipIdsByTrackId when track is stopped', () => {
      const { track, clips } = addTrackWithClips(2);
      const session = useProjectStore.getState().project!.session!;

      useProjectStore.getState().launchSessionScene(session.scenes[0].id);
      useProjectStore.getState().stopSessionTrack(track.id);

      const state = useProjectStore.getState().project!.session!;
      expect(state.activeClipIdsByTrackId[track.id]).toBeNull();
    });
  });
});
