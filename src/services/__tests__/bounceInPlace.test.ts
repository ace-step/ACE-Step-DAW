import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderTrackForBounceInPlace } from '../bounceInPlace';
import type { BounceInPlaceOptions, Project, Track } from '../../types/project';

vi.mock('../../services/audioFileManager', () => ({
  loadAudioBlobByKey: vi.fn(),
}));

vi.mock('../../hooks/useAudioEngine', () => ({
  getAudioEngine: () => ({
    decodeAudioData: vi.fn(async () => createMockAudioBuffer(2, 0.5)),
  }),
}));

const mockRenderMixOffline = vi.fn();
vi.mock('../../engine/exportMix', () => ({
  renderMixOffline: (...args: unknown[]) => mockRenderMixOffline(...args),
}));

const mockRenderMidiTrackOffline = vi.fn();
const mockRenderSamplerTrackOffline = vi.fn();
const mockRenderSequencerTrackOffline = vi.fn();
vi.mock('../../engine/offlineRender', () => ({
  renderMidiTrackOffline: (...args: unknown[]) => mockRenderMidiTrackOffline(...args),
  renderSamplerTrackOffline: (...args: unknown[]) => mockRenderSamplerTrackOffline(...args),
  renderSequencerTrackOffline: (...args: unknown[]) => mockRenderSequencerTrackOffline(...args),
}));

vi.mock('../../utils/waveformPeaks', () => ({
  computeWaveformPeaks: vi.fn(() => [0.1, 0.3, 0.8]),
}));

function createMockAudioBuffer(duration = 1, sample = 0.25): AudioBuffer {
  const sampleRate = 48000;
  const length = Math.ceil(duration * sampleRate);
  const left = new Float32Array(length).fill(sample);
  const right = new Float32Array(length).fill(sample);
  return {
    duration,
    sampleRate,
    length,
    numberOfChannels: 2,
    getChannelData: (channelIndex: number) => (channelIndex === 0 ? left : right),
    copyFromChannel: vi.fn(),
    copyToChannel: vi.fn(),
  } as unknown as AudioBuffer;
}

function makeProject(track: Track): Project {
  return {
    id: 'project-1',
    name: 'Bounce Test',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    bpm: 120,
    keyScale: 'C major',
    timeSignature: 4,
    totalDuration: 8,
    globalCaption: '',
    generationDefaults: { inferenceSteps: 8, guidanceScale: 3, shift: 0, thinking: false, model: 'test' },
    tracks: [track],
    markers: [],
    assets: [],
    trackPresets: [],
    automationLanes: [],
    returnTracks: [],
    tempoMap: [],
    timeSignatureMap: [],
    mastering: undefined,
    measures: 8,
    masterVolume: 0.8,
  } as Project;
}

const baseOptions: BounceInPlaceOptions = {
  includeEffects: true,
  normalize: false,
  replaceOriginal: true,
};

describe('renderTrackForBounceInPlace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRenderMixOffline.mockResolvedValue(createMockAudioBuffer(2, 0.5));
    mockRenderMidiTrackOffline.mockResolvedValue(createMockAudioBuffer(2, 0.25));
    mockRenderSamplerTrackOffline.mockResolvedValue(createMockAudioBuffer(2, 0.25));
    mockRenderSequencerTrackOffline.mockResolvedValue(createMockAudioBuffer(8, 0.25));
  });

  it('renders piano-roll clips through the track effect chain', async () => {
    const track: Track = {
      id: 'track-1',
      trackName: 'keyboard',
      trackType: 'pianoRoll',
      displayName: 'Keys',
      color: '#22c55e',
      order: 1,
      volume: 0.8,
      muted: false,
      soloed: false,
      synthPreset: 'pad',
      effects: [{ id: 'fx-1', type: 'delay', enabled: true, params: { time: 0.25, feedback: 0.3, wet: 0.2 } }],
      clips: [{
        id: 'clip-1',
        trackId: 'track-1',
        startTime: 1,
        duration: 2,
        prompt: 'Hook',
        lyrics: '',
        generationStatus: 'empty',
        generationJobId: null,
        cumulativeMixKey: null,
        isolatedAudioKey: null,
        waveformPeaks: null,
        midiData: { notes: [{ id: 'n1', pitch: 60, startBeat: 0, durationBeats: 1, velocity: 0.8 }], grid: '1/16' },
      }],
    } as Track;

    const result = await renderTrackForBounceInPlace(makeProject(track), track, baseOptions);

    expect(mockRenderMidiTrackOffline).toHaveBeenCalledOnce();
    expect(mockRenderMixOffline).toHaveBeenCalledOnce();
    expect(mockRenderMixOffline.mock.calls[0][0][0].effects).toEqual(track.effects);
    expect(result).toMatchObject({
      startTime: 1,
      duration: 2,
      waveformPeaks: [0.1, 0.3, 0.8],
    });
  });

  it('skips track effects when includeEffects is false for audio tracks', async () => {
    const { loadAudioBlobByKey } = await import('../../services/audioFileManager');
    vi.mocked(loadAudioBlobByKey).mockResolvedValue(new Blob(['audio']));

    const track: Track = {
      id: 'track-2',
      trackName: 'vocals',
      trackType: 'stems',
      displayName: 'Vocals',
      color: '#f43f5e',
      order: 1,
      volume: 0.8,
      muted: false,
      soloed: false,
      effects: [{ id: 'fx-1', type: 'compressor', enabled: true, params: { threshold: -18, ratio: 4, attack: 0.01, release: 0.2, knee: 12 } }],
      clips: [{
        id: 'clip-1',
        trackId: 'track-2',
        startTime: 2,
        duration: 1.5,
        prompt: 'Take',
        lyrics: '',
        generationStatus: 'ready',
        generationJobId: null,
        cumulativeMixKey: null,
        isolatedAudioKey: 'audio-key-1',
        waveformPeaks: null,
      }],
    } as Track;

    await renderTrackForBounceInPlace(makeProject(track), track, {
      ...baseOptions,
      includeEffects: false,
    });

    expect(mockRenderMixOffline).toHaveBeenCalledOnce();
    expect(mockRenderMixOffline.mock.calls[0][0][0].effects).toBeUndefined();
  });

  it('normalizes the rendered audio when requested', async () => {
    const track: Track = {
      id: 'track-3',
      trackName: 'drums',
      trackType: 'sequencer',
      displayName: 'Drums',
      color: '#ef4444',
      order: 1,
      volume: 0.8,
      muted: false,
      soloed: false,
      effects: [],
      sequencerPattern: {
        id: 'pattern-1',
        name: 'Pattern',
        rows: [{ id: 'row-1', name: 'Kick', sampleKey: 'kick', steps: [{ active: true, velocity: 0.8 }], volume: 1, pan: 0, muted: false, color: '#ef4444' }],
        stepsPerBar: 16,
        bars: 1,
        swing: 0,
      },
      clips: [],
    } as Track;
    const rendered = createMockAudioBuffer(8, 0.5);
    mockRenderMixOffline.mockResolvedValue(rendered);

    const result = await renderTrackForBounceInPlace(makeProject(track), track, {
      ...baseOptions,
      normalize: true,
    });

    expect(result?.buffer.getChannelData(0)[0]).toBeCloseTo(0.98, 2);
  });
});
