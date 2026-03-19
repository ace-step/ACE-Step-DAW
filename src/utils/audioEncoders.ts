/**
 * Audio encoding utilities for exporting to MP3, FLAC, and OGG formats.
 * WAV encoding lives in wav.ts (pre-existing).
 */

import { Mp3Encoder } from '@breezystack/lamejs';

export type ExportFormat = 'wav' | 'mp3' | 'flac' | 'ogg';
export type Mp3Bitrate = 128 | 192 | 256 | 320;
export type SampleRateOption = 44100 | 48000;
export type BitDepth = 16 | 24;

export interface ExportMetadata {
  title?: string;
  artist?: string;
  album?: string;
  trackNumber?: number;
  genre?: string;
  year?: string;
}

export interface ExportOptions {
  format: ExportFormat;
  sampleRate: SampleRateOption;
  bitDepth: BitDepth;
  mp3Bitrate: Mp3Bitrate;
  oggQuality: number; // 0.0 - 1.0
  metadata?: ExportMetadata;
}

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  format: 'wav',
  sampleRate: 48000,
  bitDepth: 16,
  mp3Bitrate: 320,
  oggQuality: 0.5,
};

/**
 * Convert float audio samples (-1..1) to Int16Array
 */
export function floatToInt16(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

/**
 * Encode an AudioBuffer to MP3 using lamejs.
 * Returns a Blob with type audio/mpeg.
 * Optionally prepends ID3v2 metadata tags.
 */
export function encodeToMp3(
  buffer: AudioBuffer,
  bitrate: Mp3Bitrate = 320,
  metadata?: ExportMetadata,
): Blob {
  const channels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const encoder = new Mp3Encoder(channels, sampleRate, bitrate);

  const left = floatToInt16(buffer.getChannelData(0));
  const right = channels >= 2 ? floatToInt16(buffer.getChannelData(1)) : left;

  const blockSize = 1152;
  const mp3Data: Uint8Array[] = [];

  // Prepend ID3v2 tag if metadata is provided
  if (metadata) {
    const id3Tag = encodeId3v2Tag(metadata);
    if (id3Tag.length > 0) {
      mp3Data.push(id3Tag);
    }
  }

  for (let i = 0; i < left.length; i += blockSize) {
    const leftChunk = left.subarray(i, i + blockSize);
    const rightChunk = right.subarray(i, i + blockSize);
    const encoded = encoder.encodeBuffer(leftChunk, rightChunk);
    if (encoded.length > 0) {
      mp3Data.push(encoded);
    }
  }

  const flushed = encoder.flush();
  if (flushed.length > 0) {
    mp3Data.push(flushed);
  }

  return new Blob(mp3Data as BlobPart[], { type: 'audio/mpeg' });
}

/**
 * Encode an AudioBuffer to FLAC format.
 *
 * FLAC encoding is done with a pure-JS implementation of the FLAC container format.
 * For browser compatibility, we write a valid FLAC bitstream with fixed-block-size
 * verbatim frames (i.e., uncompressed samples in a FLAC container).
 *
 * This produces valid FLAC files that any decoder can read. The files are slightly
 * larger than a fully compressed FLAC, but still benefit from the lossless container
 * metadata and universal decoder support.
 */
export function encodeToFlac(
  buffer: AudioBuffer,
  bitDepth: BitDepth = 16,
  metadata?: ExportMetadata,
): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const totalSamples = buffer.length;

  const channels: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channels.push(buffer.getChannelData(ch));
  }

  // Convert to integer samples
  const maxVal = bitDepth === 16 ? 0x7fff : 0x7fffff;
  const minVal = bitDepth === 16 ? -0x8000 : -0x800000;
  const intChannels: Int32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    const intData = new Int32Array(totalSamples);
    const floatData = channels[ch];
    for (let i = 0; i < totalSamples; i++) {
      const s = Math.max(-1, Math.min(1, floatData[i]));
      const v = Math.round(s * maxVal);
      intData[i] = Math.max(minVal, Math.min(maxVal, v));
    }
    intChannels.push(intData);
  }

  // Build FLAC file
  const parts: Uint8Array[] = [];

  // 1. Magic number: "fLaC"
  parts.push(new Uint8Array([0x66, 0x4c, 0x61, 0x43]));

  // 2. STREAMINFO metadata block
  const blockSize = 4096;
  const streaminfo = buildStreamInfo(
    blockSize,
    blockSize,
    0,
    0,
    sampleRate,
    numChannels,
    bitDepth,
    totalSamples,
  );

  // Build optional VORBIS_COMMENT block for metadata
  const vorbisComment = metadata ? buildFlacVorbisComment(metadata) : null;

  if (vorbisComment) {
    // STREAMINFO is NOT last (0x00 | type 0)
    parts.push(new Uint8Array([0x00, 0x00, 0x00, 0x22]));
    parts.push(streaminfo);

    // VORBIS_COMMENT is last (0x80 | type 4 = 0x84)
    const vcLen = vorbisComment.length;
    parts.push(new Uint8Array([
      0x84,
      (vcLen >> 16) & 0xff,
      (vcLen >> 8) & 0xff,
      vcLen & 0xff,
    ]));
    parts.push(vorbisComment);
  } else {
    // STREAMINFO is last (0x80 | type 0)
    parts.push(new Uint8Array([0x80, 0x00, 0x00, 0x22]));
    parts.push(streaminfo);
  }

  // 3. Audio frames — verbatim subframes
  let sampleOffset = 0;
  let frameNumber = 0;
  while (sampleOffset < totalSamples) {
    const frameSamples = Math.min(blockSize, totalSamples - sampleOffset);
    const frameData = buildVerbatimFrame(
      intChannels,
      sampleOffset,
      frameSamples,
      numChannels,
      sampleRate,
      bitDepth,
      frameNumber,
      frameSamples === blockSize,
    );
    parts.push(frameData);
    sampleOffset += frameSamples;
    frameNumber++;
  }

  return new Blob(parts as BlobPart[], { type: 'audio/flac' });
}

// ── FLAC internal helpers ──────────────────────────────────────────────

function buildStreamInfo(
  minBlockSize: number,
  maxBlockSize: number,
  minFrameSize: number,
  maxFrameSize: number,
  sampleRate: number,
  channels: number,
  bitsPerSample: number,
  totalSamples: number,
): Uint8Array {
  // STREAMINFO is 34 bytes
  const buf = new Uint8Array(34);
  const view = new DataView(buf.buffer);

  view.setUint16(0, minBlockSize);
  view.setUint16(2, maxBlockSize);

  // min/max frame size (3 bytes each)
  buf[4] = (minFrameSize >> 16) & 0xff;
  buf[5] = (minFrameSize >> 8) & 0xff;
  buf[6] = minFrameSize & 0xff;
  buf[7] = (maxFrameSize >> 16) & 0xff;
  buf[8] = (maxFrameSize >> 8) & 0xff;
  buf[9] = maxFrameSize & 0xff;

  // sample rate (20 bits) | channels-1 (3 bits) | bps-1 (5 bits) | total samples high 4 bits
  // Bytes 10-13
  const sr = sampleRate & 0xfffff;
  const ch = (channels - 1) & 0x7;
  const bps = (bitsPerSample - 1) & 0x1f;
  const totalHigh = (totalSamples / 0x100000000) & 0xf; // high 4 bits of 36-bit total

  buf[10] = (sr >> 12) & 0xff;
  buf[11] = (sr >> 4) & 0xff;
  buf[12] = ((sr & 0xf) << 4) | (ch << 1) | ((bps >> 4) & 1);
  buf[13] = ((bps & 0xf) << 4) | (totalHigh & 0xf);

  // total samples low 32 bits (bytes 14-17)
  const totalLow = totalSamples & 0xffffffff;
  view.setUint32(14, totalLow);

  // MD5 signature (16 bytes of zeros — we skip computing it)
  // bytes 18-33 are already 0

  return buf;
}

/**
 * A bit-level writer for constructing FLAC frames.
 */
class BitWriter {
  private bytes: number[] = [];
  private currentByte = 0;
  private bitPos = 0; // bits written in current byte (0-7)

  writeBits(value: number, numBits: number): void {
    for (let i = numBits - 1; i >= 0; i--) {
      this.currentByte = (this.currentByte << 1) | ((value >> i) & 1);
      this.bitPos++;
      if (this.bitPos === 8) {
        this.bytes.push(this.currentByte);
        this.currentByte = 0;
        this.bitPos = 0;
      }
    }
  }

  writeBytes(data: Uint8Array): void {
    for (let i = 0; i < data.length; i++) {
      this.writeBits(data[i], 8);
    }
  }

  /** Pad remaining bits in current byte with zeros */
  padToByte(): void {
    if (this.bitPos > 0) {
      this.currentByte <<= 8 - this.bitPos;
      this.bytes.push(this.currentByte);
      this.currentByte = 0;
      this.bitPos = 0;
    }
  }

  toUint8Array(): Uint8Array {
    const arr = new Uint8Array(this.bytes.length);
    arr.set(this.bytes);
    return arr;
  }
}

/**
 * Encode a UTF-8-like variable-length coded frame number as used in FLAC frames.
 */
function encodeUtf8FrameNumber(n: number): Uint8Array {
  if (n < 0x80) {
    return new Uint8Array([n]);
  } else if (n < 0x800) {
    return new Uint8Array([0xc0 | (n >> 6), 0x80 | (n & 0x3f)]);
  } else if (n < 0x10000) {
    return new Uint8Array([
      0xe0 | (n >> 12),
      0x80 | ((n >> 6) & 0x3f),
      0x80 | (n & 0x3f),
    ]);
  } else if (n < 0x200000) {
    return new Uint8Array([
      0xf0 | (n >> 18),
      0x80 | ((n >> 12) & 0x3f),
      0x80 | ((n >> 6) & 0x3f),
      0x80 | (n & 0x3f),
    ]);
  } else if (n < 0x4000000) {
    return new Uint8Array([
      0xf8 | (n >> 24),
      0x80 | ((n >> 18) & 0x3f),
      0x80 | ((n >> 12) & 0x3f),
      0x80 | ((n >> 6) & 0x3f),
      0x80 | (n & 0x3f),
    ]);
  } else {
    return new Uint8Array([
      0xfc | (n >> 30),
      0x80 | ((n >> 24) & 0x3f),
      0x80 | ((n >> 18) & 0x3f),
      0x80 | ((n >> 12) & 0x3f),
      0x80 | ((n >> 6) & 0x3f),
      0x80 | (n & 0x3f),
    ]);
  }
}

/** CRC-8 with polynomial 0x07 (FLAC frame header) */
function crc8(data: Uint8Array): number {
  let crc = 0;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      if (crc & 0x80) {
        crc = ((crc << 1) ^ 0x07) & 0xff;
      } else {
        crc = (crc << 1) & 0xff;
      }
    }
  }
  return crc;
}

/** CRC-16 with polynomial 0x8005 (FLAC frame footer) */
function crc16(data: Uint8Array): number {
  let crc = 0;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i] << 8;
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) {
        crc = ((crc << 1) ^ 0x8005) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc;
}

/**
 * Look up the FLAC block-size code for a given frame size.
 * Returns [code, extraBits, extraValue].
 * code 0b0110 = get 8-bit (blocksize-1) from end of header
 * code 0b0111 = get 16-bit (blocksize-1) from end of header
 */
function blockSizeCode(
  frameSamples: number,
  isFixed: boolean,
): [number, number, number] {
  // Standard block sizes from FLAC spec
  if (isFixed) {
    if (frameSamples === 192) return [0b0001, 0, 0];
    if (frameSamples === 576) return [0b0010, 0, 0];
    if (frameSamples === 1152) return [0b0011, 0, 0];
    if (frameSamples === 2304) return [0b0100, 0, 0];
    if (frameSamples === 4096) return [0b1000, 0, 0];
    if (frameSamples === 4608) return [0b0101, 0, 0];
    if (frameSamples === 8192) return [0b1001, 0, 0];
    if (frameSamples === 16384) return [0b1010, 0, 0];
    if (frameSamples === 32768) return [0b1011, 0, 0];
  }
  // Use 16-bit encoding for arbitrary sizes
  if (frameSamples <= 256) return [0b0110, 8, frameSamples - 1];
  return [0b0111, 16, frameSamples - 1];
}

function sampleRateCode(sr: number): [number, number, number] {
  if (sr === 44100) return [0b1001, 0, 0];
  if (sr === 48000) return [0b1010, 0, 0];
  if (sr === 88200) return [0b0001, 0, 0];
  if (sr === 96000) return [0b0010, 0, 0];
  // fallback: store in 16 bits (Hz)
  if (sr <= 0xffff) return [0b1100, 16, sr];
  // store in 16 bits (tens of Hz)
  return [0b1101, 16, Math.round(sr / 10)];
}

function bitsPerSampleCode(bps: number): number {
  if (bps === 8) return 0b001;
  if (bps === 12) return 0b010;
  if (bps === 16) return 0b100;
  if (bps === 20) return 0b101;
  if (bps === 24) return 0b110;
  return 0b000; // get from STREAMINFO
}

function buildVerbatimFrame(
  intChannels: Int32Array[],
  sampleOffset: number,
  frameSamples: number,
  numChannels: number,
  sampleRate: number,
  bitDepth: number,
  frameNumber: number,
  isFixedSize: boolean,
): Uint8Array {
  const writer = new BitWriter();

  // Frame header
  // Sync code: 14 bits = 0b11111111111110
  writer.writeBits(0b11111111111110, 14);
  // Reserved: 0
  writer.writeBits(0, 1);
  // Blocking strategy: 0 = fixed
  writer.writeBits(0, 1);

  // Block size code
  const [bsCode, bsExtraBits, bsExtraVal] = blockSizeCode(frameSamples, isFixedSize);
  writer.writeBits(bsCode, 4);

  // Sample rate code
  const [srCode, srExtraBits, srExtraVal] = sampleRateCode(sampleRate);
  writer.writeBits(srCode, 4);

  // Channel assignment: independent channels
  // For mono: 0b0000, for stereo: 0b0001
  writer.writeBits(numChannels - 1, 4);

  // Sample size
  writer.writeBits(bitsPerSampleCode(bitDepth), 3);

  // Reserved: 0
  writer.writeBits(0, 1);

  // Frame number (UTF-8 coded)
  writer.writeBytes(encodeUtf8FrameNumber(frameNumber));

  // Extra block-size bytes
  if (bsExtraBits > 0) {
    writer.writeBits(bsExtraVal, bsExtraBits);
  }

  // Extra sample-rate bytes
  if (srExtraBits > 0) {
    writer.writeBits(srExtraVal, srExtraBits);
  }

  // CRC-8 of header so far
  writer.padToByte();
  const headerSoFar = writer.toUint8Array();
  const crc = crc8(headerSoFar);
  writer.writeBits(crc, 8);

  // Subframes — one per channel, all verbatim
  for (let ch = 0; ch < numChannels; ch++) {
    // Subframe header: padding (1 bit = 0), subframe type VERBATIM (6 bits = 0b000001), no wasted bits (1 bit = 0)
    writer.writeBits(0, 1); // zero padding
    writer.writeBits(0b000001, 6); // SUBFRAME_VERBATIM
    writer.writeBits(0, 1); // no wasted bits flag

    // Write raw samples
    const data = intChannels[ch];
    for (let i = sampleOffset; i < sampleOffset + frameSamples; i++) {
      // Write as signed integer in bitDepth bits (two's complement)
      const val = data[i];
      // Mask to bitDepth bits
      const unsigned = val < 0 ? (1 << bitDepth) + val : val;
      writer.writeBits(unsigned, bitDepth);
    }
  }

  // Pad to byte boundary
  writer.padToByte();

  // Frame footer: CRC-16 of entire frame
  const frameData = writer.toUint8Array();
  const frameCrc = crc16(frameData);

  // Build final frame with CRC-16 appended
  const result = new Uint8Array(frameData.length + 2);
  result.set(frameData);
  result[frameData.length] = (frameCrc >> 8) & 0xff;
  result[frameData.length + 1] = frameCrc & 0xff;

  return result;
}

/**
 * Estimate file size for a given format and duration.
 * Returns size in bytes.
 */
export function estimateFileSize(
  durationSeconds: number,
  sampleRate: SampleRateOption,
  channels: number,
  options: Pick<ExportOptions, 'format' | 'bitDepth' | 'mp3Bitrate' | 'oggQuality'>,
): number {
  const { format, bitDepth, mp3Bitrate } = options;
  switch (format) {
    case 'wav':
      return Math.ceil(durationSeconds * sampleRate * channels * (bitDepth / 8)) + 44;
    case 'mp3':
      return Math.ceil(durationSeconds * (mp3Bitrate * 1000) / 8);
    case 'flac':
      // Verbatim FLAC is similar size to WAV, estimate ~70% of WAV
      return Math.ceil(durationSeconds * sampleRate * channels * (bitDepth / 8) * 0.7);
    case 'ogg': {
      // OGG Opus: quality maps to bitrate (~32-320 kbps)
      const quality = options.oggQuality ?? 0.5;
      const oggBitrate = 32000 + quality * 288000; // 32-320 kbps range
      return Math.ceil(durationSeconds * oggBitrate / 8);
    }
  }
}

/**
 * Format file size for display.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── OGG Opus encoding via MediaRecorder ────────────────────────────────

/**
 * Encode an AudioBuffer to OGG Opus format using the browser's MediaRecorder API.
 * Quality maps to audioBitsPerSecond (0.0 = 32kbps, 1.0 = 320kbps).
 *
 * Note: encoding takes approximately real-time duration since it uses MediaRecorder.
 * Chrome produces WebM/Opus containers; Firefox produces OGG/Opus natively.
 * Both are saved with audio/ogg MIME type for consistency.
 */
export async function encodeToOgg(
  buffer: AudioBuffer,
  quality: number = 0.5,
): Promise<Blob> {
  if (typeof globalThis.AudioContext === 'undefined') {
    throw new Error('OGG export requires AudioContext (not available in this environment)');
  }
  if (typeof globalThis.MediaRecorder === 'undefined') {
    throw new Error('OGG export requires MediaRecorder (not available in this environment)');
  }

  const clampedQuality = Math.max(0, Math.min(1, quality));
  const bitsPerSecond = Math.round(32000 + clampedQuality * 288000);

  // Determine best available MIME type
  const oggSupported = MediaRecorder.isTypeSupported('audio/ogg;codecs=opus');
  const webmSupported = MediaRecorder.isTypeSupported('audio/webm;codecs=opus');
  if (!oggSupported && !webmSupported) {
    throw new Error('Neither audio/ogg nor audio/webm Opus encoding is supported in this browser');
  }
  const mimeType = oggSupported ? 'audio/ogg;codecs=opus' : 'audio/webm;codecs=opus';

  const ctx = new AudioContext({ sampleRate: buffer.sampleRate });
  const dest = ctx.createMediaStreamDestination();
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(dest);

  const recorder = new MediaRecorder(dest.stream, {
    mimeType,
    audioBitsPerSecond: bitsPerSecond,
  });

  const chunks: Blob[] = [];

  return new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = (e: BlobEvent) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = () => {
      void ctx.close();
      resolve(new Blob(chunks, { type: 'audio/ogg' }));
    };

    recorder.onerror = () => {
      void ctx.close();
      reject(new Error('OGG encoding failed'));
    };

    recorder.start();
    source.start(0);

    source.onended = () => {
      // Small delay to ensure final audio data is captured
      setTimeout(() => recorder.stop(), 100);
    };
  });
}

// ── ID3v2 Tag Encoding for MP3 ────────────────────────────────────────

/**
 * Encode metadata as an ID3v2.3 tag.
 * Returns a Uint8Array that should be prepended to the MP3 data.
 */
export function encodeId3v2Tag(metadata: ExportMetadata): Uint8Array {
  const frames: Uint8Array[] = [];

  const addTextFrame = (id: string, value: string | undefined) => {
    if (!value) return;
    const encoder = new TextEncoder();
    const textBytes = encoder.encode(value);
    // Frame: 4-byte ID + 4-byte size + 2-byte flags + 1-byte encoding (3=UTF-8) + text
    const frameSize = 1 + textBytes.length;
    const frame = new Uint8Array(10 + frameSize);
    const idBytes = encoder.encode(id);
    frame.set(idBytes, 0);
    // Size (big-endian, 4 bytes, NOT syncsafe for frame size in ID3v2.3)
    frame[4] = (frameSize >> 24) & 0xff;
    frame[5] = (frameSize >> 16) & 0xff;
    frame[6] = (frameSize >> 8) & 0xff;
    frame[7] = frameSize & 0xff;
    // Flags: 0x00, 0x00
    frame[8] = 0;
    frame[9] = 0;
    // Encoding: 3 = UTF-8
    frame[10] = 3;
    // Text data
    frame.set(textBytes, 11);
    frames.push(frame);
  };

  addTextFrame('TIT2', metadata.title);
  addTextFrame('TPE1', metadata.artist);
  addTextFrame('TALB', metadata.album);
  addTextFrame('TCON', metadata.genre);
  addTextFrame('TYER', metadata.year);
  if (metadata.trackNumber !== undefined) {
    addTextFrame('TRCK', String(metadata.trackNumber));
  }

  if (frames.length === 0) return new Uint8Array(0);

  // Calculate total frames size
  let totalFrameSize = 0;
  for (const f of frames) totalFrameSize += f.length;

  // ID3v2 header: "ID3" + version (2.3) + flags + syncsafe size
  const header = new Uint8Array(10);
  const enc = new TextEncoder();
  header.set(enc.encode('ID3'), 0);
  header[3] = 3; // Version 2.3
  header[4] = 0; // Revision 0
  header[5] = 0; // Flags

  // Syncsafe integer: each byte uses 7 bits
  const size = totalFrameSize;
  header[6] = (size >> 21) & 0x7f;
  header[7] = (size >> 14) & 0x7f;
  header[8] = (size >> 7) & 0x7f;
  header[9] = size & 0x7f;

  // Combine header + frames
  const result = new Uint8Array(10 + totalFrameSize);
  result.set(header, 0);
  let offset = 10;
  for (const frame of frames) {
    result.set(frame, offset);
    offset += frame.length;
  }

  return result;
}

// ── FLAC VORBIS_COMMENT block ──────────────────────────────────────────

/**
 * Build a VORBIS_COMMENT data block for FLAC metadata.
 * Returns the raw block data (without the metadata block header).
 */
export function buildFlacVorbisComment(metadata: ExportMetadata): Uint8Array {
  const encoder = new TextEncoder();
  const vendor = 'ACE-Step DAW';
  const vendorBytes = encoder.encode(vendor);

  const comments: Uint8Array[] = [];
  const addComment = (key: string, value: string | undefined) => {
    if (!value) return;
    comments.push(encoder.encode(`${key}=${value}`));
  };

  addComment('TITLE', metadata.title);
  addComment('ARTIST', metadata.artist);
  addComment('ALBUM', metadata.album);
  addComment('GENRE', metadata.genre);
  addComment('DATE', metadata.year);
  if (metadata.trackNumber !== undefined) {
    addComment('TRACKNUMBER', String(metadata.trackNumber));
  }

  // Calculate total size
  let totalSize = 4 + vendorBytes.length + 4; // vendor length + vendor + comment count
  for (const c of comments) totalSize += 4 + c.length; // each comment: length + data

  const buf = new Uint8Array(totalSize);
  const view = new DataView(buf.buffer);
  let offset = 0;

  // Vendor string (little-endian length + UTF-8 string)
  view.setUint32(offset, vendorBytes.length, true);
  offset += 4;
  buf.set(vendorBytes, offset);
  offset += vendorBytes.length;

  // Comment count (little-endian)
  view.setUint32(offset, comments.length, true);
  offset += 4;

  // Comments (little-endian length + UTF-8 string each)
  for (const c of comments) {
    view.setUint32(offset, c.length, true);
    offset += 4;
    buf.set(c, offset);
    offset += c.length;
  }

  return buf;
}
