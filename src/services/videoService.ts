/**
 * Video file validation, format detection, and codec classification.
 * Phase 2 of the video track epic (#1144).
 */

/** Supported video file extensions. */
export const SUPPORTED_VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mov', '.avi', '.mkv'] as const;

/** Supported MIME types for video files. */
const SUPPORTED_VIDEO_MIME_TYPES = [
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska',
];

/** Maximum video file size: 500 MB. */
export const VIDEO_MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024;

/** File size threshold for showing a progress indicator. */
export const VIDEO_LARGE_FILE_THRESHOLD = 10 * 1024 * 1024;

export interface CodecClassification {
  /** Normalized codec family name. */
  codecFamily: string;
  /** True if the codec is intra-frame only (every frame is a keyframe). */
  isIntraOnly: boolean;
  /** Whether performance warnings should be shown for this codec. */
  performanceWarning?: string;
}

export interface VideoValidationResult {
  valid: boolean;
  error?: string;
}

/** Check if a File is a video file based on MIME type or extension. */
export function isVideoFile(file: File): boolean {
  if (SUPPORTED_VIDEO_MIME_TYPES.includes(file.type)) return true;
  const ext = '.' + file.name.split('.').pop()?.toLowerCase();
  return (SUPPORTED_VIDEO_EXTENSIONS as readonly string[]).includes(ext);
}

/** Classify a codec string into a family with intra/inter classification. */
export function classifyCodec(codecString: string): CodecClassification {
  const lower = codecString.toLowerCase();

  // H.264 / AVC
  if (lower.startsWith('avc') || lower.startsWith('h264') || lower === 'h.264') {
    return {
      codecFamily: 'h264',
      isIntraOnly: false,
      performanceWarning: 'H.264 with long GOP may cause slow scrubbing. Consider ProRes or MJPEG for editing.',
    };
  }

  // H.265 / HEVC
  if (lower.startsWith('hev') || lower.startsWith('hvc') || lower.startsWith('h265') || lower === 'h.265') {
    return { codecFamily: 'h265', isIntraOnly: false };
  }

  // VP9
  if (lower.startsWith('vp09') || lower.startsWith('vp9')) {
    return { codecFamily: 'vp9', isIntraOnly: false };
  }

  // VP8
  if (lower.startsWith('vp08') || lower.startsWith('vp8')) {
    return { codecFamily: 'vp8', isIntraOnly: false };
  }

  // AV1
  if (lower.startsWith('av01') || lower === 'av1') {
    return { codecFamily: 'av1', isIntraOnly: false };
  }

  // ProRes (intra-frame only)
  if (lower.startsWith('ap4') || lower.startsWith('apcn') || lower.startsWith('apcs') || lower.startsWith('apch') || lower === 'prores') {
    return { codecFamily: 'prores', isIntraOnly: true };
  }

  // MJPEG (intra-frame only)
  if (lower.startsWith('mjp') || lower === 'jpeg' || lower === 'mjpeg') {
    return { codecFamily: 'mjpeg', isIntraOnly: true };
  }

  // DNxHD / DNxHR (intra-frame only)
  if (lower.startsWith('dnx') || lower.startsWith('avdh')) {
    return { codecFamily: 'dnxhd', isIntraOnly: true };
  }

  return { codecFamily: 'unknown', isIntraOnly: false };
}

/** Validate a video file for import. */
export function validateVideoFile(file: File): VideoValidationResult {
  if (!isVideoFile(file)) {
    return {
      valid: false,
      error: `Unsupported file format. Accepted: ${SUPPORTED_VIDEO_EXTENSIONS.join(', ')}`,
    };
  }

  if (file.size > VIDEO_MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `File too large (${Math.round(file.size / 1024 / 1024)}MB). Maximum size is 500MB.`,
    };
  }

  return { valid: true };
}

export interface VideoMetadataResult {
  width: number;
  height: number;
  duration: number;
  /**
   * Codec string from container parser. Empty string when only HTMLVideoElement
   * probing is available — call sites should treat '' as "unknown" and not rely
   * on this for codec classification. Full mp4box parsing is planned for a future PR.
   */
  codec: string;
  /**
   * Frame rate estimate. Defaults to 30 when only HTMLVideoElement probing is
   * available — accurate values require container parsing (mp4box). Call sites
   * should treat this as an estimate, not authoritative.
   */
  frameRate: number;
  /**
   * Whether the video has an audio stream. May be false-negative in browsers
   * that don't support HTMLVideoElement.audioTracks (most browsers). Accurate
   * detection requires container parsing (mp4box).
   */
  hasAudioStream: boolean;
}

/**
 * Extract metadata from a video file using an HTMLVideoElement probe.
 * This loads just enough of the file to read dimensions and duration.
 *
 * **Limitations**: codec, frameRate, and hasAudioStream are estimates only.
 * Accurate values require container-level parsing (mp4box) which is planned
 * for a future PR. Width, height, and duration are reliable from this probe.
 */
export function extractVideoMetadata(file: File): Promise<VideoMetadataResult> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;

    const url = URL.createObjectURL(file);

    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.removeAttribute('src');
      video.load();
    };

    video.addEventListener('loadedmetadata', () => {
      // audioTracks is non-standard; most browsers don't support it.
      // Default to false — accurate detection needs container parsing.
      const videoEl = video as unknown as { audioTracks?: { length: number } };
      const hasAudio = (videoEl.audioTracks?.length ?? 0) > 0;

      const metadata: VideoMetadataResult = {
        width: video.videoWidth,
        height: video.videoHeight,
        duration: video.duration,
        codec: '',    // Requires mp4box container parsing (future PR)
        frameRate: 30, // Estimate; requires container parsing for accuracy
        hasAudioStream: hasAudio,
      };
      cleanup();
      resolve(metadata);
    }, { once: true });

    video.addEventListener('error', () => {
      cleanup();
      reject(new Error(`Failed to load video metadata: ${video.error?.message ?? 'unknown error'}`));
    }, { once: true });

    video.src = url;
  });
}
