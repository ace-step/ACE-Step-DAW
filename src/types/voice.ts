/** Voice profile types for voice cloning feature (#1087) */

export interface VoiceProfile {
  id: string;
  name: string;
  /** How the voice sample was obtained */
  source: 'recording' | 'upload';
  /** MIME type of the audio */
  mimeType: string;
  /** Duration in seconds */
  duration: number;
  /** File size in bytes */
  fileSize: number;
  /** Waveform peaks for visual preview (0-1 normalized) */
  waveformPeaks: number[];
  createdAt: number;
  updatedAt: number;
}

/** Minimum recording duration in seconds */
export const MIN_VOICE_DURATION = 10;

/** Maximum recording/upload duration in seconds */
export const MAX_VOICE_DURATION = 300;

/** Maximum file size for voice uploads (50 MB) */
export const MAX_VOICE_FILE_SIZE = 50 * 1024 * 1024;

/** Accepted audio MIME types for voice upload */
export const ACCEPTED_VOICE_MIME_TYPES = [
  'audio/wav',
  'audio/x-wav',
  'audio/mpeg',
  'audio/mp3',
  'audio/flac',
  'audio/ogg',
  'audio/webm',
] as const;

/** File extensions matching the accepted MIME types */
export const ACCEPTED_VOICE_EXTENSIONS = '.wav,.mp3,.flac,.ogg,.webm';
