import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const encoderMocks = vi.hoisted(() => ({
  encodeToMp3: vi.fn(() => new Blob(['mp3'], { type: 'audio/mpeg' })),
  encodeToFlac: vi.fn(() => new Blob(['flac'], { type: 'audio/flac' })),
  encodeToOgg: vi.fn(() => new Blob(['ogg'], { type: 'audio/ogg' })),
}));

vi.mock('../../src/utils/audioEncoders', async () => {
  const actual = await vi.importActual<typeof import('../../src/utils/audioEncoders')>('../../src/utils/audioEncoders');
  return {
    ...actual,
    encodeToMp3: encoderMocks.encodeToMp3,
    encodeToFlac: encoderMocks.encodeToFlac,
    encodeToOgg: encoderMocks.encodeToOgg,
  };
});

import { exportMix, type ExportClip } from '../../src/engine/exportMix';

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

describe('exportMix', () => {
  beforeEach(() => {
    encoderMocks.encodeToMp3.mockClear();
    encoderMocks.encodeToFlac.mockClear();
    encoderMocks.encodeToOgg.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('encodes MP3 exports with the selected bitrate and reports encoding progress', async () => {
    const sampleRate = 44100;
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
    const progressUpdates: Array<{ stage: string; progress: number }> = [];

    const blob = await exportMix(
      clips,
      totalDuration,
      {
        format: 'mp3',
        sampleRate: 44100,
        bitDepth: 16,
        mp3Bitrate: 192,
        oggQuality: 0.5,
      },
      (update) => {
        progressUpdates.push(update);
      },
    );

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('audio/mpeg');
    expect(encoderMocks.encodeToMp3).toHaveBeenCalledOnce();
    expect(encoderMocks.encodeToMp3).toHaveBeenCalledWith(mockRenderedBuffer, 192, undefined);
    expect(progressUpdates).toEqual([
      { stage: 'rendering', progress: 0 },
      { stage: 'encoding', progress: 0 },
      { stage: 'complete', progress: 1 },
    ]);
  });
});
