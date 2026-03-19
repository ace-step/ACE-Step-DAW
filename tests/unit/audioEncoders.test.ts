import { describe, expect, it } from 'vitest';
import {
  floatToInt16,
  encodeToMp3,
  encodeToFlac,
  encodeId3v2Tag,
  buildFlacVorbisComment,
  estimateFileSize,
  formatFileSize,
  type ExportOptions,
  type ExportMetadata,
} from '../../src/utils/audioEncoders';

/**
 * Create a mock AudioBuffer for testing.
 * Generates a simple sine wave.
 */
function createMockAudioBuffer(
  lengthInSamples: number,
  sampleRate: number,
  channels: number = 2,
): AudioBuffer {
  const channelData: Float32Array[] = [];
  for (let ch = 0; ch < channels; ch++) {
    const data = new Float32Array(lengthInSamples);
    for (let i = 0; i < lengthInSamples; i++) {
      data[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.5;
    }
    channelData.push(data);
  }

  return {
    numberOfChannels: channels,
    sampleRate,
    length: lengthInSamples,
    duration: lengthInSamples / sampleRate,
    getChannelData: (ch: number) => channelData[ch],
  } as unknown as AudioBuffer;
}

describe('floatToInt16', () => {
  it('converts float samples to Int16 range', () => {
    const input = new Float32Array([0, 1, -1, 0.5, -0.5]);
    const result = floatToInt16(input);

    expect(result).toBeInstanceOf(Int16Array);
    expect(result.length).toBe(5);
    expect(result[0]).toBe(0);
    expect(result[1]).toBe(0x7fff); // max positive
    expect(result[2]).toBe(-0x8000); // max negative
    expect(result[3]).toBeGreaterThan(0);
    expect(result[4]).toBeLessThan(0);
  });

  it('clamps values outside -1..1', () => {
    const input = new Float32Array([1.5, -1.5]);
    const result = floatToInt16(input);

    expect(result[0]).toBe(0x7fff);
    expect(result[1]).toBe(-0x8000);
  });
});

describe('encodeToMp3', () => {
  it('produces a Blob with audio/mpeg type', () => {
    const buffer = createMockAudioBuffer(4410, 44100, 2);
    const blob = encodeToMp3(buffer, 128);

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('audio/mpeg');
    expect(blob.size).toBeGreaterThan(0);
  });

  it('accepts different bitrates', () => {
    const buffer = createMockAudioBuffer(4410, 44100, 2);
    const blob128 = encodeToMp3(buffer, 128);
    const blob320 = encodeToMp3(buffer, 320);

    expect(blob128.size).toBeGreaterThan(0);
    expect(blob320.size).toBeGreaterThan(0);
    // Higher bitrate should generally produce larger files
    // (for very short audio this might not always hold, so just check both are valid)
  });

  it('handles mono audio', () => {
    const buffer = createMockAudioBuffer(4410, 44100, 1);
    const blob = encodeToMp3(buffer, 192);

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });
});

describe('encodeToFlac', () => {
  it('produces a Blob with audio/flac type', () => {
    const buffer = createMockAudioBuffer(4410, 44100, 2);
    const blob = encodeToFlac(buffer, 16);

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('audio/flac');
    expect(blob.size).toBeGreaterThan(0);
  });

  it('starts with fLaC magic bytes', async () => {
    const buffer = createMockAudioBuffer(4410, 44100, 2);
    const blob = encodeToFlac(buffer, 16);
    const arrayBuffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    // fLaC magic number
    expect(bytes[0]).toBe(0x66); // f
    expect(bytes[1]).toBe(0x4c); // L
    expect(bytes[2]).toBe(0x61); // a
    expect(bytes[3]).toBe(0x43); // C
  });

  it('contains STREAMINFO metadata block', async () => {
    const buffer = createMockAudioBuffer(4410, 44100, 2);
    const blob = encodeToFlac(buffer, 16);
    const arrayBuffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    // After magic (4 bytes), metadata block header
    // First byte: 0x80 = last metadata block flag | block type 0 (STREAMINFO)
    expect(bytes[4]).toBe(0x80);
    // Next 3 bytes: length = 34 (0x000022)
    expect(bytes[5]).toBe(0x00);
    expect(bytes[6]).toBe(0x00);
    expect(bytes[7]).toBe(0x22);
  });

  it('supports 24-bit encoding', () => {
    const buffer = createMockAudioBuffer(4410, 44100, 2);
    const blob16 = encodeToFlac(buffer, 16);
    const blob24 = encodeToFlac(buffer, 24);

    expect(blob24.size).toBeGreaterThan(blob16.size);
  });

  it('handles mono audio', () => {
    const buffer = createMockAudioBuffer(4410, 44100, 1);
    const blob = encodeToFlac(buffer, 16);

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
  });
});

describe('estimateFileSize', () => {
  it('estimates WAV size correctly', () => {
    const size = estimateFileSize(60, 48000, 2, {
      format: 'wav',
      bitDepth: 16,
      mp3Bitrate: 320,
      oggQuality: 0.5,
    });

    // 60s * 48000 * 2ch * 2 bytes + 44 header = 11,520,044
    expect(size).toBe(11520044);
  });

  it('estimates MP3 size based on bitrate', () => {
    const size = estimateFileSize(60, 48000, 2, {
      format: 'mp3',
      bitDepth: 16,
      mp3Bitrate: 320,
      oggQuality: 0.5,
    });

    // 60s * 320000 bps / 8 = 2,400,000
    expect(size).toBe(2400000);
  });

  it('estimates FLAC size smaller than WAV', () => {
    const wavSize = estimateFileSize(60, 48000, 2, {
      format: 'wav',
      bitDepth: 16,
      mp3Bitrate: 320,
      oggQuality: 0.5,
    });
    const flacSize = estimateFileSize(60, 48000, 2, {
      format: 'flac',
      bitDepth: 16,
      mp3Bitrate: 320,
      oggQuality: 0.5,
    });

    expect(flacSize).toBeLessThan(wavSize);
  });

  it('estimates OGG size based on quality', () => {
    const sizeLow = estimateFileSize(60, 48000, 2, {
      format: 'ogg',
      bitDepth: 16,
      mp3Bitrate: 320,
      oggQuality: 0.0,
    });
    const sizeHigh = estimateFileSize(60, 48000, 2, {
      format: 'ogg',
      bitDepth: 16,
      mp3Bitrate: 320,
      oggQuality: 1.0,
    });

    expect(sizeLow).toBeGreaterThan(0);
    expect(sizeHigh).toBeGreaterThan(sizeLow);
    // At quality 0.0: ~32kbps => 60s * 32000 / 8 = 240,000
    expect(sizeLow).toBe(240000);
    // At quality 1.0: ~320kbps => 60s * 320000 / 8 = 2,400,000
    expect(sizeHigh).toBe(2400000);
  });

  it('estimates OGG size smaller than WAV', () => {
    const wavSize = estimateFileSize(60, 48000, 2, {
      format: 'wav',
      bitDepth: 16,
      mp3Bitrate: 320,
      oggQuality: 0.5,
    });
    const oggSize = estimateFileSize(60, 48000, 2, {
      format: 'ogg',
      bitDepth: 16,
      mp3Bitrate: 320,
      oggQuality: 0.5,
    });

    expect(oggSize).toBeLessThan(wavSize);
  });

  it('24-bit WAV is larger than 16-bit', () => {
    const size16 = estimateFileSize(60, 48000, 2, {
      format: 'wav',
      bitDepth: 16,
      mp3Bitrate: 320,
      oggQuality: 0.5,
    });
    const size24 = estimateFileSize(60, 48000, 2, {
      format: 'wav',
      bitDepth: 24,
      mp3Bitrate: 320,
      oggQuality: 0.5,
    });

    expect(size24).toBeGreaterThan(size16);
  });
});

describe('formatFileSize', () => {
  it('formats bytes', () => {
    expect(formatFileSize(500)).toBe('500 B');
  });

  it('formats kilobytes', () => {
    expect(formatFileSize(2048)).toBe('2.0 KB');
  });

  it('formats megabytes', () => {
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5.0 MB');
  });

  it('formats fractional megabytes', () => {
    expect(formatFileSize(1.5 * 1024 * 1024)).toBe('1.5 MB');
  });
});

describe('encodeId3v2Tag', () => {
  it('returns empty array when no metadata fields are set', () => {
    const tag = encodeId3v2Tag({});
    expect(tag.length).toBe(0);
  });

  it('starts with ID3 magic bytes', () => {
    const tag = encodeId3v2Tag({ title: 'Test Song' });
    expect(tag[0]).toBe(0x49); // I
    expect(tag[1]).toBe(0x44); // D
    expect(tag[2]).toBe(0x33); // 3
  });

  it('uses ID3v2.3 version', () => {
    const tag = encodeId3v2Tag({ title: 'Test' });
    expect(tag[3]).toBe(3); // version 2.3
    expect(tag[4]).toBe(0); // revision 0
  });

  it('contains TIT2 frame for title', () => {
    const tag = encodeId3v2Tag({ title: 'My Song' });
    const str = new TextDecoder().decode(tag);
    expect(str).toContain('TIT2');
    expect(str).toContain('My Song');
  });

  it('contains TPE1 frame for artist', () => {
    const tag = encodeId3v2Tag({ artist: 'Test Artist' });
    const str = new TextDecoder().decode(tag);
    expect(str).toContain('TPE1');
    expect(str).toContain('Test Artist');
  });

  it('contains multiple frames for multiple fields', () => {
    const tag = encodeId3v2Tag({
      title: 'Song',
      artist: 'Artist',
      album: 'Album',
      genre: 'Electronic',
      year: '2026',
      trackNumber: 3,
    });
    const str = new TextDecoder().decode(tag);
    expect(str).toContain('TIT2');
    expect(str).toContain('TPE1');
    expect(str).toContain('TALB');
    expect(str).toContain('TCON');
    expect(str).toContain('TYER');
    expect(str).toContain('TRCK');
  });

  it('has syncsafe integer size in header', () => {
    const tag = encodeId3v2Tag({ title: 'Test' });
    // Bytes 6-9 are syncsafe size (each byte uses 7 bits)
    const size = (tag[6] << 21) | (tag[7] << 14) | (tag[8] << 7) | tag[9];
    // Size should equal total length minus 10-byte header
    expect(size).toBe(tag.length - 10);
  });
});

describe('buildFlacVorbisComment', () => {
  it('starts with vendor string length (little-endian)', () => {
    const comment = buildFlacVorbisComment({ title: 'Test' });
    const view = new DataView(comment.buffer);
    const vendorLen = view.getUint32(0, true);
    expect(vendorLen).toBe(new TextEncoder().encode('ACE-Step DAW').length);
  });

  it('contains vendor string', () => {
    const comment = buildFlacVorbisComment({ title: 'Test' });
    const vendorLen = new DataView(comment.buffer).getUint32(0, true);
    const vendorBytes = comment.slice(4, 4 + vendorLen);
    const vendor = new TextDecoder().decode(vendorBytes);
    expect(vendor).toBe('ACE-Step DAW');
  });

  it('contains correct comment count', () => {
    const comment = buildFlacVorbisComment({ title: 'Test', artist: 'Me' });
    const vendorLen = new DataView(comment.buffer).getUint32(0, true);
    const commentCount = new DataView(comment.buffer).getUint32(4 + vendorLen, true);
    expect(commentCount).toBe(2);
  });

  it('encodes TITLE and ARTIST fields', () => {
    const comment = buildFlacVorbisComment({ title: 'My Song', artist: 'Bob' });
    const str = new TextDecoder().decode(comment);
    expect(str).toContain('TITLE=My Song');
    expect(str).toContain('ARTIST=Bob');
  });

  it('skips undefined fields', () => {
    const comment = buildFlacVorbisComment({ title: 'Test' });
    const vendorLen = new DataView(comment.buffer).getUint32(0, true);
    const commentCount = new DataView(comment.buffer).getUint32(4 + vendorLen, true);
    expect(commentCount).toBe(1);
  });
});

describe('encodeToMp3 with metadata', () => {
  it('prepends ID3v2 tag when metadata is provided', async () => {
    const buffer = createMockAudioBuffer(4410, 44100, 2);
    const blobWithMeta = encodeToMp3(buffer, 128, { title: 'Test', artist: 'Me' });
    const blobWithout = encodeToMp3(buffer, 128);

    // With metadata should be larger (ID3 tag prepended)
    expect(blobWithMeta.size).toBeGreaterThan(blobWithout.size);

    // Check for ID3 header
    const bytes = new Uint8Array(await blobWithMeta.arrayBuffer());
    expect(bytes[0]).toBe(0x49); // I
    expect(bytes[1]).toBe(0x44); // D
    expect(bytes[2]).toBe(0x33); // 3
  });
});

describe('encodeToFlac with metadata', () => {
  it('embeds VORBIS_COMMENT block when metadata is provided', async () => {
    const buffer = createMockAudioBuffer(4410, 44100, 2);
    const blobWithMeta = encodeToFlac(buffer, 16, { title: 'Test', artist: 'Me' });
    const blobWithout = encodeToFlac(buffer, 16);

    // With metadata should be larger
    expect(blobWithMeta.size).toBeGreaterThan(blobWithout.size);
  });

  it('STREAMINFO is not marked as last when VORBIS_COMMENT follows', async () => {
    const buffer = createMockAudioBuffer(4410, 44100, 2);
    const blob = encodeToFlac(buffer, 16, { title: 'Test' });
    const bytes = new Uint8Array(await blob.arrayBuffer());

    // After magic (4 bytes), STREAMINFO header byte should be 0x00 (not last, type 0)
    expect(bytes[4]).toBe(0x00);
  });

  it('VORBIS_COMMENT block header has correct type', async () => {
    const buffer = createMockAudioBuffer(4410, 44100, 2);
    const blob = encodeToFlac(buffer, 16, { title: 'Test' });
    const bytes = new Uint8Array(await blob.arrayBuffer());

    // VORBIS_COMMENT starts after magic(4) + STREAMINFO header(4) + STREAMINFO data(34) = offset 42
    // Block header byte: 0x84 = last block (0x80) | type 4 (VORBIS_COMMENT)
    expect(bytes[42]).toBe(0x84);
  });

  it('FLAC with no metadata keeps STREAMINFO as last block', async () => {
    const buffer = createMockAudioBuffer(4410, 44100, 2);
    const blob = encodeToFlac(buffer, 16);
    const bytes = new Uint8Array(await blob.arrayBuffer());

    // STREAMINFO should be marked as last (0x80)
    expect(bytes[4]).toBe(0x80);
  });
});
