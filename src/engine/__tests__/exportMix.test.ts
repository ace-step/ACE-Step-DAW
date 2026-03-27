import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project, Track } from '../../types/project';
import { buildTrackExportClips } from '../exportMix';
import { createDefaultFmInstrument, createDefaultSamplerInstrument } from '../../utils/trackInstrument';

const mockLoadAudioBlobByKey = vi.fn();
const mockRenderMidiTrackOffline = vi.fn();
const mockRenderSamplerTrackOffline = vi.fn();
const mockRenderSequencerTrackOffline = vi.fn();

vi.mock('../../services/audioFileManager', () => ({
  loadAudioBlobByKey: (...args: unknown[]) => mockLoadAudioBlobByKey(...args),
}));

vi.mock('../offlineRender', () => ({
  renderMidiTrackOffline: (...args: unknown[]) => mockRenderMidiTrackOffline(...args),
  renderSamplerTrackOffline: (...args: unknown[]) => mockRenderSamplerTrackOffline(...args),
  renderSequencerTrackOffline: (...args: unknown[]) => mockRenderSequencerTrackOffline(...args),
}));

function createMockAudioBuffer(duration = 1, sample = 0.25): AudioBuffer {
  const sampleRate = 48_000;
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
    name: 'Render Test',
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

function makeAudioDecoder() {
  return {
    decodeAudioData: vi.fn(async () => createMockAudioBuffer(0.75, 0.2)),
  };
}

describe('buildTrackExportClips', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadAudioBlobByKey.mockResolvedValue(new Blob(['audio']));
    mockRenderMidiTrackOffline.mockResolvedValue(createMockAudioBuffer(1.5, 0.18));
    mockRenderSamplerTrackOffline.mockResolvedValue(createMockAudioBuffer(1.5, 0.18));
    mockRenderSequencerTrackOffline.mockResolvedValue(createMockAudioBuffer(1.5, 0.18));
  });

  it('passes canonical FM instruments through to offline midi rendering', async () => {
    const instrument = createDefaultFmInstrument({
      name: 'FM Bell',
      fallbackPreset: 'lead',
    });
    const track = {
      id: 'track-fm',
      trackName: 'synth',
      trackType: 'pianoRoll',
      displayName: 'FM Lead',
      color: '#60a5fa',
      order: 1,
      volume: 0.8,
      pan: -0.1,
      muted: false,
      soloed: false,
      instrument,
      synthPreset: 'lead',
      sampler: undefined,
      samplerConfig: undefined,
      effects: [],
      clips: [{
        id: 'clip-1',
        trackId: 'track-fm',
        startTime: 0,
        duration: 2,
        prompt: 'Hook',
        lyrics: '',
        generationStatus: 'empty',
        generationJobId: null,
        cumulativeMixKey: null,
        isolatedAudioKey: null,
        waveformPeaks: null,
        midiData: {
          notes: [{ id: 'n1', pitch: 60, startBeat: 0, durationBeats: 1, velocity: 0.8 }],
          grid: '1/16',
        },
      }],
    } as Track;

    await buildTrackExportClips(makeProject(track), track, makeAudioDecoder());

    expect(mockRenderMidiTrackOffline).toHaveBeenCalledWith(
      expect.any(Array),
      0,
      120,
      expect.objectContaining({
        kind: 'fm',
        name: 'FM Bell',
      }),
      8,
    );
  });

  it('uses canonical sampler state even when legacy sampler mirrors are empty', async () => {
    const instrument = createDefaultSamplerInstrument({
      audioKey: 'audio:test:sampler',
      sampleName: 'Glass Vox',
      rootNote: 48,
      sampleDuration: 1.5,
      trimEnd: 1.25,
      loopEnd: 1.1,
    });
    const track = {
      id: 'track-sampler',
      trackName: 'keyboard',
      trackType: 'pianoRoll',
      displayName: 'Quick Sampler',
      color: '#34d399',
      order: 1,
      volume: 0.85,
      pan: 0,
      muted: false,
      soloed: false,
      instrument,
      synthPreset: undefined,
      sampler: undefined,
      samplerConfig: undefined,
      effects: [],
      clips: [{
        id: 'clip-1',
        trackId: 'track-sampler',
        startTime: 0,
        duration: 2,
        prompt: 'Vox',
        lyrics: '',
        generationStatus: 'empty',
        generationJobId: null,
        cumulativeMixKey: null,
        isolatedAudioKey: null,
        waveformPeaks: null,
        midiData: {
          notes: [{ id: 'n1', pitch: 60, startBeat: 0, durationBeats: 1, velocity: 0.75 }],
          grid: '1/16',
        },
      }],
    } as Track;

    await buildTrackExportClips(makeProject(track), track, makeAudioDecoder());

    expect(mockLoadAudioBlobByKey).toHaveBeenCalledWith('audio:test:sampler');
    expect(mockRenderSamplerTrackOffline).toHaveBeenCalledWith(
      expect.any(Array),
      0,
      120,
      expect.any(Object),
      expect.objectContaining({
        audioKey: 'audio:test:sampler',
        rootNote: 48,
        trimEnd: 1.25,
        loopEnd: 1.1,
      }),
      8,
    );
    expect(mockRenderMidiTrackOffline).not.toHaveBeenCalled();
  });
});
