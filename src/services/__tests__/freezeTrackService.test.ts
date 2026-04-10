import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useProjectStore } from '../../store/projectStore';
import { freezeTrackToAudio, flattenTrackToAudio } from '../freezeTrack';

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

const mockSaveAudioBlob = vi.fn().mockResolvedValue('frozen-audio-key-123');
const mockLoadAudioBlobByKey = vi.fn().mockResolvedValue(new Blob(['audio']));

vi.mock('../audioFileManager', () => ({
  saveAudioBlob: (...args: unknown[]) => mockSaveAudioBlob(...args),
  loadAudioBlobByKey: (...args: unknown[]) => mockLoadAudioBlobByKey(...args),
}));

const mockRenderMidiTrackOffline = vi.fn();
const mockRenderSequencerTrackOffline = vi.fn();

vi.mock('../../engine/offlineRender', () => ({
  renderMidiTrackOffline: (...args: unknown[]) => mockRenderMidiTrackOffline(...args),
  renderSequencerTrackOffline: (...args: unknown[]) => mockRenderSequencerTrackOffline(...args),
}));

vi.mock('../../utils/wav', () => ({
  audioBufferToWavBlob: () => new Blob(['wav-data']),
}));

vi.mock('../../utils/waveformPeaks', () => ({
  computeWaveformWithMipmap: async () => [0.1, 0.2, 0.3, 0.4, 0.5],
}));

// Create a minimal AudioBuffer-like object for testing
function createMockAudioBuffer(duration = 10, sampleRate = 44100): AudioBuffer {
  const length = Math.ceil(duration * sampleRate);
  const channelData = new Float32Array(length);
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

const mockDecodeAudioData = vi.fn().mockResolvedValue(createMockAudioBuffer());
const mockCreateBuffer = vi.fn(() => createMockAudioBuffer());

vi.mock('../../hooks/useAudioEngine', () => ({
  getAudioEngine: () => ({
    ctx: {
      sampleRate: 44100,
      createBuffer: (...args: unknown[]) => mockCreateBuffer(...args),
    },
    decodeAudioData: (...args: unknown[]) => mockDecodeAudioData(...args),
  }),
}));

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('freezeTrackToAudio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject();
    useProjectStore.getState().addTrack('vocals');
  });

  it('throws when no project exists', async () => {
    useProjectStore.setState({ project: null });
    await expect(freezeTrackToAudio('any-id')).rejects.toThrow('No project');
  });

  it('throws when track not found', async () => {
    await expect(freezeTrackToAudio('nonexistent')).rejects.toThrow("Track 'nonexistent' not found");
  });

  it('sets frozen flag even when track has no content to render', async () => {
    const trackId = useProjectStore.getState().project!.tracks[0].id;
    await freezeTrackToAudio(trackId);

    const track = useProjectStore.getState().project!.tracks.find((t) => t.id === trackId)!;
    expect(track.frozen).toBe(true);
    // No frozenAudioKey since there was no audio to bounce
    expect(track.frozenAudioKey).toBeUndefined();
  });

  it('renders pianoRoll track offline and stores frozen audio', async () => {
    const trackId = useProjectStore.getState().project!.tracks[0].id;
    useProjectStore.getState().updateTrack(trackId, { trackType: 'pianoRoll' });

    // Add a clip with MIDI data
    useProjectStore.getState().addClip(trackId, 0, 4);
    const clipId = useProjectStore.getState().project!.tracks[0].clips[0].id;
    useProjectStore.getState().addMidiNote(clipId, {
      pitch: 60,
      startBeat: 0,
      durationBeats: 1,
      velocity: 0.8,
    });

    const mockBuffer = createMockAudioBuffer(4);
    mockRenderMidiTrackOffline.mockResolvedValueOnce(mockBuffer);

    await freezeTrackToAudio(trackId);

    expect(mockRenderMidiTrackOffline).toHaveBeenCalledOnce();
    expect(mockSaveAudioBlob).toHaveBeenCalledOnce();

    const track = useProjectStore.getState().project!.tracks.find((t) => t.id === trackId)!;
    expect(track.frozen).toBe(true);
    expect(track.frozenAudioKey).toBe('frozen-audio-key-123');
  });

  it('renders sequencer track offline when no ready clips exist', async () => {
    const trackId = useProjectStore.getState().project!.tracks[0].id;
    useProjectStore.getState().updateTrack(trackId, { trackType: 'sequencer' });

    // Add sequencer pattern
    useProjectStore.setState((state) => ({
      project: {
        ...state.project!,
        tracks: state.project!.tracks.map((t) =>
          t.id === trackId
            ? {
                ...t,
                sequencerPattern: {
                  id: 'pat-1',
                  name: 'Pattern 1',
                  rows: [{ id: 'r1', name: 'Kick', sampleKey: 'kick', steps: [], volume: 1, pan: 0, muted: false, color: '#f00' }],
                  stepsPerBar: 16,
                  bars: 1,
                  swing: 0,
                },
              }
            : t,
        ),
      },
    }));

    const mockBuffer = createMockAudioBuffer(2);
    mockRenderSequencerTrackOffline.mockResolvedValueOnce(mockBuffer);

    await freezeTrackToAudio(trackId);

    expect(mockRenderSequencerTrackOffline).toHaveBeenCalledOnce();
    expect(mockSaveAudioBlob).toHaveBeenCalledOnce();

    const track = useProjectStore.getState().project!.tracks.find((t) => t.id === trackId)!;
    expect(track.frozen).toBe(true);
    expect(track.frozenAudioKey).toBe('frozen-audio-key-123');
  });

  it('mixes ready audio clips for stems tracks', async () => {
    const trackId = useProjectStore.getState().project!.tracks[0].id;

    // Add a clip with ready status and an audio key
    useProjectStore.getState().addClip(trackId, 0, 4);
    const clipId = useProjectStore.getState().project!.tracks[0].clips[0].id;
    useProjectStore.getState().updateClip(clipId, {
      generationStatus: 'ready',
      isolatedAudioKey: 'audio-key-1',
    });

    await freezeTrackToAudio(trackId);

    expect(mockLoadAudioBlobByKey).toHaveBeenCalledWith('audio-key-1');
    expect(mockCreateBuffer).toHaveBeenCalled();
    expect(mockSaveAudioBlob).toHaveBeenCalledOnce();

    const track = useProjectStore.getState().project!.tracks.find((t) => t.id === trackId)!;
    expect(track.frozen).toBe(true);
    expect(track.frozenAudioKey).toBe('frozen-audio-key-123');
  });
});

describe('flattenTrackToAudio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject();
    useProjectStore.getState().addTrack('vocals');
  });

  it('throws when no project exists', async () => {
    useProjectStore.setState({ project: null });
    await expect(flattenTrackToAudio('any-id')).rejects.toThrow('No project');
  });

  it('throws when track not found', async () => {
    await expect(flattenTrackToAudio('nonexistent')).rejects.toThrow("Track 'nonexistent' not found");
  });

  it('freezes first if not already frozen, then flattens', async () => {
    const trackId = useProjectStore.getState().project!.tracks[0].id;

    // Add a clip with ready audio so freeze produces audio
    useProjectStore.getState().addClip(trackId, 0, 4);
    const clipId = useProjectStore.getState().project!.tracks[0].clips[0].id;
    useProjectStore.getState().updateClip(clipId, {
      generationStatus: 'ready',
      isolatedAudioKey: 'original-audio-key',
    });

    await flattenTrackToAudio(trackId);

    const track = useProjectStore.getState().project!.tracks.find((t) => t.id === trackId)!;
    expect(track.trackType).toBe('sample');
    expect(track.frozen).toBe(false);
    expect(track.frozenAudioKey).toBeUndefined();
    expect(track.clips).toHaveLength(1);
    expect(track.clips[0].generationStatus).toBe('ready');
  });

  it('converts already-frozen track to sample type', async () => {
    const trackId = useProjectStore.getState().project!.tracks[0].id;

    // Pre-freeze the track
    useProjectStore.getState().freezeTrack(trackId, 'pre-frozen-key');

    await flattenTrackToAudio(trackId);

    const track = useProjectStore.getState().project!.tracks.find((t) => t.id === trackId)!;
    expect(track.trackType).toBe('sample');
    expect(track.frozen).toBe(false);
    expect(track.clips).toHaveLength(1);
    expect(track.clips[0].isolatedAudioKey).toBe('pre-frozen-key');
    expect(track.clips[0].waveformPeaks).toEqual([0.1, 0.2, 0.3, 0.4, 0.5]);
  });

  it('clears sequencerPattern and synthPreset on flatten', async () => {
    const trackId = useProjectStore.getState().project!.tracks[0].id;
    useProjectStore.getState().updateTrack(trackId, { trackType: 'sequencer' });

    useProjectStore.setState((state) => ({
      project: {
        ...state.project!,
        tracks: state.project!.tracks.map((t) =>
          t.id === trackId
            ? {
                ...t,
                sequencerPattern: { id: 'p', name: 'P', rows: [], stepsPerBar: 16, bars: 1, swing: 0 },
                synthPreset: 'piano' as const,
              }
            : t,
        ),
      },
    }));

    // Pre-freeze
    useProjectStore.getState().freezeTrack(trackId, 'frozen-seq-key');

    await flattenTrackToAudio(trackId);

    const track = useProjectStore.getState().project!.tracks.find((t) => t.id === trackId)!;
    expect(track.trackType).toBe('sample');
    expect(track.sequencerPattern).toBeUndefined();
    expect(track.synthPreset).toBeUndefined();
  });
});
