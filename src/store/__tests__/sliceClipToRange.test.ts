import { beforeEach, describe, expect, it, vi } from 'vitest';
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
    getChannelData: (channel: number) => {
      if (channel !== 0) throw new Error('only channel 0');
      return samples;
    },
  } as unknown as AudioBuffer;
}

describe('sliceClipToRange', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject({ bpm: 120 });
  });

  it('isolates a middle audio region into three segments while preserving offsets and peaks', async () => {
    const track = useProjectStore.getState().addTrack('vocals');
    const clip = useProjectStore.getState().addClip(track.id, {
      startTime: 0,
      duration: 6,
      prompt: 'vox',
      lyrics: '',
      source: 'uploaded',
    });

    useProjectStore.getState().updateClip(clip.id, {
      generationStatus: 'ready',
      isolatedAudioKey: null,
      waveformPeaks: [0.1, 0.2, 0.3, 0.4],
      audioDuration: 8,
      audioOffset: 0,
      contentOffset: 1,
    });

    const resultId = await useProjectStore.getState().sliceClipToRange(clip.id, 2, 4);
    const clips = useProjectStore.getState().project!.tracks[0].clips;
    const selectedClip = clips.find((candidate) => candidate.id === clip.id)!;

    expect(resultId).toBe(clip.id);
    expect(clips).toHaveLength(3);
    expect(selectedClip.startTime).toBe(2);
    expect(selectedClip.duration).toBe(2);
    expect(selectedClip.audioOffset).toBe(1);
    expect(selectedClip.contentOffset).toBeUndefined();
    expect(selectedClip.waveformPeaks).toEqual([0.1, 0.2, 0.3, 0.4]);
    expect(clips.map((candidate) => [candidate.startTime, candidate.duration])).toEqual([
      [0, 2],
      [2, 2],
      [4, 2],
    ]);
  });

  it('returns the original clip id without mutating when the selected range covers the full clip', async () => {
    const track = useProjectStore.getState().addTrack('vocals');
    const clip = useProjectStore.getState().addClip(track.id, {
      startTime: 1,
      duration: 4,
      prompt: 'vox',
      lyrics: '',
      source: 'uploaded',
    });

    const resultId = await useProjectStore.getState().sliceClipToRange(clip.id, 0, 8);

    expect(resultId).toBe(clip.id);
    expect(useProjectStore.getState().project!.tracks[0].clips).toHaveLength(1);
    expect(useProjectStore.getState().project!.tracks[0].clips[0].startTime).toBe(1);
  });

  it('snaps both boundaries to nearby zero crossings for audio clips', async () => {
    const track = useProjectStore.getState().addTrack('vocals');
    const clip = useProjectStore.getState().addClip(track.id, {
      startTime: 0,
      duration: 4,
      prompt: 'vox',
      lyrics: '',
      source: 'uploaded',
    });

    useProjectStore.getState().updateClip(clip.id, {
      generationStatus: 'ready',
      isolatedAudioKey: 'audio-key',
      audioDuration: 4,
      audioOffset: 0,
    });

    const samples = new Float32Array(4000);
    for (let i = 0; i < 4000; i++) {
      if (i < 1000) {
        samples[i] = 0.4;
      } else if (i < 3000) {
        samples[i] = -0.4;
      } else {
        samples[i] = 0.4;
      }
    }
    samples[999] = 0.02;
    samples[1000] = -0.03;
    samples[2999] = -0.02;
    samples[3000] = 0.03;

    vi.mocked(loadAudioBlobByKey).mockResolvedValue(new Blob(['fake']));
    vi.mocked(getAudioEngine).mockReturnValue({
      decodeAudioData: vi.fn().mockResolvedValue(fakeAudioBuffer(samples, 1000)),
    } as any);

    await useProjectStore.getState().sliceClipToRange(clip.id, 1.003, 2.997);
    const selectedClip = useProjectStore.getState().project!.tracks[0].clips.find((candidate) => candidate.id === clip.id)!;

    expect(selectedClip.startTime).toBeCloseTo(0.999, 3);
    expect(selectedClip.duration).toBeCloseTo(2.0, 3);
  });

  it('grid-snaps MIDI boundaries and trims note content into the isolated segment', async () => {
    const track = useProjectStore.getState().addTrack('synth', 'pianoRoll');
    const clip = useProjectStore.getState().addClip(track.id, {
      startTime: 0,
      duration: 2,
      prompt: 'MIDI clip',
      lyrics: '',
      midiData: {
        grid: '1/16',
        notes: [{
          id: 'note-1',
          pitch: 60,
          startBeat: 0,
          durationBeats: 4,
          velocity: 0.8,
        }],
      },
      source: 'uploaded',
    });

    const resultId = await useProjectStore.getState().sliceClipToRange(clip.id, 0.4, 1.4);
    const selectedClip = useProjectStore.getState().project!.tracks[0].clips.find((candidate) => candidate.id === clip.id)!;
    const midiData = selectedClip.midiData!;

    expect(resultId).toBe(clip.id);
    expect(selectedClip.startTime).toBe(0.5);
    expect(selectedClip.duration).toBe(1);
    expect(midiData.notes).toHaveLength(1);
    expect(midiData.notes[0].startBeat).toBeCloseTo(0, 3);
    expect(midiData.notes[0].durationBeats).toBeCloseTo(2, 3);
  });
});
