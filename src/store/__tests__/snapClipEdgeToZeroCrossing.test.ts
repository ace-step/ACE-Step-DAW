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

import { loadAudioBlobByKey } from '../../services/audioFileManager';
import { getAudioEngine } from '../../hooks/useAudioEngine';

function fakeAudioBuffer(samples: Float32Array, sampleRate: number) {
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

function setupMocks(samples: Float32Array, sampleRate: number) {
  const buffer = fakeAudioBuffer(samples, sampleRate);
  vi.mocked(loadAudioBlobByKey).mockResolvedValue(new Blob(['fake']));
  vi.mocked(getAudioEngine).mockReturnValue({
    decodeAudioData: vi.fn().mockResolvedValue(buffer),
  } as any);
  return buffer;
}

describe('snapClipEdgeToZeroCrossing', () => {
  let clipId: string;
  let trackId: string;

  beforeEach(() => {
    vi.clearAllMocks();
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject();
    const track = useProjectStore.getState().addTrack('stems');
    trackId = track.id;
    const clip = useProjectStore.getState().addClip(trackId, {
      startTime: 1, duration: 3, prompt: 'test', lyrics: '',
    });
    clipId = clip.id;
    useProjectStore.getState().updateClip(clipId, {
      audioDuration: 5,
      audioOffset: 1,
      generationStatus: 'ready',
      isolatedAudioKey: 'test-audio-key',
    });
  });

  it('snaps left edge to nearest zero crossing', async () => {
    // 5000 samples at 1000 Hz → 5 seconds
    // audioOffset = 1.0s → sample 1000
    // Zero crossing at sample 997→998 (time 0.998s)
    const samples = new Float32Array(5000);
    for (let i = 0; i < 5000; i++) {
      samples[i] = i < 998 ? 0.5 : -0.5;
    }
    samples[997] = 0.01;
    samples[998] = -0.02;
    setupMocks(samples, 1000);

    await useProjectStore.getState().snapClipEdgeToZeroCrossing(clipId, 'left');

    const clip = useProjectStore.getState().project!.tracks[0].clips[0];
    // audioOffset snaps from 1.0 to 0.997 (closer to zero)
    // delta = 0.997 - 1.0 = -0.003
    // startTime = 1 + (-0.003) = 0.997
    // duration = 3 - (-0.003) = 3.003
    expect(clip.audioOffset).toBeCloseTo(0.997, 3);
    expect(clip.startTime).toBeCloseTo(0.997, 3);
    expect(clip.duration).toBeCloseTo(3.003, 3);
  });

  it('snaps right edge to nearest zero crossing', async () => {
    // audioOffset=1, duration=3 → right edge at buffer time 4.0s → sample 4000
    // Zero crossing at sample 3998→3999 (time ~3.999s)
    const samples = new Float32Array(5000);
    for (let i = 0; i < 5000; i++) {
      samples[i] = i < 3999 ? 0.5 : -0.5;
    }
    samples[3998] = 0.01;
    samples[3999] = -0.02;
    setupMocks(samples, 1000);

    await useProjectStore.getState().snapClipEdgeToZeroCrossing(clipId, 'right');

    const clip = useProjectStore.getState().project!.tracks[0].clips[0];
    // right buffer time 4.0 snaps to 3.998 (sample 3998 is closer to zero)
    // newDuration = 3.998 - 1 = 2.998
    expect(clip.duration).toBeCloseTo(2.998, 3);
    expect(clip.startTime).toBe(1); // left edge unchanged
  });

  it('does nothing when no audio key is present', async () => {
    useProjectStore.getState().updateClip(clipId, {
      isolatedAudioKey: null,
      cumulativeMixKey: null,
    });

    await useProjectStore.getState().snapClipEdgeToZeroCrossing(clipId, 'left');

    const clip = useProjectStore.getState().project!.tracks[0].clips[0];
    expect(clip.startTime).toBe(1);
    expect(clip.duration).toBe(3);
  });

  it('does nothing when blob fails to load', async () => {
    vi.mocked(loadAudioBlobByKey).mockResolvedValue(null);

    await useProjectStore.getState().snapClipEdgeToZeroCrossing(clipId, 'left');

    const clip = useProjectStore.getState().project!.tracks[0].clips[0];
    expect(clip.startTime).toBe(1);
    expect(clip.duration).toBe(3);
  });

  it('does nothing when decode fails', async () => {
    vi.mocked(loadAudioBlobByKey).mockResolvedValue(new Blob(['fake']));
    vi.mocked(getAudioEngine).mockReturnValue({
      decodeAudioData: vi.fn().mockRejectedValue(new Error('decode failed')),
    } as any);

    await useProjectStore.getState().snapClipEdgeToZeroCrossing(clipId, 'right');

    const clip = useProjectStore.getState().project!.tracks[0].clips[0];
    expect(clip.duration).toBe(3);
  });

  it('does nothing when snapped duration would be too small', async () => {
    // Set up a clip with very small duration
    useProjectStore.getState().updateClip(clipId, {
      duration: 0.15,
      audioOffset: 1,
    });

    // Make zero crossing far away so duration becomes < 0.1
    const samples = new Float32Array(5000);
    for (let i = 0; i < 5000; i++) {
      samples[i] = 0.5; // no zero crossings — snap returns target
    }
    setupMocks(samples, 1000);

    // Left edge: audioOffset=1 stays at 1 (no crossing found),
    // delta=0 → no change
    await useProjectStore.getState().snapClipEdgeToZeroCrossing(clipId, 'left');

    const clip = useProjectStore.getState().project!.tracks[0].clips[0];
    expect(clip.duration).toBeCloseTo(0.15, 2);
  });

  it('pushes undo history on snap', async () => {
    const samples = new Float32Array(5000);
    for (let i = 0; i < 5000; i++) {
      samples[i] = i < 998 ? 0.5 : -0.5;
    }
    setupMocks(samples, 1000);

    await useProjectStore.getState().snapClipEdgeToZeroCrossing(clipId, 'left');

    // Undo should restore original values
    useProjectStore.getState().undo();
    const clip = useProjectStore.getState().project!.tracks[0].clips[0];
    expect(clip.startTime).toBe(1);
    expect(clip.duration).toBe(3);
    expect(clip.audioOffset).toBe(1);
  });
});
