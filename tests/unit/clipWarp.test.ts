import { beforeEach, describe, expect, it } from 'vitest';
import { useProjectStore } from '../../src/store/projectStore';

describe('clip warp marker store actions', () => {
  let trackId: string;
  let clipId: string;

  beforeEach(() => {
    useProjectStore.getState().createProject({ name: 'Test', bpm: 120 });
    const track = useProjectStore.getState().addTrack('stems');
    trackId = track.id;
    const clip = useProjectStore.getState().addClip(trackId, {
      startTime: 0, duration: 8, prompt: 'drums', lyrics: '',
    });
    clipId = clip!.id;
  });

  it('setWarpMarkers sets warp markers on a clip', () => {
    const markers = [
      { originalTime: 0.5, quantizedTime: 0.5 },
      { originalTime: 1.3, quantizedTime: 1.0 },
    ];
    useProjectStore.getState().setWarpMarkers(clipId, markers);
    const clip = useProjectStore.getState().getClipById(clipId);
    expect(clip?.warpMarkers).toEqual(markers);
  });

  it('addWarpMarker appends a marker and sorts by originalTime', () => {
    useProjectStore.getState().setWarpMarkers(clipId, [
      { originalTime: 1.0, quantizedTime: 1.0 },
    ]);
    useProjectStore.getState().addWarpMarker(clipId, { originalTime: 0.5, quantizedTime: 0.5 });
    const clip = useProjectStore.getState().getClipById(clipId);
    expect(clip?.warpMarkers).toHaveLength(2);
    expect(clip?.warpMarkers![0].originalTime).toBe(0.5);
    expect(clip?.warpMarkers![1].originalTime).toBe(1.0);
  });

  it('removeWarpMarker removes a marker by index', () => {
    useProjectStore.getState().setWarpMarkers(clipId, [
      { originalTime: 0.5, quantizedTime: 0.5 },
      { originalTime: 1.0, quantizedTime: 1.0 },
      { originalTime: 2.0, quantizedTime: 2.0 },
    ]);
    useProjectStore.getState().removeWarpMarker(clipId, 1);
    const clip = useProjectStore.getState().getClipById(clipId);
    expect(clip?.warpMarkers).toHaveLength(2);
    expect(clip?.warpMarkers![0].originalTime).toBe(0.5);
    expect(clip?.warpMarkers![1].originalTime).toBe(2.0);
  });

  it('resetWarp clears warp markers, timeStretchRate, and pitchShift', () => {
    useProjectStore.getState().setWarpMarkers(clipId, [
      { originalTime: 0.5, quantizedTime: 0.5 },
    ]);
    useProjectStore.getState().setClipTimeStretch(clipId, 1.5);
    useProjectStore.getState().setClipPitchShift(clipId, 2);
    useProjectStore.getState().resetWarp(clipId);
    const clip = useProjectStore.getState().getClipById(clipId);
    expect(clip?.warpMarkers).toBeUndefined();
    expect(clip?.timeStretchRate).toBeUndefined();
    expect(clip?.pitchShift).toBeUndefined();
    expect(clip?.stretchMode).toBeUndefined();
  });

  it('setWarpMarkers is undoable', () => {
    useProjectStore.getState().setWarpMarkers(clipId, [
      { originalTime: 0.5, quantizedTime: 0.5 },
    ]);
    expect(useProjectStore.getState().getClipById(clipId)?.warpMarkers).toHaveLength(1);
    useProjectStore.getState().undo();
    expect(useProjectStore.getState().getClipById(clipId)?.warpMarkers).toBeUndefined();
  });

  it('stretchClipToFit stretches clip duration to target bars', () => {
    // At 120 BPM, 1 bar = 2 seconds. 4 bars = 8 seconds.
    // Clip is 8s, stretch to 4 bars (8s at 120BPM) => rate = 1.0
    // Stretch to 2 bars (4s at 120BPM) => rate = 2.0 (double speed)
    useProjectStore.getState().stretchClipToFit(clipId, 4); // 4 seconds target
    const clip = useProjectStore.getState().getClipById(clipId);
    expect(clip?.timeStretchRate).toBeCloseTo(2.0);
  });
});
