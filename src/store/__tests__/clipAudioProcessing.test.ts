import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useProjectStore } from '../projectStore';

vi.mock('../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

vi.mock('../../services/audioFileManager', () => ({
  loadAudioBlobByKey: vi.fn(),
  saveAudioBlob: vi.fn(),
}));

vi.mock('../../hooks/useAudioEngine', () => ({
  getAudioEngine: vi.fn(),
}));

import { loadAudioBlobByKey, saveAudioBlob } from '../../services/audioFileManager';
import { getAudioEngine } from '../../hooks/useAudioEngine';

function fakeAudioBuffer(samples: Float32Array, sampleRate: number = 48000) {
  return {
    numberOfChannels: 1,
    sampleRate,
    length: samples.length,
    duration: samples.length / sampleRate,
    getChannelData: (ch: number) => {
      if (ch !== 0) throw new Error('only channel 0');
      return samples;
    },
  } as unknown as AudioBuffer;
}

describe('clip audio processing store actions', () => {
  let clipId: string;
  let trackId: string;

  beforeEach(() => {
    vi.clearAllMocks();
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject();
    const track = useProjectStore.getState().addTrack('stems');
    trackId = track.id;
    const clip = useProjectStore.getState().addClip(trackId, {
      startTime: 0, duration: 2, prompt: 'test', lyrics: '',
    });
    clipId = clip.id;
    useProjectStore.getState().updateClip(clipId, {
      audioDuration: 2,
      audioOffset: 0,
      generationStatus: 'ready',
      isolatedAudioKey: 'audio:test:clip:isolated:123',
      waveformPeaks: [0.1, 0.2, 0.3],
    });

    const samples = new Float32Array([0.1, 0.2, 0.5, 0.3]);
    const buffer = fakeAudioBuffer(samples, 1);
    const fakeBlob = new Blob(['audio'], { type: 'audio/wav' });

    (loadAudioBlobByKey as ReturnType<typeof vi.fn>).mockResolvedValue(fakeBlob);
    (saveAudioBlob as ReturnType<typeof vi.fn>).mockResolvedValue('audio:test:clip:isolated:new');
    (getAudioEngine as ReturnType<typeof vi.fn>).mockReturnValue({
      decodeAudioData: vi.fn().mockResolvedValue(buffer),
    });
  });

  describe('reverseClip', () => {
    it('updates clip with new audio key and waveform peaks', async () => {
      await useProjectStore.getState().reverseClip(clipId);

      const clip = useProjectStore.getState().getClipById(clipId);
      expect(clip?.isolatedAudioKey).toBe('audio:test:clip:isolated:new');
      expect(clip?.waveformPeaks).toBeDefined();
      expect(clip?.waveformPeaks!.length).toBeGreaterThan(0);
      expect(clip?.audioOffset).toBe(0);
      expect(clip?.audioDuration).toBe(2);
    });

    it('saves new audio blob via audioFileManager', async () => {
      await useProjectStore.getState().reverseClip(clipId);

      expect(saveAudioBlob).toHaveBeenCalledTimes(1);
      expect((saveAudioBlob as ReturnType<typeof vi.fn>).mock.calls[0][2]).toBe('isolated');
    });

    it('does nothing for clips without audio', async () => {
      useProjectStore.getState().updateClip(clipId, {
        isolatedAudioKey: null,
        cumulativeMixKey: null,
      });

      await useProjectStore.getState().reverseClip(clipId);

      expect(saveAudioBlob).not.toHaveBeenCalled();
    });

    it('does nothing for non-ready clips', async () => {
      useProjectStore.getState().updateClip(clipId, {
        generationStatus: 'pending',
      });

      await useProjectStore.getState().reverseClip(clipId);

      expect(saveAudioBlob).not.toHaveBeenCalled();
    });

    it('does nothing for warped clips', async () => {
      useProjectStore.getState().updateClip(clipId, {
        warpMarkers: [{ originalTime: 0.5, targetTime: 0.25 }],
      });

      await useProjectStore.getState().reverseClip(clipId);

      expect(saveAudioBlob).not.toHaveBeenCalled();
    });

    it('processes the current trimmed source window', async () => {
      useProjectStore.getState().updateClip(clipId, {
        duration: 2,
        audioDuration: 4,
        audioOffset: 1,
      });

      await useProjectStore.getState().reverseClip(clipId);

      const clip = useProjectStore.getState().getClipById(clipId);
      expect(clip?.audioOffset).toBe(0);
      expect(clip?.audioDuration).toBe(2);
    });

    it('bakes content offset into the clip timeline after processing', async () => {
      (getAudioEngine as ReturnType<typeof vi.fn>).mockReturnValueOnce({
        decodeAudioData: vi.fn().mockResolvedValue(fakeAudioBuffer(new Float32Array([0.1, 0.2, 0.3, 0.4]), 2)),
      });
      useProjectStore.getState().updateClip(clipId, {
        startTime: 1,
        duration: 2,
        audioDuration: 2,
        audioOffset: 0,
        contentOffset: 0.5,
      });

      await useProjectStore.getState().reverseClip(clipId);

      const clip = useProjectStore.getState().getClipById(clipId);
      expect(clip?.startTime).toBeCloseTo(1.5);
      expect(clip?.duration).toBeCloseTo(1.5);
      expect(clip?.contentOffset).toBeUndefined();
      expect(clip?.audioOffset).toBe(0);
      expect(clip?.audioDuration).toBeCloseTo(1.5);
    });

    it('clears stale cumulative generation context after replacing audio', async () => {
      useProjectStore.getState().updateClip(clipId, {
        cumulativeMixKey: 'audio:test:clip:cumulative:old',
        serverCumulativePath: '/tmp/old-cumulative.wav',
        generatedFromContext: true,
      });

      await useProjectStore.getState().reverseClip(clipId);

      const clip = useProjectStore.getState().getClipById(clipId);
      expect(clip?.cumulativeMixKey).toBeNull();
      expect(clip?.serverCumulativePath).toBeUndefined();
      expect(clip?.generatedFromContext).toBe(false);
    });

    it('syncs archived asset metadata after replacing clip audio', async () => {
      useProjectStore.setState((state) => ({
        project: state.project
          ? {
              ...state.project,
              assets: [{
                id: 'asset-1',
                clipId,
                trackDisplayName: 'Old Track',
                prompt: 'old',
                source: 'generated',
                isolatedAudioKey: 'audio:test:clip:isolated:old',
                cumulativeMixKey: null,
                waveformPeaks: [0.01],
                starred: true,
                createdAt: 1,
                duration: 2,
              }],
            }
          : state.project,
      }));

      await useProjectStore.getState().reverseClip(clipId);

      const asset = useProjectStore.getState().project?.assets?.[0];
      expect(asset?.isolatedAudioKey).toBe('audio:test:clip:isolated:new');
      expect(asset?.waveformPeaks?.length).toBeGreaterThan(0);
      expect(asset?.originClipSnapshot?.isolatedAudioKey).toBe('audio:test:clip:isolated:new');
    });
  });

  describe('normalizeClip', () => {
    it('updates clip with normalized audio', async () => {
      await useProjectStore.getState().normalizeClip(clipId);

      const clip = useProjectStore.getState().getClipById(clipId);
      expect(clip?.isolatedAudioKey).toBe('audio:test:clip:isolated:new');
      expect(clip?.waveformPeaks).toBeDefined();
    });

    it('saves audio through audioFileManager', async () => {
      await useProjectStore.getState().normalizeClip(clipId);

      expect(saveAudioBlob).toHaveBeenCalledTimes(1);
    });
  });

  describe('adjustClipGain', () => {
    it('applies gain adjustment and updates clip', async () => {
      await useProjectStore.getState().adjustClipGain(clipId, 3);

      const clip = useProjectStore.getState().getClipById(clipId);
      expect(clip?.isolatedAudioKey).toBe('audio:test:clip:isolated:new');
      expect(clip?.waveformPeaks).toBeDefined();
    });

    it('saves audio through audioFileManager', async () => {
      await useProjectStore.getState().adjustClipGain(clipId, -6);

      expect(saveAudioBlob).toHaveBeenCalledTimes(1);
    });

    it('does nothing for clips without audio', async () => {
      useProjectStore.getState().updateClip(clipId, {
        isolatedAudioKey: null,
        cumulativeMixKey: null,
      });

      await useProjectStore.getState().adjustClipGain(clipId, 3);

      expect(saveAudioBlob).not.toHaveBeenCalled();
    });
  });

  describe('setClipSpeedPreset', () => {
    it('resizes the clip to preserve the source when halving speed', () => {
      useProjectStore.getState().updateClip(clipId, {
        startTime: 1,
        duration: 2,
        audioDuration: 2,
        audioOffset: 0,
        contentOffset: 0.5,
      });

      useProjectStore.getState().setClipSpeedPreset(clipId, 0.5);

      const clip = useProjectStore.getState().getClipById(clipId);
      expect(clip?.timeStretchRate).toBe(0.5);
      expect(clip?.stretchMode).toBe('repitch');
      expect(clip?.startTime).toBeCloseTo(1.5);
      expect(clip?.duration).toBeCloseTo(3);
      expect(clip?.contentOffset).toBeUndefined();
    });

    it('does not shift repitched clips by stale content offset', () => {
      useProjectStore.getState().updateClip(clipId, {
        startTime: 1,
        duration: 2,
        audioDuration: 4,
        audioOffset: 0,
        contentOffset: 0.5,
        timeStretchRate: 2,
        stretchMode: 'repitch',
      });

      useProjectStore.getState().setClipSpeedPreset(clipId, 0.5);

      const clip = useProjectStore.getState().getClipById(clipId);
      expect(clip?.startTime).toBeCloseTo(1);
      expect(clip?.duration).toBeCloseTo(8);
      expect(clip?.contentOffset).toBeUndefined();
    });

    it('resizes the clip to preserve the source when resetting speed', () => {
      useProjectStore.getState().updateClip(clipId, {
        duration: 4,
        audioDuration: 2,
        audioOffset: 0,
        timeStretchRate: 0.5,
        stretchMode: 'complex',
        warpMarkers: [{ originalTime: 0.5, targetTime: 1 }],
      });

      useProjectStore.getState().setClipSpeedPreset(clipId, 1);

      const clip = useProjectStore.getState().getClipById(clipId);
      expect(clip?.timeStretchRate).toBe(1);
      expect(clip?.stretchMode).toBe('repitch');
      expect(clip?.duration).toBeCloseTo(2);
      expect(clip?.warpMarkers).toBeUndefined();
    });
  });
});
