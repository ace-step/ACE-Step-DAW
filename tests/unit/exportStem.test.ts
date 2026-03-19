import { describe, expect, it, vi } from 'vitest';
import { exportStemToWav, type ExportClip } from '../../src/engine/exportMix';

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
