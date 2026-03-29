/**
 * WebCodecs-based WebM → MP4 converter.
 * Uses hardware-accelerated VideoEncoder/AudioEncoder + mp4-muxer.
 * No WASM download needed — uses browser-native codecs.
 *
 * @see https://github.com/ace-step/ACE-Step-DAW/issues/1187
 */
import { WebDemuxer, type WebAVStream, AVMediaType } from 'web-demuxer';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

// Resolve WASM path at build time via Vite's ?url import
import wasmUrl from 'web-demuxer/wasm-mini?url';

export interface ConvertToMp4Options {
  trimStart?: number;
  trimEnd?: number;
  onProgress?: (ratio: number) => void;
}

/**
 * Feature-detect whether the browser supports WebCodecs-based MP4 conversion.
 */
export async function canConvertToMp4(): Promise<boolean> {
  if (
    typeof VideoEncoder === 'undefined' ||
    typeof VideoDecoder === 'undefined' ||
    typeof AudioEncoder === 'undefined' ||
    typeof AudioDecoder === 'undefined'
  ) {
    return false;
  }

  try {
    const videoSupport = await VideoEncoder.isConfigSupported({
      codec: 'avc1.42001f',
      width: 1280,
      height: 720,
      bitrate: 2_500_000,
    });
    const audioSupport = await AudioEncoder.isConfigSupported({
      codec: 'mp4a.40.2',
      numberOfChannels: 2,
      sampleRate: 48000,
      bitrate: 128_000,
    });
    return !!(videoSupport.supported && audioSupport.supported);
  } catch {
    return false;
  }
}

/**
 * Convert a WebM blob to MP4 using WebCodecs API (hardware-accelerated).
 */
export async function convertWebmToMp4(
  inputBlob: Blob,
  options: ConvertToMp4Options = {},
): Promise<Blob> {
  const { trimStart = 0, trimEnd, onProgress } = options;

  // 1. Demux the WebM
  const demuxer = new WebDemuxer({ wasmFilePath: wasmUrl });
  const file = new File([inputBlob], 'input.webm', { type: 'video/webm' });
  await demuxer.load(file);

  const mediaInfo = await demuxer.getMediaInfo();
  const effectiveEnd = trimEnd ?? mediaInfo.duration;

  // Get stream info
  const videoStream = mediaInfo.streams.find(
    (s: WebAVStream) => s.codec_type === AVMediaType.AVMEDIA_TYPE_VIDEO,
  );
  const audioStream = mediaInfo.streams.find(
    (s: WebAVStream) => s.codec_type === AVMediaType.AVMEDIA_TYPE_AUDIO,
  );

  if (!videoStream) {
    demuxer.destroy();
    throw new Error('No video stream found in WebM file');
  }

  // 2. Set up MP4 muxer
  const muxerTarget = new ArrayBufferTarget();
  const muxer = new Muxer({
    target: muxerTarget,
    video: {
      codec: 'avc',
      width: videoStream.width,
      height: videoStream.height,
    },
    audio: audioStream
      ? {
          codec: 'aac',
          numberOfChannels: audioStream.channels,
          sampleRate: audioStream.sample_rate,
        }
      : undefined,
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
  });

  // Track progress
  const totalDuration = effectiveEnd - trimStart;
  let processedDuration = 0;

  // 3. Set up video encoder (VP9 → H.264)
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => {
      muxer.addVideoChunk(chunk, meta);
    },
    error: (e) => {
      throw new Error(`VideoEncoder error: ${e.message}`);
    },
  });

  videoEncoder.configure({
    codec: 'avc1.42001f',
    width: videoStream.width,
    height: videoStream.height,
    bitrate: 2_500_000,
    framerate: parseFrameRate(videoStream.avg_frame_rate || videoStream.r_frame_rate),
  });

  // 4. Set up video decoder (decode VP9 to raw frames)
  const videoDecoderConfig = await demuxer.getDecoderConfig('video');
  const videoDecoder = new VideoDecoder({
    output: (frame) => {
      const frameTimestampSec = frame.timestamp / 1_000_000;
      if (frameTimestampSec >= trimStart && frameTimestampSec <= effectiveEnd) {
        videoEncoder.encode(frame, { keyFrame: false });
        processedDuration = Math.max(processedDuration, frameTimestampSec - trimStart);
        onProgress?.(Math.min(processedDuration / totalDuration, 0.99));
      }
      frame.close();
    },
    error: (e) => {
      throw new Error(`VideoDecoder error: ${e.message}`);
    },
  });

  videoDecoder.configure(videoDecoderConfig);

  // 5. Set up audio pipeline if audio exists
  let audioEncoder: AudioEncoder | null = null;
  let audioDecoder: AudioDecoder | null = null;

  if (audioStream) {
    audioEncoder = new AudioEncoder({
      output: (chunk, meta) => {
        muxer.addAudioChunk(chunk, meta);
      },
      error: (e) => {
        throw new Error(`AudioEncoder error: ${e.message}`);
      },
    });

    audioEncoder.configure({
      codec: 'mp4a.40.2',
      numberOfChannels: audioStream.channels,
      sampleRate: audioStream.sample_rate,
      bitrate: 128_000,
    });

    const audioDecoderConfig = await demuxer.getDecoderConfig('audio');
    audioDecoder = new AudioDecoder({
      output: (audioData) => {
        const timestampSec = audioData.timestamp / 1_000_000;
        if (timestampSec >= trimStart && timestampSec <= effectiveEnd) {
          audioEncoder!.encode(audioData);
        }
        audioData.close();
      },
      error: (e) => {
        throw new Error(`AudioDecoder error: ${e.message}`);
      },
    });

    audioDecoder.configure(audioDecoderConfig);
  }

  // 6. Read and process packets
  // Process video
  const videoReader = demuxer.read('video', trimStart, effectiveEnd).getReader();
  try {
    while (true) {
      const { done, value } = await videoReader.read();
      if (done) break;
      videoDecoder.decode(value);
      // Prevent queue buildup
      if (videoDecoder.decodeQueueSize > 10) {
        await new Promise<void>((resolve) => {
          const check = () => {
            if (videoDecoder.decodeQueueSize <= 5) resolve();
            else setTimeout(check, 1);
          };
          check();
        });
      }
    }
  } finally {
    videoReader.releaseLock();
  }

  // Process audio
  if (audioDecoder && audioStream) {
    const audioReader = demuxer.read('audio', trimStart, effectiveEnd).getReader();
    try {
      while (true) {
        const { done, value } = await audioReader.read();
        if (done) break;
        audioDecoder.decode(value as EncodedAudioChunk);
        if (audioDecoder.decodeQueueSize > 10) {
          await new Promise<void>((resolve) => {
            const check = () => {
              if (audioDecoder!.decodeQueueSize <= 5) resolve();
              else setTimeout(check, 1);
            };
            check();
          });
        }
      }
    } finally {
      audioReader.releaseLock();
    }
  }

  // 7. Flush and finalize
  await videoDecoder.flush();
  await videoEncoder.flush();
  if (audioDecoder) await audioDecoder.flush();
  if (audioEncoder) await audioEncoder.flush();

  muxer.finalize();

  // Cleanup
  videoDecoder.close();
  videoEncoder.close();
  audioDecoder?.close();
  audioEncoder?.close();
  demuxer.destroy();

  onProgress?.(1);

  return new Blob([muxerTarget.buffer], { type: 'video/mp4' });
}

function parseFrameRate(frStr: string): number {
  if (!frStr || frStr === '0/0') return 30;
  const parts = frStr.split('/');
  if (parts.length === 2) {
    const num = parseInt(parts[0], 10);
    const den = parseInt(parts[1], 10);
    if (den > 0) return num / den;
  }
  const parsed = parseFloat(frStr);
  return isNaN(parsed) || parsed <= 0 ? 30 : parsed;
}
