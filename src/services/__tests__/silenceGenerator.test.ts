import { describe, it, expect } from 'vitest';
import { generateSilenceWav } from '../silenceGenerator';
import { BITS_PER_SAMPLE } from '../../constants/defaults';

function readStr(view: DataView, offset: number, length: number): string {
  let s = '';
  for (let i = 0; i < length; i++) {
    s += String.fromCharCode(view.getUint8(offset + i));
  }
  return s;
}

describe('generateSilenceWav', () => {
  const EXPECTED_RATE = 16000;
  const EXPECTED_CHANNELS = 1;
  const EXPECTED_DURATION = 0.1;

  it('returns a Blob with audio/wav MIME type', () => {
    const blob = generateSilenceWav(5);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('audio/wav');
  });

  it('ignores the durationSeconds parameter (uses fixed 0.1s placeholder)', () => {
    const blob1 = generateSilenceWav(1);
    const blob2 = generateSilenceWav(60);
    expect(blob1.size).toBe(blob2.size);
  });

  it('produces correct buffer size (44-byte header + data)', () => {
    const blob = generateSilenceWav(5);
    const numSamples = Math.ceil(EXPECTED_RATE * EXPECTED_DURATION);
    const bytesPerSample = BITS_PER_SAMPLE / 8;
    const dataSize = numSamples * EXPECTED_CHANNELS * bytesPerSample;
    const expectedSize = 44 + dataSize;
    expect(blob.size).toBe(expectedSize);
  });

  it('writes valid RIFF header', async () => {
    const blob = generateSilenceWav(5);
    const buffer = await blob.arrayBuffer();
    const view = new DataView(buffer);

    expect(readStr(view, 0, 4)).toBe('RIFF');
    expect(view.getUint32(4, true)).toBe(buffer.byteLength - 8);
    expect(readStr(view, 8, 4)).toBe('WAVE');
  });

  it('writes valid fmt chunk with PCM format', async () => {
    const blob = generateSilenceWav(5);
    const buffer = await blob.arrayBuffer();
    const view = new DataView(buffer);

    expect(readStr(view, 12, 4)).toBe('fmt ');
    expect(view.getUint32(16, true)).toBe(16); // fmt chunk size
    expect(view.getUint16(20, true)).toBe(1);  // PCM format
    expect(view.getUint16(22, true)).toBe(EXPECTED_CHANNELS);
    expect(view.getUint32(24, true)).toBe(EXPECTED_RATE);
  });

  it('writes correct byte rate and block align', async () => {
    const blob = generateSilenceWav(5);
    const buffer = await blob.arrayBuffer();
    const view = new DataView(buffer);

    const bytesPerSample = BITS_PER_SAMPLE / 8;
    const blockAlign = EXPECTED_CHANNELS * bytesPerSample;
    const byteRate = EXPECTED_RATE * blockAlign;

    expect(view.getUint32(28, true)).toBe(byteRate);
    expect(view.getUint16(32, true)).toBe(blockAlign);
    expect(view.getUint16(34, true)).toBe(BITS_PER_SAMPLE);
  });

  it('writes valid data chunk header with correct size', async () => {
    const blob = generateSilenceWav(5);
    const buffer = await blob.arrayBuffer();
    const view = new DataView(buffer);

    const numSamples = Math.ceil(EXPECTED_RATE * EXPECTED_DURATION);
    const bytesPerSample = BITS_PER_SAMPLE / 8;
    const dataSize = numSamples * EXPECTED_CHANNELS * bytesPerSample;

    expect(readStr(view, 36, 4)).toBe('data');
    expect(view.getUint32(40, true)).toBe(dataSize);
  });

  it('contains all-zero audio data (silence)', async () => {
    const blob = generateSilenceWav(5);
    const buffer = await blob.arrayBuffer();
    const audioData = new Uint8Array(buffer, 44);

    const allZeros = audioData.every((byte) => byte === 0);
    expect(allZeros).toBe(true);
  });

  it('produces a small file size suitable for upload placeholder', () => {
    const blob = generateSilenceWav(300);
    // 0.1s at 16kHz mono 16-bit = ~3.2KB, should be well under 10KB
    expect(blob.size).toBeLessThan(10000);
  });
});
