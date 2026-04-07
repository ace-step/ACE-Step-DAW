/**
 * Voice Identity Verification types.
 *
 * Used to verify that a user has the right to create a voice profile
 * by comparing spoken verification phrases against singing samples.
 */

/** Status of a voice verification attempt */
export type VerificationStatus =
  | 'idle'
  | 'recording'
  | 'submitting'
  | 'verified'
  | 'rejected'
  | 'error';

/** A phrase the user must read aloud for verification */
export interface VerificationPhrase {
  id: string;
  text: string;
  language: string;
}

/** Result from the backend verification endpoint */
export interface VerificationResult {
  verified: boolean;
  confidence: number;
  message: string;
}

/** State of the voice verification flow */
export interface VoiceVerificationState {
  status: VerificationStatus;
  /** The phrase currently displayed for the user to read */
  currentPhrase: VerificationPhrase | null;
  /** Recorded spoken audio blob */
  spokenAudioBlob: Blob | null;
  /** Reference singing audio blob (from voice profile creation) */
  singingAudioBlob: Blob | null;
  /** Result from the verification API */
  result: VerificationResult | null;
  /** Error message if verification failed */
  error: string | null;
  /** Recording duration in seconds */
  recordingDuration: number;
  /** Number of retry attempts */
  retryCount: number;
}

/** Settings for voice verification */
export interface VoiceVerificationSettings {
  /** Whether verification is enabled (can be disabled for self-hosted) */
  enabled: boolean;
  /** Microphone device ID to use for recording */
  micDeviceId: string | null;
  /** Minimum recording duration in seconds */
  minRecordingDurationSec: number;
  /** Maximum retry attempts before lockout */
  maxRetries: number;
}

/** Request payload for POST /v1/voice_verify */
export interface VoiceVerifyRequest {
  /** The phrase ID the user was asked to read */
  phrase_id: string;
  /** Base64-encoded spoken audio */
  spoken_audio: string;
  /** Base64-encoded singing/reference audio */
  singing_audio: string;
  /** Audio format (e.g., 'webm', 'wav') */
  audio_format: string;
}

/** Response from POST /v1/voice_verify */
export interface VoiceVerifyResponse {
  verified: boolean;
  confidence: number;
  message: string;
}
