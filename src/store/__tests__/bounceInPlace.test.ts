import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

vi.mock('../../services/audioFileManager', () => ({
  saveAudioBlob: vi.fn(async () => 'bounced-audio-key'),
  loadAudioBlobByKey: vi.fn(),
}));

vi.mock('../../utils/wav', () => ({
  audioBufferToWavBlob: vi.fn(() => new Blob(['wav'])),
}));

vi.mock('../../hooks/useToast', () => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

const mockRenderTrackForBounceInPlace = vi.fn();
vi.mock('../../services/bounceInPlace', async () => {
  const actual = await vi.importActual<typeof import('../../services/bounceInPlace')>('../../services/bounceInPlace');
  return {
    ...actual,
    renderTrackForBounceInPlace: (...args: unknown[]) => mockRenderTrackForBounceInPlace(...args),
  };
});

import { useProjectStore } from '../projectStore';

function createMockAudioBuffer(duration = 2): AudioBuffer {
  const sampleRate = 48000;
  const length = Math.ceil(duration * sampleRate);
  const channelData = new Float32Array(length).fill(0.25);
  return {
    duration,
    sampleRate,
    length,
    numberOfChannels: 2,
    getChannelData: () => channelData,
    copyFromChannel: vi.fn(),
    copyToChannel: vi.fn(),
  } as unknown as AudioBuffer;
}

describe('projectStore bounceInPlace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject({ name: 'Bounce Project' });
    mockRenderTrackForBounceInPlace.mockResolvedValue({
      startTime: 1,
      duration: 2,
      buffer: createMockAudioBuffer(2),
      waveformPeaks: [0.2, 0.6, 0.4],
    });
  });

  it('replaces the source track with bounced audio and supports undo/redo', async () => {
    const store = useProjectStore.getState();
    const track = store.addTrack('keyboard', 'pianoRoll');
    const clip = store.ensureMidiClip(track.id, 1, 2);
    store.addMidiNote(clip.id, { pitch: 60, startBeat: 0, durationBeats: 1, velocity: 0.8 });

    await store.bounceInPlace(track.id, { replaceOriginal: true, includeEffects: true });

    let updatedTrack = useProjectStore.getState().project!.tracks.find((candidate) => candidate.id === track.id)!;
    expect(updatedTrack.trackType).toBe('sample');
    expect(updatedTrack.clips).toHaveLength(1);
    expect(updatedTrack.clips[0]).toMatchObject({
      startTime: 1,
      duration: 2,
      isolatedAudioKey: 'bounced-audio-key',
      generationStatus: 'ready',
    });

    useProjectStore.getState().undo();
    updatedTrack = useProjectStore.getState().project!.tracks.find((candidate) => candidate.id === track.id)!;
    expect(updatedTrack.trackType).toBe('pianoRoll');

    useProjectStore.getState().redo();
    updatedTrack = useProjectStore.getState().project!.tracks.find((candidate) => candidate.id === track.id)!;
    expect(updatedTrack.trackType).toBe('sample');
  });

  it('creates a sibling bounced sample track when replaceOriginal is false', async () => {
    const store = useProjectStore.getState();
    const track = store.addTrack('vocals');
    store.updateTrack(track.id, { color: '#abcdef' });

    const bouncedClip = await store.bounceInPlace(track.id, { replaceOriginal: false, includeEffects: false });

    const tracks = useProjectStore.getState().project!.tracks;
    expect(tracks).toHaveLength(2);
    const newTrack = tracks.find((candidate) => candidate.id !== track.id)!;
    expect(newTrack.trackType).toBe('sample');
    expect(newTrack.displayName).toContain('Bounce');
    expect(newTrack.color).toBe('#abcdef');
    expect(newTrack.clips[0].isolatedAudioKey).toBe('bounced-audio-key');
    expect(bouncedClip?.trackId).toBe(newTrack.id);
  });
});
