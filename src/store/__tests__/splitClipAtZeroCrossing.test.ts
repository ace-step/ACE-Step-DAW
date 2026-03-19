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

describe('splitClipAtZeroCrossing', () => {
  let clipId: string;
  let trackId: string;

  beforeEach(() => {
    vi.clearAllMocks();
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject();
    const track = useProjectStore.getState().addTrack('stems');
    trackId = track.id;
    const clip = useProjectStore.getState().addClip(trackId, {
      startTime: 0, duration: 4, prompt: 'test', lyrics: '',
    });
    clipId = clip.id;
    useProjectStore.getState().updateClip(clipId, {
      audioDuration: 4,
      audioOffset: 0,
      generationStatus: 'ready',
      isolatedAudioKey: 'test-audio-key',
    });
  });

  it('snaps split time to nearest zero crossing', async () => {
    // 4000 samples at 1000 Hz → 4 seconds
    // Zero crossing at sample 1199→1200
    const samples = new Float32Array(4000);
    for (let i = 0; i < 4000; i++) {
      samples[i] = i < 1200 ? 0.5 : -0.5;
    }
    samples[1199] = 0.02;
    samples[1200] = -0.03;
    const buffer = fakeAudioBuffer(samples, 1000);

    vi.mocked(loadAudioBlobByKey).mockResolvedValue(new Blob(['fake']));
    vi.mocked(getAudioEngine).mockReturnValue({
      decodeAudioData: vi.fn().mockResolvedValue(buffer),
    } as any);

    // Split at 1.203s — snaps to sample 1199 (time 1.199s)
    await useProjectStore.getState().splitClipAtZeroCrossing(clipId, 1.203);

    const clips = useProjectStore.getState().project!.tracks[0].clips;
    expect(clips).toHaveLength(2);
    expect(clips[0].duration).toBeCloseTo(1.199, 3);
    expect(clips[1].startTime).toBeCloseTo(1.199, 3);
  });

  it('falls back to original split time when audio buffer is unavailable', async () => {
    vi.mocked(loadAudioBlobByKey).mockResolvedValue(null);

    await useProjectStore.getState().splitClipAtZeroCrossing(clipId, 2.0);

    const clips = useProjectStore.getState().project!.tracks[0].clips;
    expect(clips).toHaveLength(2);
    expect(clips[0].duration).toBeCloseTo(2.0, 2);
    expect(clips[1].startTime).toBeCloseTo(2.0, 2);
  });

  it('falls back when clip has no isolatedAudioKey', async () => {
    useProjectStore.getState().updateClip(clipId, { isolatedAudioKey: null });

    await useProjectStore.getState().splitClipAtZeroCrossing(clipId, 2.0);

    const clips = useProjectStore.getState().project!.tracks[0].clips;
    expect(clips).toHaveLength(2);
    expect(clips[0].duration).toBeCloseTo(2.0, 2);
  });

  it('does nothing for invalid split time', async () => {
    await useProjectStore.getState().splitClipAtZeroCrossing(clipId, 10);

    const clips = useProjectStore.getState().project!.tracks[0].clips;
    expect(clips).toHaveLength(1);
  });

  it('accounts for audioOffset when snapping', async () => {
    useProjectStore.getState().updateClip(clipId, {
      audioOffset: 1,
      audioDuration: 5,
    });

    // 5000 samples at 1000 Hz → 5 seconds
    // Zero crossing at sample 1999→2000 (buffer time 2.0s)
    const samples = new Float32Array(5000);
    for (let i = 0; i < 5000; i++) {
      samples[i] = i < 2000 ? 0.5 : -0.5;
    }
    samples[1999] = 0.02;
    samples[2000] = -0.03;
    const buffer = fakeAudioBuffer(samples, 1000);

    vi.mocked(loadAudioBlobByKey).mockResolvedValue(new Blob(['fake']));
    vi.mocked(getAudioEngine).mockReturnValue({
      decodeAudioData: vi.fn().mockResolvedValue(buffer),
    } as any);

    // Split at absolute time 1.003s
    // Buffer time = audioOffset + (1.003 - 0) = 2.003s → sample 2003
    // Search 5ms = 5 samples → finds crossing at 1999→2000, picks 1999
    // Snapped buffer time = 1.999s → absolute = 0 + (1.999 - 1) = 0.999s
    await useProjectStore.getState().splitClipAtZeroCrossing(clipId, 1.003);

    const clips = useProjectStore.getState().project!.tracks[0].clips;
    expect(clips).toHaveLength(2);
    expect(clips[0].duration).toBeCloseTo(0.999, 3);
    expect(clips[1].startTime).toBeCloseTo(0.999, 3);
  });

  it('falls back gracefully when decoding fails', async () => {
    vi.mocked(loadAudioBlobByKey).mockResolvedValue(new Blob(['fake']));
    vi.mocked(getAudioEngine).mockReturnValue({
      decodeAudioData: vi.fn().mockRejectedValue(new Error('decode failed')),
    } as any);

    await useProjectStore.getState().splitClipAtZeroCrossing(clipId, 2.0);

    const clips = useProjectStore.getState().project!.tracks[0].clips;
    expect(clips).toHaveLength(2);
    expect(clips[0].duration).toBeCloseTo(2.0, 2);
  });
});
