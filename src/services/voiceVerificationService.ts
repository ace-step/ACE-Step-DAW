/**
 * Voice Identity Verification Service
 *
 * Handles the verification flow for voice cloning consent:
 * 1. Display a random phrase for the user to read aloud
 * 2. Record the user's spoken phrase via microphone
 * 3. Submit both spoken and singing samples to backend for matching
 * 4. Return verification result (match/no-match)
 */

import type {
  VerificationPhrase,
  VerificationResult,
  VoiceVerifyRequest,
  VoiceVerifyResponse,
} from '../types/voiceVerification';
import { getBackendUrl } from './aceStepApi';
import { createDebugLogger } from '../utils/debugLogger';

const log = createDebugLogger('voice-verification');

/** Predefined verification phrases in multiple languages */
const VERIFICATION_PHRASES: VerificationPhrase[] = [
  { id: 'en-1', text: 'The quick brown fox jumps over the lazy dog near the riverbank.', language: 'en' },
  { id: 'en-2', text: 'She sells seashells by the seashore every sunny morning.', language: 'en' },
  { id: 'en-3', text: 'A journey of a thousand miles begins with a single step forward.', language: 'en' },
  { id: 'en-4', text: 'Music is the universal language that connects all hearts together.', language: 'en' },
  { id: 'en-5', text: 'Every artist was first an amateur learning to express themselves.', language: 'en' },
  { id: 'zh-1', text: '今天的天气非常好，阳光明媚，万里无云。', language: 'zh' },
  { id: 'zh-2', text: '音乐是连接所有心灵的通用语言。', language: 'zh' },
  { id: 'zh-3', text: '千里之行始于足下，每一步都很重要。', language: 'zh' },
];

/** Select a random phrase, optionally filtered by language */
export function getRandomPhrase(language?: string): VerificationPhrase {
  const candidates = language
    ? VERIFICATION_PHRASES.filter((p) => p.language === language)
    : VERIFICATION_PHRASES;
  const pool = candidates.length > 0 ? candidates : VERIFICATION_PHRASES;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Get all available phrases (for testing or custom selection) */
export function getAllPhrases(): readonly VerificationPhrase[] {
  return VERIFICATION_PHRASES;
}

function getApiBase(): string {
  const custom = getBackendUrl();
  if (custom && custom.trim()) {
    return custom.trim().replace(/\/+$/, '');
  }
  return '/api';
}

/** Convert a Blob to base64 string */
async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // Strip the data URL prefix (e.g., "data:audio/webm;base64,")
      const base64 = result.split(',')[1] || '';
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/** Detect audio format from MIME type string */
export function detectAudioFormat(mimeType: string): string {
  if (!mimeType) return 'webm';
  return mimeType.includes('wav') ? 'wav' : 'webm';
}

/**
 * Submit voice verification to backend.
 *
 * Sends both the spoken verification phrase recording and the singing
 * reference sample to the backend for voice matching.
 */
export async function submitVerification(
  phraseId: string,
  spokenAudio: Blob,
  singingAudio: Blob,
): Promise<VerificationResult> {
  const base = getApiBase();

  const [spokenBase64, singingBase64] = await Promise.all([
    blobToBase64(spokenAudio),
    blobToBase64(singingAudio),
  ]);

  const format = detectAudioFormat(spokenAudio.type);

  const body: VoiceVerifyRequest = {
    phrase_id: phraseId,
    spoken_audio: spokenBase64,
    singing_audio: singingBase64,
    audio_format: format,
  };

  log.info(`Submitting verification for phrase ${phraseId}`);

  const res = await fetch(`${base}/v1/voice_verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Voice verification failed: ${res.status} - ${text}`);
  }

  const json = await res.json();
  // Handle both direct response and ApiEnvelope format
  const data: VoiceVerifyResponse = json.data ?? json;

  return {
    verified: data.verified,
    confidence: data.confidence,
    message: data.message,
  };
}

/**
 * Voice recorder for the verification flow.
 *
 * Manages microphone access and recording for spoken verification phrases.
 * Uses MediaRecorder API with WebM Opus codec.
 */
export class VoiceRecorder {
  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private _isRecording = false;
  private _duration = 0;
  private durationInterval: ReturnType<typeof setInterval> | null = null;

  get isRecording(): boolean {
    return this._isRecording;
  }

  get duration(): number {
    return this._duration;
  }

  /** Check if MediaRecorder is available in the browser */
  static isSupported(): boolean {
    return typeof MediaRecorder !== 'undefined' && typeof navigator?.mediaDevices?.getUserMedia === 'function';
  }

  /**
   * Start recording from the microphone.
   * @param deviceId Optional specific microphone device ID
   */
  async startRecording(deviceId?: string | null): Promise<void> {
    if (this._isRecording) {
      throw new Error('Already recording');
    }

    const constraints: MediaStreamConstraints = {
      audio: deviceId ? { deviceId: { exact: deviceId } } : true,
    };

    this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';

    this.mediaRecorder = new MediaRecorder(this.mediaStream, { mimeType });
    this.chunks = [];
    this._duration = 0;

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        this.chunks.push(e.data);
      }
    };

    this.mediaRecorder.start(100); // Collect data every 100ms
    this._isRecording = true;

    this.durationInterval = setInterval(() => {
      this._duration += 0.1;
    }, 100);

    log.info('Voice recording started');
  }

  /**
   * Stop recording and return the audio blob.
   * @returns Promise that resolves to the recorded audio Blob
   */
  stopRecording(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder || !this._isRecording) {
        reject(new Error('Not recording'));
        return;
      }

      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.chunks, {
          type: this.mediaRecorder?.mimeType || 'audio/webm',
        });
        this.cleanup();
        log.info(`Voice recording stopped, ${blob.size} bytes`);
        resolve(blob);
      };

      this.mediaRecorder.onerror = (e) => {
        this.cleanup();
        reject(new Error(`Recording error: ${(e as ErrorEvent).message || 'unknown'}`));
      };

      this.mediaRecorder.stop();
    });
  }

  /** Release all resources */
  dispose(): void {
    if (this._isRecording && this.mediaRecorder) {
      try { this.mediaRecorder.stop(); } catch { /* ignore */ }
    }
    this.cleanup();
  }

  private cleanup(): void {
    this._isRecording = false;
    if (this.durationInterval) {
      clearInterval(this.durationInterval);
      this.durationInterval = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }
    this.mediaRecorder = null;
    this.chunks = [];
  }
}
