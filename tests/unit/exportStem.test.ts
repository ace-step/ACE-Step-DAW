import { describe, expect, it, vi } from 'vitest';
import { buildStemFileName, exportStemToWav, getStemExportTracks, type ExportClip } from '../../src/engine/exportMix';
import type { Project } from '../../src/types/project';

function createMockAudioBuffer(lengthInSamples: number, sampleRate: number): AudioBuffer {
  const data = new Float32Array(lengthInSamples);
  return {
    numberOfChannels: 2,
    sampleRate,
    length: lengthInSamples,
    duration: lengthInSamples / sampleRate,
    getChannelData: () => data,
  } as unknown as AudioBuffer;
}

describe('exportStemToWav', () => {
  it('renders clips to a WAV blob with correct RIFF header', async () => {
    const sampleRate = 8000;
    const totalDuration = 1;
    const lengthInSamples = sampleRate * totalDuration;

    const mockRenderedBuffer = createMockAudioBuffer(lengthInSamples, sampleRate);

    const mockGainNode = {
      gain: { value: 1 },
      connect: vi.fn(),
    };

    const mockSource = {
      buffer: null as AudioBuffer | null,
      connect: vi.fn(),
      start: vi.fn(),
    };

    const MockOfflineAudioContext = vi.fn(function (this: Record<string, unknown>) {
      this.createBufferSource = vi.fn(() => mockSource);
      this.createGain = vi.fn(() => mockGainNode);
      this.createStereoPanner = vi.fn(() => ({
        pan: { value: 0 },
        connect: vi.fn(),
      }));
      this.destination = {};
      this.startRendering = vi.fn(async () => mockRenderedBuffer);
    });

    vi.stubGlobal('OfflineAudioContext', MockOfflineAudioContext);

    const clips: ExportClip[] = [
      {
        startTime: 0,
        buffer: createMockAudioBuffer(lengthInSamples, sampleRate),
        volume: 0.8,
      },
    ];

    const blob = await exportStemToWav(clips, totalDuration, sampleRate);

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('audio/wav');

    const arrayBuffer = await blob.arrayBuffer();
    const view = new DataView(arrayBuffer);
    const riff = String.fromCharCode(
      view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3),
    );
    expect(riff).toBe('RIFF');

    const wave = String.fromCharCode(
      view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11),
    );
    expect(wave).toBe('WAVE');

    expect(view.getUint32(24, true)).toBe(sampleRate);
    expect(mockSource.start).toHaveBeenCalledWith(0);
    expect(mockGainNode.gain.value).toBe(0.8);

    vi.unstubAllGlobals();
  });
});

describe('getStemExportTracks', () => {
  function createProject(): Project {
    return {
      id: 'project-1',
      name: 'My Song!',
      bpm: 120,
      timeSignature: 4,
      totalDuration: 8,
      tracks: [
        {
          id: 'track-1',
          trackName: 'drums',
          displayName: 'Drums/Main',
          color: '#fff',
          order: 0,
          volume: 1,
          muted: false,
          soloed: false,
          clips: [],
        },
        {
          id: 'track-2',
          trackName: 'bass',
          displayName: 'Bass',
          color: '#fff',
          order: 1,
          volume: 1,
          muted: true,
          soloed: false,
          clips: [],
        },
        {
          id: 'track-3',
          trackName: 'guitar',
          displayName: 'Lead Guitar',
          color: '#fff',
          order: 2,
          volume: 1,
          muted: false,
          soloed: true,
          clips: [],
        },
      ],
      sections: [],
      arrangementClips: [],
      generationDefaults: {
        inferenceSteps: 30,
        guidanceScale: 7.5,
        shift: 0,
        thinking: false,
        model: 'test',
      },
      mastering: {
        enabled: false,
        status: 'idle',
        preset: 'balanced',
        loudnessTarget: -14,
        previewOriginal: false,
        analysis: null,
        chain: {
          lowShelfGain: 0,
          midGain: 0,
          highShelfGain: 0,
          compressorThreshold: -24,
          compressorRatio: 2,
          stereoWidth: 1,
          limiterThreshold: -1,
          makeupGain: 0,
        },
        outputLufs: null,
      },
      createdAt: 0,
      updatedAt: 0,
    };
  }

  it('returns all audible tracks when exporting all stems', () => {
    const tracks = getStemExportTracks(createProject(), { scope: 'all-audible' });
    expect(tracks.map((track) => track.id)).toEqual(['track-3']);
  });

  it('limits selected stem export to audible selected tracks', () => {
    const tracks = getStemExportTracks(createProject(), {
      scope: 'selected',
      selectedTrackIds: new Set(['track-1', 'track-2', 'track-3']),
    });

    expect(tracks.map((track) => track.id)).toEqual(['track-3']);
  });
});

describe('buildStemFileName', () => {
  it('sanitizes project and track names and uses the selected format extension', () => {
    expect(buildStemFileName('My Song!', 'Drums/Main', 'flac')).toBe('My Song_DrumsMain.flac');
  });
});
