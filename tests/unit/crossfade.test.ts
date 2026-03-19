import { beforeEach, describe, expect, it } from 'vitest';
import { useProjectStore } from '../../src/store/projectStore';
import {
  computeCrossfadeRegions,
  getCrossfadeGainAtTime,
} from '../../src/utils/crossfade';
import type { Clip } from '../../src/types/project';

describe('crossfade utilities', () => {
  function makeClip(overrides: Partial<Clip>): Clip {
    return {
      id: 'c1',
      trackId: 't1',
      startTime: 0,
      duration: 4,
      prompt: '',
      lyrics: '',
      generationStatus: 'ready',
      generationJobId: null,
      cumulativeMixKey: null,
      isolatedAudioKey: null,
      waveformPeaks: null,
      ...overrides,
    };
  }

  describe('computeCrossfadeRegions', () => {
    it('returns empty array when clips do not overlap', () => {
      const clips = [
        makeClip({ id: 'a', startTime: 0, duration: 4 }),
        makeClip({ id: 'b', startTime: 4, duration: 4 }),
      ];
      expect(computeCrossfadeRegions(clips)).toEqual([]);
    });

    it('detects overlap between two adjacent clips', () => {
      const clips = [
        makeClip({ id: 'a', startTime: 0, duration: 5 }),
        makeClip({ id: 'b', startTime: 3, duration: 4 }),
      ];
      const regions = computeCrossfadeRegions(clips);
      expect(regions).toHaveLength(1);
      expect(regions[0].startTime).toBe(3);
      expect(regions[0].endTime).toBe(5);
      expect(regions[0].duration).toBe(2);
      expect(regions[0].clipAId).toBe('a');
      expect(regions[0].clipBId).toBe('b');
    });

    it('handles multiple overlaps', () => {
      const clips = [
        makeClip({ id: 'a', startTime: 0, duration: 5 }),
        makeClip({ id: 'b', startTime: 3, duration: 5 }),
        makeClip({ id: 'c', startTime: 6, duration: 4 }),
      ];
      const regions = computeCrossfadeRegions(clips);
      expect(regions).toHaveLength(2);
    });
  });

  describe('getCrossfadeGainAtTime', () => {
    it('returns correct fade-out gain for outgoing clip (linear)', () => {
      // Crossfade region: 3-5, outgoing clip fades from 1 to 0
      const gain = getCrossfadeGainAtTime(3, 5, 4, 'out', 'linear');
      expect(gain).toBeCloseTo(0.5);
    });

    it('returns correct fade-in gain for incoming clip (linear)', () => {
      const gain = getCrossfadeGainAtTime(3, 5, 4, 'in', 'linear');
      expect(gain).toBeCloseTo(0.5);
    });

    it('returns 1 for incoming clip at end of crossfade', () => {
      const gain = getCrossfadeGainAtTime(3, 5, 5, 'in', 'linear');
      expect(gain).toBeCloseTo(1.0);
    });

    it('returns 0 for outgoing clip at end of crossfade', () => {
      const gain = getCrossfadeGainAtTime(3, 5, 5, 'out', 'linear');
      expect(gain).toBeCloseTo(0.0);
    });

    it('supports equal-power crossfade curve', () => {
      const gainIn = getCrossfadeGainAtTime(0, 2, 1, 'in', 'equal-power');
      const gainOut = getCrossfadeGainAtTime(0, 2, 1, 'out', 'equal-power');
      // Equal-power: sum of squares ≈ 1
      expect(gainIn * gainIn + gainOut * gainOut).toBeCloseTo(1.0);
    });
  });
});

describe('crossfade store actions', () => {
  let trackId: string;

  beforeEach(() => {
    useProjectStore.getState().createProject({ name: 'Test', bpm: 120 });
    const track = useProjectStore.getState().addTrack('stems');
    trackId = track.id;
  });

  it('createCrossfade sets fade-out on clip A and fade-in on clip B', () => {
    const clipA = useProjectStore.getState().addClip(trackId, {
      startTime: 0, duration: 5, prompt: 'a', lyrics: '',
    })!;
    const clipB = useProjectStore.getState().addClip(trackId, {
      startTime: 3, duration: 5, prompt: 'b', lyrics: '',
    })!;
    useProjectStore.getState().createCrossfade(clipA.id, clipB.id);
    const a = useProjectStore.getState().getClipById(clipA.id);
    const b = useProjectStore.getState().getClipById(clipB.id);
    // Overlap is 2 seconds (3 to 5)
    expect(a?.fadeOutDuration).toBe(2);
    expect(b?.fadeInDuration).toBe(2);
  });

  it('createCrossfade does nothing when clips do not overlap', () => {
    const clipA = useProjectStore.getState().addClip(trackId, {
      startTime: 0, duration: 4, prompt: 'a', lyrics: '',
    })!;
    const clipB = useProjectStore.getState().addClip(trackId, {
      startTime: 4, duration: 4, prompt: 'b', lyrics: '',
    })!;
    useProjectStore.getState().createCrossfade(clipA.id, clipB.id);
    const a = useProjectStore.getState().getClipById(clipA.id);
    const b = useProjectStore.getState().getClipById(clipB.id);
    expect(a?.fadeOutDuration).toBeFalsy();
    expect(b?.fadeInDuration).toBeFalsy();
  });

  it('createCrossfade is undoable', () => {
    const clipA = useProjectStore.getState().addClip(trackId, {
      startTime: 0, duration: 5, prompt: 'a', lyrics: '',
    })!;
    const clipB = useProjectStore.getState().addClip(trackId, {
      startTime: 3, duration: 5, prompt: 'b', lyrics: '',
    })!;
    useProjectStore.getState().createCrossfade(clipA.id, clipB.id);
    expect(useProjectStore.getState().getClipById(clipA.id)?.fadeOutDuration).toBe(2);
    useProjectStore.getState().undo();
    expect(useProjectStore.getState().getClipById(clipA.id)?.fadeOutDuration).toBeFalsy();
  });
});
