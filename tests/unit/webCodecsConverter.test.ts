import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Track mock instances for assertions
let mockDemuxerInstance: Record<string, ReturnType<typeof vi.fn>>;
let mockMuxerInstance: Record<string, ReturnType<typeof vi.fn>>;
let mockMuxerBuffer: ArrayBuffer;

vi.mock('web-demuxer/wasm-mini?url', () => ({ default: '/fake-wasm.wasm' }));

vi.mock('web-demuxer', () => {
  const AVMediaType = { AVMEDIA_TYPE_VIDEO: 0, AVMEDIA_TYPE_AUDIO: 1 };
  class MockWebDemuxer {
    constructor() {
      Object.assign(this, mockDemuxerInstance);
    }
  }
  return { WebDemuxer: MockWebDemuxer, AVMediaType };
});

vi.mock('mp4-muxer', () => {
  class MockMuxer {
    target: unknown;
    constructor(opts: { target: unknown }) {
      this.target = opts.target;
      Object.assign(this, mockMuxerInstance);
    }
  }
  class MockArrayBufferTarget {
    buffer: ArrayBuffer;
    constructor() {
      this.buffer = mockMuxerBuffer;
    }
  }
  return { Muxer: MockMuxer, ArrayBufferTarget: MockArrayBufferTarget };
});

function createDefaultDemuxer() {
  return {
    load: vi.fn().mockResolvedValue(undefined),
    getMediaInfo: vi.fn().mockResolvedValue({
      duration: 10,
      streams: [
        { codec_type: 0, width: 1280, height: 720, channels: 0, sample_rate: 0, avg_frame_rate: '30/1', r_frame_rate: '30/1' },
        { codec_type: 1, width: 0, height: 0, channels: 2, sample_rate: 48000, avg_frame_rate: '', r_frame_rate: '' },
      ],
    }),
    getDecoderConfig: vi.fn().mockImplementation((type: string) => {
      if (type === 'video') return Promise.resolve({ codec: 'vp09.00.10.08' });
      return Promise.resolve({ codec: 'opus', numberOfChannels: 2, sampleRate: 48000 });
    }),
    read: vi.fn().mockImplementation(() => {
      return new ReadableStream({
        start(controller) { controller.close(); },
      });
    }),
    destroy: vi.fn(),
  };
}

function setupWebCodecsGlobals() {
  function makeCodec() {
    return {
      configure: vi.fn(),
      encode: vi.fn(),
      decode: vi.fn(),
      flush: vi.fn().mockResolvedValue(undefined),
      close: vi.fn(),
      encodeQueueSize: 0,
      decodeQueueSize: 0,
    };
  }

  (globalThis as Record<string, unknown>).VideoEncoder = function VideoEncoder() {
    Object.assign(this, makeCodec());
  };
  (globalThis as Record<string, unknown>).VideoDecoder = function VideoDecoder() {
    Object.assign(this, makeCodec());
  };
  (globalThis as Record<string, unknown>).AudioEncoder = function AudioEncoder() {
    Object.assign(this, makeCodec());
  };
  (globalThis as Record<string, unknown>).AudioDecoder = function AudioDecoder() {
    Object.assign(this, makeCodec());
  };
}

describe('webCodecsConverter', () => {
  let canConvertToMp4: typeof import('../../src/services/webCodecsConverter').canConvertToMp4;
  let convertWebmToMp4: typeof import('../../src/services/webCodecsConverter').convertWebmToMp4;

  beforeEach(async () => {
    vi.resetModules();
    mockMuxerBuffer = new ArrayBuffer(100);
    mockDemuxerInstance = createDefaultDemuxer();
    mockMuxerInstance = {
      addVideoChunk: vi.fn(),
      addAudioChunk: vi.fn(),
      finalize: vi.fn(),
    };

    const mod = await import('../../src/services/webCodecsConverter');
    canConvertToMp4 = mod.canConvertToMp4;
    convertWebmToMp4 = mod.convertWebmToMp4;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as Record<string, unknown>).VideoEncoder;
    delete (globalThis as Record<string, unknown>).VideoDecoder;
    delete (globalThis as Record<string, unknown>).AudioEncoder;
    delete (globalThis as Record<string, unknown>).AudioDecoder;
  });

  describe('canConvertToMp4', () => {
    it('returns false when WebCodecs APIs are missing', async () => {
      expect(await canConvertToMp4()).toBe(false);
    });

    it('returns false when H.264 encoding is not supported', async () => {
      (globalThis as Record<string, unknown>).VideoEncoder = {
        isConfigSupported: vi.fn().mockResolvedValue({ supported: false }),
      };
      (globalThis as Record<string, unknown>).VideoDecoder = {};
      (globalThis as Record<string, unknown>).AudioEncoder = {
        isConfigSupported: vi.fn().mockResolvedValue({ supported: true }),
      };
      (globalThis as Record<string, unknown>).AudioDecoder = {};

      expect(await canConvertToMp4()).toBe(false);
    });

    it('returns false when AAC encoding is not supported', async () => {
      (globalThis as Record<string, unknown>).VideoEncoder = {
        isConfigSupported: vi.fn().mockResolvedValue({ supported: true }),
      };
      (globalThis as Record<string, unknown>).VideoDecoder = {};
      (globalThis as Record<string, unknown>).AudioEncoder = {
        isConfigSupported: vi.fn().mockResolvedValue({ supported: false }),
      };
      (globalThis as Record<string, unknown>).AudioDecoder = {};

      expect(await canConvertToMp4()).toBe(false);
    });

    it('returns true when both H.264 and AAC are supported', async () => {
      (globalThis as Record<string, unknown>).VideoEncoder = {
        isConfigSupported: vi.fn().mockResolvedValue({ supported: true }),
      };
      (globalThis as Record<string, unknown>).VideoDecoder = {};
      (globalThis as Record<string, unknown>).AudioEncoder = {
        isConfigSupported: vi.fn().mockResolvedValue({ supported: true }),
      };
      (globalThis as Record<string, unknown>).AudioDecoder = {};

      expect(await canConvertToMp4()).toBe(true);
    });

    it('returns false when isConfigSupported throws', async () => {
      (globalThis as Record<string, unknown>).VideoEncoder = {
        isConfigSupported: vi.fn().mockRejectedValue(new Error('fail')),
      };
      (globalThis as Record<string, unknown>).VideoDecoder = {};
      (globalThis as Record<string, unknown>).AudioEncoder = {
        isConfigSupported: vi.fn().mockResolvedValue({ supported: true }),
      };
      (globalThis as Record<string, unknown>).AudioDecoder = {};

      expect(await canConvertToMp4()).toBe(false);
    });
  });

  describe('convertWebmToMp4', () => {
    it('returns an MP4 blob', async () => {
      setupWebCodecsGlobals();
      const blob = new Blob(['fake-webm'], { type: 'video/webm' });
      const result = await convertWebmToMp4(blob);

      expect(result).toBeInstanceOf(Blob);
      expect(result.type).toBe('video/mp4');
    });

    it('calls demuxer.read with correct trim range', async () => {
      setupWebCodecsGlobals();
      const blob = new Blob(['fake-webm'], { type: 'video/webm' });

      await convertWebmToMp4(blob, { trimStart: 2, trimEnd: 8 });

      expect(mockDemuxerInstance.read).toHaveBeenCalledWith('video', 2, 8);
      expect(mockDemuxerInstance.read).toHaveBeenCalledWith('audio', 2, 8);
    });

    it('reports progress ending at 1', async () => {
      setupWebCodecsGlobals();
      const blob = new Blob(['fake-webm'], { type: 'video/webm' });
      const progressValues: number[] = [];

      await convertWebmToMp4(blob, {
        onProgress: (ratio) => progressValues.push(ratio),
      });

      expect(progressValues[progressValues.length - 1]).toBe(1);
    });

    it('cleans up demuxer on completion', async () => {
      setupWebCodecsGlobals();
      const blob = new Blob(['fake-webm'], { type: 'video/webm' });

      await convertWebmToMp4(blob);

      expect(mockDemuxerInstance.destroy).toHaveBeenCalled();
    });

    it('finalizes the muxer', async () => {
      setupWebCodecsGlobals();
      const blob = new Blob(['fake-webm'], { type: 'video/webm' });

      await convertWebmToMp4(blob);

      expect(mockMuxerInstance.finalize).toHaveBeenCalled();
    });

    it('throws when no video stream is found', async () => {
      setupWebCodecsGlobals();
      mockDemuxerInstance.getMediaInfo = vi.fn().mockResolvedValue({
        duration: 10,
        streams: [
          { codec_type: 1, width: 0, height: 0, channels: 2, sample_rate: 48000 },
        ],
      });

      const blob = new Blob(['fake-webm'], { type: 'video/webm' });
      await expect(convertWebmToMp4(blob)).rejects.toThrow('No video stream found');
    });
  });
});
