import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectStore } from '../../src/store/projectStore';
import { bounceTrackToAudioAsset, renderTrackBounce } from '../../src/services/bounceInPlace';

vi.mock('../../src/services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

const mockSaveAudioBlob = vi.fn().mockResolvedValue('bounce-audio-key');

vi.mock('../../src/services/audioFileManager', () => ({
  loadAudioBlobByKey: vi.fn(),
  saveAudioBlob: (...args: unknown[]) => mockSaveAudioBlob(...args),
}));

const mockRenderMidiTrackOffline = vi.fn();

vi.mock('../../src/engine/offlineRender', () => ({
  renderMidiTrackOffline: (...args: unknown[]) => mockRenderMidiTrackOffline(...args),
  renderSamplerTrackOffline: vi.fn(),
  renderSequencerTrackOffline: vi.fn(),
}));

vi.mock('../../src/engine/exportMix', () => ({
  renderMixOffline: vi.fn(),
  buildOfflineEffects: vi.fn(),
}));

vi.mock('../../src/utils/wav', () => ({
  audioBufferToWavBlob: vi.fn(() => new Blob(['wav-data'], { type: 'audio/wav' })),
}));

vi.mock('../../src/hooks/useAudioEngine', () => ({
  getAudioEngine: () => ({
    decodeAudioData: vi.fn(),
  }),
}));

function createMockAudioBuffer(duration = 4, sampleRate = 48_000, amplitude = 0.5): AudioBuffer {
  const length = Math.max(1, Math.round(duration * sampleRate));
  const channelData = new Float32Array(length).fill(amplitude);
  return {
    duration,
    sampleRate,
    length,
    numberOfChannels: 2,
    getChannelData: () => channelData,
    copyToChannel: vi.fn(),
  } as unknown as AudioBuffer;
}

function installOfflineAudioContext(renderedBuffer: AudioBuffer) {
  const audioParam = () => ({
    value: 0,
    cancelScheduledValues: vi.fn(),
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
  });

  vi.stubGlobal('OfflineAudioContext', class {
    destination = {};
    createBufferSource() {
      return {
        buffer: null as AudioBuffer | null,
        connect: vi.fn(),
        start: vi.fn(),
      };
    }
    createGain() {
      return {
        gain: audioParam(),
        connect: vi.fn(),
      };
    }
    createStereoPanner() {
      return {
        pan: audioParam(),
        connect: vi.fn(),
      };
    }
    startRendering = vi.fn(async () => renderedBuffer);
  });
}

describe('bounceInPlace service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject({ name: 'Bounce Test' });
  });

  it('renders a piano roll track over its clip range by default', async () => {
    installOfflineAudioContext(createMockAudioBuffer(4));
    const track = useProjectStore.getState().addTrack('keyboard', 'pianoRoll');
    const clip = useProjectStore.getState().addClip(track.id, {
      startTime: 2,
      duration: 4,
      prompt: '',
      globalCaption: '',
      lyrics: '',
      source: 'generated',
      starred: false,
      midiData: {
        grid: '1/16',
        notes: [{ id: 'note-1', pitch: 60, startBeat: 0, durationBeats: 1, velocity: 0.8 }],
      },
    });

    mockRenderMidiTrackOffline.mockResolvedValue(createMockAudioBuffer(4));

    const project = useProjectStore.getState().project!;
    const targetTrack = project.tracks.find((candidate) => candidate.id === track.id)!;
    const { range } = await renderTrackBounce(project, targetTrack, {
      includeEffects: false,
      includeAutomation: false,
      normalize: false,
      replaceOriginal: true,
    });

    expect(clip.startTime).toBe(2);
    expect(range).toEqual({ startTime: 2, duration: 4 });
    expect(mockRenderMidiTrackOffline).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ pitch: 60, startBeat: 0, durationBeats: 1 }),
      ]),
      0,
      project.bpm,
      targetTrack.synthPreset ?? 'piano',
      4,
      48_000,
    );
  });

  it('saves the bounced audio blob and waveform peaks', async () => {
    installOfflineAudioContext(createMockAudioBuffer(3));
    const track = useProjectStore.getState().addTrack('keyboard', 'pianoRoll');
    useProjectStore.getState().addClip(track.id, {
      startTime: 0,
      duration: 3,
      prompt: '',
      globalCaption: '',
      lyrics: '',
      source: 'generated',
      starred: false,
      midiData: {
        grid: '1/16',
        notes: [{ id: 'note-1', pitch: 67, startBeat: 0, durationBeats: 2, velocity: 0.9 }],
      },
    });

    mockRenderMidiTrackOffline.mockResolvedValue(createMockAudioBuffer(3));

    const project = useProjectStore.getState().project!;
    const targetTrack = project.tracks.find((candidate) => candidate.id === track.id)!;
    const result = await bounceTrackToAudioAsset(project, targetTrack, {
      includeEffects: false,
      includeAutomation: false,
      normalize: false,
      replaceOriginal: true,
    });

    expect(mockSaveAudioBlob).toHaveBeenCalledOnce();
    expect(result.audioKey).toBe('bounce-audio-key');
    expect(result.duration).toBe(3);
    expect(result.waveformPeaks).toHaveLength(1024 * 4);
  });
});
