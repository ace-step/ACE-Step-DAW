import type { VoiceSource } from '../types/voice';

/** Accepted audio MIME types for voice upload. */
export const VOICE_ACCEPTED_TYPES = ['audio/wav', 'audio/mpeg', 'audio/mp3', 'audio/flac', 'audio/x-flac', 'audio/ogg', 'audio/webm'];

/** Accepted file extensions for voice upload. */
export const VOICE_ACCEPTED_EXTENSIONS = '.wav,.mp3,.flac,.ogg,.webm';

/** Minimum voice sample duration in seconds. */
export const VOICE_MIN_DURATION_SECONDS = 5;

export interface VoiceUploadResult {
  blob: Blob;
  name: string;
  durationSeconds: number;
  waveformPeaks: number[];
  source: VoiceSource;
}

export interface VoiceUploadError {
  type: 'invalid_type' | 'too_short' | 'decode_error';
  message: string;
}

/**
 * Validate and process an audio file for use as a voice profile.
 * Returns the processed blob, duration, and waveform peaks.
 */
export async function processVoiceAudioFile(
  file: File,
  audioContext: AudioContext | OfflineAudioContext,
): Promise<VoiceUploadResult | VoiceUploadError> {
  // Validate file type
  const isValidType = VOICE_ACCEPTED_TYPES.includes(file.type) ||
    /\.(wav|mp3|flac|ogg|webm)$/i.test(file.name);
  if (!isValidType) {
    return {
      type: 'invalid_type',
      message: `Unsupported file type: ${file.type || file.name}. Use WAV, MP3, FLAC, OGG, or WebM.`,
    };
  }

  // Decode audio
  let audioBuffer: AudioBuffer;
  try {
    const arrayBuffer = await file.arrayBuffer();
    audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  } catch {
    return {
      type: 'decode_error',
      message: `Could not decode audio file: ${file.name}`,
    };
  }

  // Validate duration
  if (audioBuffer.duration < VOICE_MIN_DURATION_SECONDS) {
    return {
      type: 'too_short',
      message: `Voice sample must be at least ${VOICE_MIN_DURATION_SECONDS} seconds. This file is ${Math.round(audioBuffer.duration)}s.`,
    };
  }

  // Compute simple waveform peaks for thumbnail (64 peaks)
  const numPeaks = 64;
  const peaks = computeSimplePeaks(audioBuffer, numPeaks);

  const name = file.name.replace(/\.[^.]+$/, '');

  return {
    blob: file,
    name,
    durationSeconds: audioBuffer.duration,
    waveformPeaks: peaks,
    source: 'upload',
  };
}

/**
 * Compute simplified amplitude peaks for waveform thumbnails.
 * Returns array of absolute amplitude values (0–1).
 */
export function computeSimplePeaks(audioBuffer: AudioBuffer, numPeaks: number): number[] {
  const channelData = audioBuffer.getChannelData(0);
  const samplesPerPeak = Math.floor(channelData.length / numPeaks);
  if (samplesPerPeak <= 0) return new Array(numPeaks).fill(0);

  const peaks: number[] = new Array(numPeaks);
  for (let i = 0; i < numPeaks; i++) {
    let max = 0;
    const start = i * samplesPerPeak;
    const end = Math.min(start + samplesPerPeak, channelData.length);
    for (let j = start; j < end; j++) {
      const abs = Math.abs(channelData[j]);
      if (abs > max) max = abs;
    }
    peaks[i] = max;
  }
  return peaks;
}

/** Check if a result is an error. */
export function isVoiceUploadError(result: VoiceUploadResult | VoiceUploadError): result is VoiceUploadError {
  return 'type' in result && 'message' in result && !('blob' in result);
}
