import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useProjectStore } from '../projectStore';

vi.mock('../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

describe('clip gain envelope store actions', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject();
    const track = useProjectStore.getState().addTrack('vocals');
    useProjectStore.getState().addClip(track.id, {
      startTime: 0,
      duration: 10,
      prompt: 'test',
      lyrics: '',
    });
  });

  function getClip() {
    return useProjectStore.getState().project!.tracks[0].clips[0];
  }

  describe('setClipGainEnvelope', () => {
    it('sets the full gain envelope on a clip', () => {
      const clip = getClip();
      const envelope = [
        { time: 0, gain: 1.0 },
        { time: 5, gain: 0.5 },
      ];
      useProjectStore.getState().setClipGainEnvelope(clip.id, envelope);
      expect(getClip().gainEnvelope).toEqual(envelope);
    });

    it('replaces existing envelope', () => {
      const clip = getClip();
      useProjectStore.getState().setClipGainEnvelope(clip.id, [{ time: 0, gain: 1 }]);
      useProjectStore.getState().setClipGainEnvelope(clip.id, [{ time: 1, gain: 0.5 }]);
      expect(getClip().gainEnvelope).toEqual([{ time: 1, gain: 0.5 }]);
    });

    it('clears envelope when set to empty array', () => {
      const clip = getClip();
      useProjectStore.getState().setClipGainEnvelope(clip.id, [{ time: 0, gain: 1 }]);
      useProjectStore.getState().setClipGainEnvelope(clip.id, []);
      expect(getClip().gainEnvelope).toEqual([]);
    });
  });

  describe('addClipGainPoint', () => {
    it('adds a point and keeps envelope sorted by time', () => {
      const clip = getClip();
      useProjectStore.getState().setClipGainEnvelope(clip.id, [
        { time: 0, gain: 1 },
        { time: 4, gain: 0.5 },
      ]);
      useProjectStore.getState().addClipGainPoint(clip.id, { time: 2, gain: 0.8 });
      expect(getClip().gainEnvelope).toEqual([
        { time: 0, gain: 1 },
        { time: 2, gain: 0.8 },
        { time: 4, gain: 0.5 },
      ]);
    });

    it('creates envelope if none exists', () => {
      const clip = getClip();
      useProjectStore.getState().addClipGainPoint(clip.id, { time: 1, gain: 0.7 });
      expect(getClip().gainEnvelope).toEqual([{ time: 1, gain: 0.7 }]);
    });
  });

  describe('removeClipGainPoint', () => {
    it('removes a point by index', () => {
      const clip = getClip();
      useProjectStore.getState().setClipGainEnvelope(clip.id, [
        { time: 0, gain: 1 },
        { time: 2, gain: 0.5 },
        { time: 4, gain: 0.8 },
      ]);
      useProjectStore.getState().removeClipGainPoint(clip.id, 1);
      expect(getClip().gainEnvelope).toEqual([
        { time: 0, gain: 1 },
        { time: 4, gain: 0.8 },
      ]);
    });

    it('no-ops for out-of-range index', () => {
      const clip = getClip();
      useProjectStore.getState().setClipGainEnvelope(clip.id, [{ time: 0, gain: 1 }]);
      useProjectStore.getState().removeClipGainPoint(clip.id, 5);
      expect(getClip().gainEnvelope).toEqual([{ time: 0, gain: 1 }]);
    });
  });

  describe('updateClipGainPoint', () => {
    it('updates a point and re-sorts by time', () => {
      const clip = getClip();
      useProjectStore.getState().setClipGainEnvelope(clip.id, [
        { time: 0, gain: 1 },
        { time: 2, gain: 0.5 },
        { time: 4, gain: 0.8 },
      ]);
      useProjectStore.getState().updateClipGainPoint(clip.id, 1, { gain: 0.3 });
      expect(getClip().gainEnvelope![1]).toEqual({ time: 2, gain: 0.3 });
    });

    it('re-sorts when time changes', () => {
      const clip = getClip();
      useProjectStore.getState().setClipGainEnvelope(clip.id, [
        { time: 0, gain: 1 },
        { time: 2, gain: 0.5 },
        { time: 4, gain: 0.8 },
      ]);
      useProjectStore.getState().updateClipGainPoint(clip.id, 0, { time: 5 });
      expect(getClip().gainEnvelope).toEqual([
        { time: 2, gain: 0.5 },
        { time: 4, gain: 0.8 },
        { time: 5, gain: 1 },
      ]);
    });
  });
});
