import { describe, expect, it } from 'vitest';
import { encodeAudioBuffer, estimateExportFileSize } from '../../src/engine/exportMix';

function createStereoBuffer(lengthInSamples: number, sampleRate: number): AudioBuffer {
  const left = new Float32Array(lengthInSamples);
  const right = new Float32Array(lengthInSamples);

  for (let i = 0; i < lengthInSamples; i++) {
    left[i] = Math.sin((i / sampleRate) * Math.PI * 2 * 220) * 0.4;
    right[i] = Math.sin((i / sampleRate) * Math.PI * 2 * 330) * 0.4;
  }

  return {
    numberOfChannels: 2,
    sampleRate,
    length: lengthInSamples,
    duration: lengthInSamples / sampleRate,
    getChannelData: (channel: number) => (channel === 0 ? left : right),
  } as unknown as AudioBuffer;
}

describe('encodeAudioBuffer', () => {
  it('encodes WAV output with a RIFF header', async () => {
    const blob = await encodeAudioBuffer(createStereoBuffer(4096, 44100), {
      format: 'wav',
      bitDepth: 24,
    });

    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(blob.type).toBe('audio/wav');
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('RIFF');
    expect(String.fromCharCode(...bytes.slice(8, 12))).toBe('WAVE');
  });

  it('encodes MP3 output', async () => {
    const blob = await encodeAudioBuffer(createStereoBuffer(8192, 44100), {
      format: 'mp3',
      mp3Bitrate: 192,
    });

    const bytes = new Uint8Array(await blob.arrayBuffer());
    const hasId3Header = String.fromCharCode(...bytes.slice(0, 3)) === 'ID3';
    const hasFrameHeader = bytes[0] === 0xFF && (bytes[1] & 0xE0) === 0xE0;

    expect(blob.type).toBe('audio/mpeg');
    expect(bytes.length).toBeGreaterThan(0);
    expect(hasId3Header || hasFrameHeader).toBe(true);
  });

  it('encodes FLAC output with an fLaC header', async () => {
    const blob = await encodeAudioBuffer(createStereoBuffer(4096, 44100), {
      format: 'flac',
      bitDepth: 16,
    });

    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(blob.type).toBe('audio/flac');
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('fLaC');
  });
});

describe('estimateExportFileSize', () => {
  it('estimates different sizes per format', () => {
    const wavSize = estimateExportFileSize(180, { format: 'wav', sampleRate: 48000, bitDepth: 16 });
    const mp3Size = estimateExportFileSize(180, { format: 'mp3', sampleRate: 48000, mp3Bitrate: 192 });
    const flacSize = estimateExportFileSize(180, { format: 'flac', sampleRate: 48000, bitDepth: 24 });

    expect(wavSize).toBeGreaterThan(mp3Size);
    expect(flacSize).toBeGreaterThan(mp3Size);
    expect(flacSize).toBeLessThan(estimateExportFileSize(180, { format: 'wav', sampleRate: 48000, bitDepth: 24 }));
  });
});
