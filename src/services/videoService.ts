import type { VideoClipData } from '../types/project';
import { saveVideoBlob } from './videoStorageService';
import { toastError, toastInfo, toastSuccess } from '../hooks/useToast';

/** Maximum file size for video import (500 MB). */
export const MAX_VIDEO_FILE_SIZE = 500 * 1024 * 1024;

/** Size threshold for showing progress indicator (10 MB). */
export const VIDEO_PROGRESS_THRESHOLD = 10 * 1024 * 1024;

/** Metadata extracted from a video file. */
export interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  frameRate: number;
  codec: string;
  isIntraCodec: boolean;
  gopSize: number;
  hasAudio: boolean;
  fileSize: number;
}

/** Accepted video MIME types. */
const VIDEO_MIME_TYPES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska',
]);

/** Accepted video file extensions. */
const VIDEO_EXTENSIONS = /\.(mp4|mov|webm|mkv|avi|m4v)$/i;

/**
 * Check if a file is a video file.
 * Prefers MIME type when available; falls back to extension only when MIME is empty/unknown.
 */
export function isVideoFile(file: File): boolean {
  const mimeType = file.type.trim().toLowerCase();
  if (mimeType) {
    return VIDEO_MIME_TYPES.has(mimeType);
  }
  return VIDEO_EXTENSIONS.test(file.name);
}

/**
 * Known intra-frame codec identifiers.
 * Intra-frame codecs encode each frame independently — better scrub performance.
 */
const INTRA_CODEC_PATTERNS = [
  // Apple ProRes variants
  'apcn', 'apcs', 'apch', 'ap4h', 'ap4x',
  // Avid DNxHD/DNxHR
  'avdn',
  // Motion JPEG
  'mjp2', 'mjpa', 'mjpb',
  // Photo-JPEG
  'jpeg',
];

/**
 * Classify whether a codec string represents an intra-frame codec.
 */
export function isIntraFrameCodec(codec: string): boolean {
  const lower = codec.toLowerCase();
  return INTRA_CODEC_PATTERNS.some((pattern) => lower.includes(pattern));
}

/**
 * Extract video metadata using HTMLVideoElement.
 * This works in any browser without additional dependencies.
 */
export async function extractVideoMetadata(file: File): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;

    const objectURL = URL.createObjectURL(file);

    const cleanup = () => {
      URL.revokeObjectURL(objectURL);
      video.removeAttribute('src');
      video.load();
    };

    // Timeout after 10 seconds
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Video metadata extraction timed out'));
    }, 10_000);

    video.onloadedmetadata = () => {
      clearTimeout(timeout);
      const metadata: VideoMetadata = {
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
        frameRate: 30, // Default; refined by mp4box in future
        codec: detectCodecFromMimeType(file.type),
        isIntraCodec: false,
        gopSize: 15, // Default assumption for inter-frame
        hasAudio: hasAudioTrack(video),
        fileSize: file.size,
      };

      metadata.isIntraCodec = isIntraFrameCodec(metadata.codec);
      if (metadata.isIntraCodec) {
        metadata.gopSize = 1;
      }

      cleanup();
      resolve(metadata);
    };

    video.onerror = () => {
      clearTimeout(timeout);
      cleanup();
      reject(new Error(`Cannot read video file: ${file.name}`));
    };

    video.src = objectURL;
  });
}

/**
 * Detect basic codec from MIME type. Will be refined when mp4box.js is integrated.
 */
function detectCodecFromMimeType(mimeType: string): string {
  switch (mimeType) {
    case 'video/mp4':
      return 'avc1'; // H.264 is the most common
    case 'video/webm':
      return 'vp9';
    case 'video/quicktime':
      return 'avc1'; // MOV often uses H.264
    default:
      return 'unknown';
  }
}

/**
 * Check if a video element has an audio track.
 */
function hasAudioTrack(video: HTMLVideoElement): boolean {
  // HTMLMediaElement.audioTracks is available in some browsers
  const audioTracks = (video as any).audioTracks;
  if (audioTracks && typeof audioTracks.length === 'number') {
    return audioTracks.length > 0;
  }
  // Fallback: assume audio present for common containers
  return true;
}

/**
 * Validate a video file for import. Returns null if valid, or an error message string.
 */
export function validateVideoFile(file: File): string | null {
  if (file.size > MAX_VIDEO_FILE_SIZE) {
    return `File too large (${(file.size / 1024 / 1024).toFixed(0)} MB). Maximum is 500 MB.`;
  }
  if (!isVideoFile(file)) {
    return `Unsupported format: ${file.type || file.name}. Supported: MP4, WebM, MOV, MKV, AVI, M4V.`;
  }
  return null;
}

/**
 * Check if a video codec is supported in this browser via WebCodecs API.
 * Falls back to canPlayType check if WebCodecs is unavailable.
 */
export async function isCodecSupported(codec: string, width: number, height: number): Promise<boolean> {
  // Try WebCodecs VideoDecoder.isConfigSupported()
  if (typeof VideoDecoder !== 'undefined') {
    try {
      const result = await VideoDecoder.isConfigSupported({
        codec,
        codedWidth: width,
        codedHeight: height,
      });
      return result.supported === true;
    } catch {
      // Fall through to canPlayType
    }
  }

  // Fallback: HTMLVideoElement canPlayType
  const video = document.createElement('video');
  const mimeMap: Record<string, string> = {
    avc1: 'video/mp4; codecs="avc1.64001f"',
    vp9: 'video/webm; codecs="vp9"',
    vp8: 'video/webm; codecs="vp8"',
    av01: 'video/mp4; codecs="av01.0.01M.08"',
  };
  const mimeString = mimeMap[codec] ?? `video/mp4; codecs="${codec}"`;
  const result = video.canPlayType(mimeString);
  return result === 'probably' || result === 'maybe';
}

/**
 * Full video import flow:
 * 1. Validate file size and format
 * 2. Extract metadata
 * 3. Show performance warning for long-GOP H.264
 * 4. Store in IndexedDB
 * 5. Return VideoClipData for clip creation
 */
export async function importVideoFile(
  file: File,
  projectId: string,
  clipId: string,
): Promise<VideoClipData> {
  // 1. Validate
  const validationError = validateVideoFile(file);
  if (validationError) {
    throw new Error(validationError);
  }

  // 2. Show progress for large files
  if (file.size > VIDEO_PROGRESS_THRESHOLD) {
    toastInfo('Processing video metadata...');
  }

  // 3. Extract metadata
  const metadata = await extractVideoMetadata(file);

  // 4. Validate codec support
  const codecSupported = await isCodecSupported(metadata.codec, metadata.width, metadata.height);
  if (!codecSupported) {
    throw new Error(
      `Unsupported video codec: ${metadata.codec}. ` +
      'This browser cannot decode this video format. Try re-encoding as H.264 (MP4) or VP9 (WebM).',
    );
  }

  // 5. Performance warning for long-GOP H.264
  if (!metadata.isIntraCodec && metadata.gopSize > 1) {
    toastInfo(
      `This video uses inter-frame compression (${metadata.codec}, GOP=${metadata.gopSize}). ` +
      'Scrubbing may be slow. For best performance, transcode to an all-intra codec (ProRes, DNxHD) ' +
      'or H.264 with keyframe interval = 1.',
      8000,
    );
  }

  // 5. Audio stream info
  if (metadata.hasAudio) {
    toastInfo('Video contains an audio stream (stripped on import, audio stays on separate tracks).');
  }

  // 6. Store in IndexedDB
  const videoFileKey = await saveVideoBlob(projectId, clipId, file);

  // 7. Build VideoClipData
  const videoData: VideoClipData = {
    videoFileKey,
    originalFileName: file.name,
    width: metadata.width,
    height: metadata.height,
    frameRate: metadata.frameRate,
    codec: metadata.codec,
    isIntraCodec: metadata.isIntraCodec,
    gopSize: metadata.gopSize,
    fileDuration: metadata.duration,
    sourceOffset: 0,
    hasAudio: metadata.hasAudio,
  };

  toastSuccess(`Video imported: ${file.name} (${metadata.width}x${metadata.height}, ${metadata.duration.toFixed(1)}s)`);

  return videoData;
}
